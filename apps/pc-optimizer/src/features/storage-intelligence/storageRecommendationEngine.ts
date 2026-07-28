/**
 * Storage Recommendation Engine — generates cleanup recommendations
 * from storage analysis results.
 *
 * Each recommendation includes:
 *   • Estimated recovery (bytes)
 *   • Risk level (none/low/medium/high)
 *   • Priority (critical/high/medium/low)
 *   • Reason
 *   • Affected paths
 *   • Whether auto-fixable or review-required
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  StorageAnalysis,
  StorageRecommendation,
  RecommendationType,
  RiskLevel,
  RecommendationPriority,
} from './types';
import { storageEvents } from './storageEvents';

let _recCounter = 0;

function generateRecId(): string {
  _recCounter += 1;
  return `storage-rec-${Date.now().toString(36)}-${_recCounter}`;
}

export class StorageRecommendationEngine {
  /**
   * Generate recommendations from a storage analysis.
   */
  generate(analysis: StorageAnalysis): StorageRecommendation[] {
    const recommendations: StorageRecommendation[] = [];

    // Empty folder cleanup
    if (analysis.emptyFolders.length > 0) {
      const totalSize = 0; // Empty folders have no size
      recommendations.push(this._createRecommendation(
        'empty_folder_cleanup',
        'Empty Folder Cleanup',
        `${analysis.emptyFolders.length} empty folders can be removed to organize your storage.`,
        totalSize,
        'none',
        'low',
        'Empty folders take no space but clutter navigation.',
        analysis.emptyFolders.map((f) => f.path),
        analysis.emptyFolders.length,
        true,
        false,
      ));
    }

    // Old log cleanup
    const logFiles = analysis.cleanupCandidates.filter(
      (f) => f.extension === 'log' || f.flags.includes('temporary'),
    );
    if (logFiles.length > 0) {
      const totalSize = logFiles.reduce((sum, f) => sum + f.size, 0);
      recommendations.push(this._createRecommendation(
        'old_log_cleanup',
        'Old Log File Cleanup',
        `${logFiles.length} log and temporary files can be safely removed.`,
        totalSize,
        'none',
        'medium',
        'Log and temporary files are safe to delete and accumulate over time.',
        logFiles.map((f) => f.path),
        logFiles.length,
        true,
        false,
      ));
    }

    // Temp cleanup
    const tempFiles = analysis.cleanupCandidates.filter(
      (f) => f.category === 'temporary',
    );
    if (tempFiles.length > 0) {
      const totalSize = tempFiles.reduce((sum, f) => sum + f.size, 0);
      recommendations.push(this._createRecommendation(
        'temp_cleanup',
        'Temporary File Cleanup',
        `${tempFiles.length} temporary files consuming ${this._formatBytes(totalSize)}.`,
        totalSize,
        'none',
        'high',
        'Temporary files are safe to remove and free up disk space.',
        tempFiles.map((f) => f.path).slice(0, 100),
        tempFiles.length,
        true,
        false,
      ));
    }

    // Old installer cleanup
    const installers = analysis.cleanupCandidates.filter(
      (f) => f.flags.includes('old_installer'),
    );
    if (installers.length > 0) {
      const totalSize = installers.reduce((sum, f) => sum + f.size, 0);
      recommendations.push(this._createRecommendation(
        'old_installer_cleanup',
        'Old Installer Cleanup',
        `${installers.length} installer files consuming ${this._formatBytes(totalSize)}.`,
        totalSize,
        'low',
        'medium',
        'Old installers are rarely needed after installation.',
        installers.map((f) => f.path),
        installers.length,
        false,
        true,
      ));
    }

    // Download cleanup
    const downloads = analysis.cleanupCandidates.filter(
      (f) => f.flags.includes('in_downloads'),
    );
    if (downloads.length > 0) {
      const totalSize = downloads.reduce((sum, f) => sum + f.size, 0);
      recommendations.push(this._createRecommendation(
        'download_cleanup',
        'Download Folder Cleanup',
        `${downloads.length} files in Downloads consuming ${this._formatBytes(totalSize)}.`,
        totalSize,
        'low',
        'medium',
        'Downloads accumulate files that are often no longer needed.',
        downloads.map((f) => f.path),
        downloads.length,
        false,
        true,
      ));
    }

    // Large file cleanup (review only)
    if (analysis.largestFiles.length > 0) {
      const largeFiles = analysis.largestFiles.filter(
        (lf) => lf.entry.size > 100 * 1024 * 1024,
      );
      if (largeFiles.length > 0) {
        const totalSize = largeFiles.reduce((sum, lf) => sum + lf.entry.size, 0);
        recommendations.push(this._createRecommendation(
          'large_file_cleanup',
          'Large File Review',
          `${largeFiles.length} large files consuming ${this._formatBytes(totalSize)}.`,
          totalSize,
          'high',
          'low',
          'Large files should be reviewed before deletion.',
          largeFiles.map((lf) => lf.entry.path),
          largeFiles.length,
          false,
          true,
        ));
      }
    }

    // Duplicate cleanup (placeholder)
    if (analysis.duplicateGroups.length > 0) {
      const totalWasted = analysis.duplicateGroups.reduce((sum, g) => sum + g.wastedSpace, 0);
      recommendations.push(this._createRecommendation(
        'duplicate_cleanup',
        'Duplicate File Cleanup',
        `${analysis.duplicateGroups.length} duplicate groups wasting ${this._formatBytes(totalWasted)}.`,
        totalWasted,
        'medium',
        'medium',
        'Duplicate files waste storage space.',
        analysis.duplicateGroups.flatMap((g) => g.entries.map((e) => e.path)),
        analysis.duplicateGroups.reduce((sum, g) => sum + g.entries.length, 0),
        false,
        true,
      ));
    }

    // Cache cleanup
    const cacheFiles = analysis.cleanupCandidates.filter(
      (f) => f.flags.includes('cached'),
    );
    if (cacheFiles.length > 0) {
      const totalSize = cacheFiles.reduce((sum, f) => sum + f.size, 0);
      recommendations.push(this._createRecommendation(
        'cache_cleanup',
        'Application Cache Cleanup',
        `${cacheFiles.length} cache files consuming ${this._formatBytes(totalSize)}.`,
        totalSize,
        'low',
        'low',
        'Application caches can be safely rebuilt.',
        cacheFiles.map((f) => f.path),
        cacheFiles.length,
        true,
        false,
      ));
    }

    // Sort by priority
    const priorityOrder: Record<RecommendationPriority, number> = {
      critical: 0, high: 1, medium: 2, low: 3,
    };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    storageEvents.emit('storage_recommendations_generated', { recommendations });
    return recommendations;
  }

  /**
   * Get recommendations by type.
   */
  filterByType(recommendations: StorageRecommendation[], type: RecommendationType): StorageRecommendation[] {
    return recommendations.filter((r) => r.type === type);
  }

  /**
   * Get auto-fixable recommendations only.
   */
  getAutoFixable(recommendations: StorageRecommendation[]): StorageRecommendation[] {
    return recommendations.filter((r) => r.autoFixable);
  }

  /**
   * Get review-required recommendations only.
   */
  getReviewRequired(recommendations: StorageRecommendation[]): StorageRecommendation[] {
    return recommendations.filter((r) => r.reviewRequired);
  }

  /**
   * Calculate total estimated recovery from all recommendations.
   */
  getTotalEstimatedRecovery(recommendations: StorageRecommendation[]): number {
    return recommendations.reduce((sum, r) => sum + r.estimatedRecovery, 0);
  }

  // ── Internal ────────────────────────────────────────────────

  private _createRecommendation(
    type: RecommendationType,
    title: string,
    description: string,
    estimatedRecovery: number,
    risk: RiskLevel,
    priority: RecommendationPriority,
    reason: string,
    affectedPaths: string[],
    affectedFileCount: number,
    autoFixable: boolean,
    reviewRequired: boolean,
  ): StorageRecommendation {
    return {
      id: generateRecId(),
      type,
      title,
      description,
      estimatedRecovery,
      risk,
      priority,
      reason,
      affectedPaths,
      affectedFileCount,
      autoFixable,
      reviewRequired,
    };
  }

  private _formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }
}

export const storageRecommendationEngine = new StorageRecommendationEngine();
