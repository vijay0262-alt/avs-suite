/**
 * Duplicate Analyzer — comprehensive duplicate analysis.
 *
 * Generates:
 *   • Duplicate Score (0–100)
 *   • Duplicate Issues
 *   • Duplicate Insights
 *   • Recoverable Space
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  DuplicateGroup,
  DuplicateAnalysisResult,
  DuplicateHealthIssue,
} from './types';
import {
  formatBytes,
  LARGE_GROUP_THRESHOLD,
  MANY_DUPLICATES_THRESHOLD,
  LARGE_WASTED_SPACE_THRESHOLD,
} from './types';
import { DuplicateIndex } from './duplicateIndex';
import { duplicateEvents } from './duplicateEvents';

export class DuplicateAnalyzer {
  private _index: DuplicateIndex;

  constructor(index?: DuplicateIndex) {
    this._index = index ?? new DuplicateIndex();
  }

  analyze(): DuplicateAnalysisResult {
    const groups = this._index.getGroups();
    const totalDuplicateFiles = groups.reduce((sum, g) => sum + g.duplicateFiles.length, 0);
    const totalWastedSpace = groups.reduce((sum, g) => sum + g.wastedSpace, 0);
    const totalGroups = groups.length;

    const issues = this._identifyIssues(groups, totalDuplicateFiles, totalWastedSpace);
    const score = this._calculateScore(issues);
    const insights = this._generateInsights(groups, totalDuplicateFiles, totalWastedSpace);
    const largestGroups = this._index.getLargestGroups(10);
    const recoverableSpace = totalWastedSpace;

    const result: DuplicateAnalysisResult = {
      score,
      issues,
      insights,
      totalDuplicateFiles,
      totalWastedSpace,
      totalGroups,
      largestGroups,
      recoverableSpace,
      analyzedAt: new Date().toISOString(),
    };

    duplicateEvents.emit('duplicate_scan_completed', {
      result: {
        groups,
        totalFilesScanned: 0,
        totalDuplicates: totalDuplicateFiles,
        totalWastedSpace,
        totalGroups,
        scanDurationMs: 0,
        scannedAt: result.analyzedAt,
        errors: [],
        fromCache: false,
        cancelled: false,
      },
    });

    return result;
  }

  private _identifyIssues(
    groups: DuplicateGroup[],
    totalDuplicateFiles: number,
    totalWastedSpace: number,
  ): DuplicateHealthIssue[] {
    const issues: DuplicateHealthIssue[] = [];

    if (totalWastedSpace >= LARGE_WASTED_SPACE_THRESHOLD) {
      issues.push({
        title: 'Large amount of wasted space from duplicates',
        description: `${formatBytes(totalWastedSpace)} recoverable by removing duplicate files.`,
        severity: 'high',
        impact: 25,
        autoFixable: true,
        affectedPaths: groups.flatMap((g) => g.duplicateFiles.map((f) => f.path)),
      });
    } else if (totalWastedSpace >= 100 * 1024 * 1024) {
      issues.push({
        title: 'Moderate wasted space from duplicates',
        description: `${formatBytes(totalWastedSpace)} recoverable by removing duplicate files.`,
        severity: 'medium',
        impact: 12,
        autoFixable: true,
        affectedPaths: groups.flatMap((g) => g.duplicateFiles.map((f) => f.path)),
      });
    }

    if (totalDuplicateFiles > MANY_DUPLICATES_THRESHOLD) {
      issues.push({
        title: 'Excessive duplicate files',
        description: `${totalDuplicateFiles} duplicate files detected across ${groups.length} groups.`,
        severity: 'medium',
        impact: 10,
        autoFixable: true,
        affectedPaths: [],
      });
    }

    const largeGroups = groups.filter((g) => g.fileCount >= LARGE_GROUP_THRESHOLD);
    if (largeGroups.length > 0) {
      issues.push({
        title: `${largeGroups.length} large duplicate groups`,
        description: `${largeGroups.length} groups have ${LARGE_GROUP_THRESHOLD}+ copies of the same file.`,
        severity: 'low',
        impact: 5,
        autoFixable: true,
        affectedPaths: largeGroups.flatMap((g) => g.duplicateFiles.map((f) => f.path)),
      });
    }

    const lowConfidenceGroups = groups.filter((g) => g.confidence === 'low');
    if (lowConfidenceGroups.length > 0) {
      issues.push({
        title: `${lowConfidenceGroups.length} low-confidence duplicate groups`,
        description: 'Some duplicate groups have low confidence and require manual review.',
        severity: 'low',
        impact: 3,
        autoFixable: false,
        affectedPaths: lowConfidenceGroups.flatMap((g) => g.duplicateFiles.map((f) => f.path)),
      });
    }

    return issues;
  }

  private _calculateScore(issues: DuplicateHealthIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      score -= issue.impact;
    }
    return Math.max(0, Math.min(100, score));
  }

  private _generateInsights(
    groups: DuplicateGroup[],
    totalDuplicateFiles: number,
    totalWastedSpace: number,
  ): string[] {
    const insights: string[] = [];
    insights.push(`Found ${groups.length} duplicate groups with ${totalDuplicateFiles} duplicate files.`);
    insights.push(`${formatBytes(totalWastedSpace)} of wasted space can be recovered.`);

    if (groups.length > 0) {
      const largest = groups.reduce((max, g) => (g.wastedSpace > max.wastedSpace ? g : max));
      insights.push(`Largest duplicate group: ${formatBytes(largest.wastedSpace)} wasted (${largest.fileCount} copies).`);
    }

    const byExtension = new Map<string, number>();
    for (const group of groups) {
      for (const file of group.duplicateFiles) {
        byExtension.set(file.extension, (byExtension.get(file.extension) ?? 0) + 1);
      }
    }
    const topExt = Array.from(byExtension.entries()).sort((a, b) => b[1]! - a[1]!).slice(0, 3);
    if (topExt.length > 0) {
      insights.push(`Most duplicated file types: ${topExt.map((e) => `.${e[0]} (${e[1]})`).join(', ')}.`);
    }

    return insights;
  }
}

export const duplicateAnalyzer = new DuplicateAnalyzer();
