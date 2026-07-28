/**
 * Duplicate Recommendation Engine — generates recommendations
 * from duplicate analysis.
 *
 * 6 recommendation types:
 *   • Remove duplicates
 *   • Keep newest
 *   • Keep oldest
 *   • Keep shortest path
 *   • Keep largest folder
 *   • Manual review
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  DuplicateGroup,
  DuplicateRecommendation,
  DuplicateRecommendationType,
  RecommendationPriority,
  DuplicateConfidence,
} from './types';
import { generateRecId, formatBytes } from './types';
import { DuplicateIndex } from './duplicateIndex';

export class DuplicateRecommendationEngine {
  private _index: DuplicateIndex;

  constructor(index?: DuplicateIndex) {
    this._index = index ?? new DuplicateIndex();
  }

  generate(): DuplicateRecommendation[] {
    const groups = this._index.getGroups();
    const recs: DuplicateRecommendation[] = [];

    for (const group of groups) {
      if (group.confidence === 'high') {
        recs.push(this._createRemoveDuplicates(group));
        recs.push(this._createKeepNewest(group));
        recs.push(this._createKeepOldest(group));
        recs.push(this._createKeepShortestPath(group));
        recs.push(this._createKeepLargestFolder(group));
      } else if (group.confidence === 'medium') {
        recs.push(this._createManualReview(group, 'medium'));
        recs.push(this._createKeepNewest(group));
      } else {
        recs.push(this._createManualReview(group, 'low'));
      }
    }

    const priorityOrder: Record<RecommendationPriority, number> = {
      critical: 0, high: 1, medium: 2, low: 3,
    };
    recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recs;
  }

  filterByType(recs: DuplicateRecommendation[], type: DuplicateRecommendationType): DuplicateRecommendation[] {
    return recs.filter((r) => r.type === type);
  }

  getReviewRequired(recs: DuplicateRecommendation[]): DuplicateRecommendation[] {
    return recs.filter((r) => r.reviewRequired);
  }

  getAutoFixable(recs: DuplicateRecommendation[]): DuplicateRecommendation[] {
    return recs.filter((r) => !r.reviewRequired);
  }

  getHighPriority(recs: DuplicateRecommendation[]): DuplicateRecommendation[] {
    return recs.filter((r) => r.priority === 'high' || r.priority === 'critical');
  }

  private _createRemoveDuplicates(group: DuplicateGroup): DuplicateRecommendation {
    return {
      id: generateRecId(),
      type: 'remove_duplicates',
      title: `Remove ${group.duplicateFiles.length} duplicate files`,
      description: `Remove all duplicate copies of "${group.primaryFile.name}". Recover ${formatBytes(group.wastedSpace)}.`,
      estimatedRecovery: group.wastedSpace,
      risk: 'low',
      priority: group.wastedSpace > 1024 * 1024 * 1024 ? 'high' : 'medium',
      confidence: group.confidence,
      reviewRequired: true,
      affectedGroupIds: [group.id],
      affectedFileCount: group.duplicateFiles.length,
    };
  }

  private _createKeepNewest(group: DuplicateGroup): DuplicateRecommendation {
    const sorted = [...group.allFiles].sort((a, b) =>
      new Date(b.modifiedDate).getTime() - new Date(a.modifiedDate).getTime(),
    );
    const toRemove = sorted.slice(1);
    return {
      id: generateRecId(),
      type: 'keep_newest',
      title: `Keep newest copy of "${group.primaryFile.name}"`,
      description: `Keep the most recently modified copy and remove ${toRemove.length} older duplicates.`,
      estimatedRecovery: group.wastedSpace,
      risk: 'low',
      priority: 'medium',
      confidence: group.confidence,
      reviewRequired: true,
      affectedGroupIds: [group.id],
      affectedFileCount: toRemove.length,
    };
  }

  private _createKeepOldest(group: DuplicateGroup): DuplicateRecommendation {
    const sorted = [...group.allFiles].sort((a, b) =>
      new Date(a.modifiedDate).getTime() - new Date(b.modifiedDate).getTime(),
    );
    const toRemove = sorted.slice(1);
    return {
      id: generateRecId(),
      type: 'keep_oldest',
      title: `Keep oldest copy of "${group.primaryFile.name}"`,
      description: `Keep the original copy and remove ${toRemove.length} newer duplicates.`,
      estimatedRecovery: group.wastedSpace,
      risk: 'low',
      priority: 'low',
      confidence: group.confidence,
      reviewRequired: true,
      affectedGroupIds: [group.id],
      affectedFileCount: toRemove.length,
    };
  }

  private _createKeepShortestPath(group: DuplicateGroup): DuplicateRecommendation {
    return {
      id: generateRecId(),
      type: 'keep_shortest_path',
      title: `Keep shortest path copy of "${group.primaryFile.name}"`,
      description: `Keep the copy with the shortest file path (likely the most accessible location).`,
      estimatedRecovery: group.wastedSpace,
      risk: 'low',
      priority: 'low',
      confidence: group.confidence,
      reviewRequired: true,
      affectedGroupIds: [group.id],
      affectedFileCount: group.duplicateFiles.length,
    };
  }

  private _createKeepLargestFolder(group: DuplicateGroup): DuplicateRecommendation {
    return {
      id: generateRecId(),
      type: 'keep_largest_folder',
      title: `Keep copy in largest folder of "${group.primaryFile.name}"`,
      description: `Keep the copy in the folder with the most files (likely the primary storage location).`,
      estimatedRecovery: group.wastedSpace,
      risk: 'medium',
      priority: 'low',
      confidence: group.confidence,
      reviewRequired: true,
      affectedGroupIds: [group.id],
      affectedFileCount: group.duplicateFiles.length,
    };
  }

  private _createManualReview(group: DuplicateGroup, confidence: DuplicateConfidence): DuplicateRecommendation {
    return {
      id: generateRecId(),
      type: 'manual_review',
      title: `Review duplicate group: "${group.primaryFile.name}"`,
      description: `This group has ${confidence} confidence. Manual review required before removal.`,
      estimatedRecovery: group.wastedSpace,
      risk: 'medium',
      priority: confidence === 'low' ? 'low' : 'medium',
      confidence,
      reviewRequired: true,
      affectedGroupIds: [group.id],
      affectedFileCount: group.duplicateFiles.length,
    };
  }
}

export const duplicateRecommendationEngine = new DuplicateRecommendationEngine();
