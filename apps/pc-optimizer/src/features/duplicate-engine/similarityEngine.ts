/**
 * Similarity Engine — analyzes similarity between files.
 *
 * Supports:
 *   • Exact duplicates (same hash)
 *   • Same filename + size
 *   • Same content (full hash match)
 *   • Near-duplicate placeholder
 *
 * Future:
 *   • Image similarity
 *   • Document similarity
 *
 * This module does NOT modify any existing architecture.
 */
import type { DuplicateGroup, DuplicateFile, SimilarityResult } from './types';

export class SimilarityEngine {
  analyze(group: DuplicateGroup): SimilarityResult {
    if (group.hash && group.reason === 'exact_hash') {
      return {
        type: 'exact',
        confidence: 'high',
        score: 100,
        reason: 'Files have identical content (hash match)',
      };
    }

    const nameScore = this._compareNames(group.allFiles);
    const sizeScore = this._compareSizes(group.allFiles);

    if (nameScore === 100 && sizeScore === 100) {
      return {
        type: 'same_filename',
        confidence: 'high',
        score: 95,
        reason: 'Files have the same name and size',
      };
    }

    if (sizeScore === 100) {
      return {
        type: 'same_content',
        confidence: 'medium',
        score: 75,
        reason: 'Files have the same size, content verification recommended',
      };
    }

    if (nameScore >= 80) {
      return {
        type: 'near_duplicate',
        confidence: 'low',
        score: nameScore,
        reason: 'Files have similar names, manual review recommended',
      };
    }

    return {
      type: 'near_duplicate',
      confidence: 'low',
      score: Math.max(nameScore, sizeScore),
      reason: 'Files may be near-duplicates, manual review required',
    };
  }

  analyzePair(fileA: DuplicateFile, fileB: DuplicateFile): SimilarityResult {
    if (fileA.hash && fileB.hash && fileA.hash === fileB.hash) {
      return {
        type: 'exact',
        confidence: 'high',
        score: 100,
        reason: 'Identical content hash',
      };
    }

    const nameScore = this._compareTwoNames(fileA.name, fileB.name);
    const sizeMatch = fileA.size === fileB.size;

    if (fileA.name === fileB.name && sizeMatch) {
      return {
        type: 'same_filename',
        confidence: 'high',
        score: 95,
        reason: 'Same filename and size',
      };
    }

    if (sizeMatch && nameScore >= 50) {
      return {
        type: 'same_content',
        confidence: 'medium',
        score: 75,
        reason: 'Same size with similar names',
      };
    }

    if (nameScore >= 80) {
      return {
        type: 'near_duplicate',
        confidence: 'low',
        score: nameScore,
        reason: 'Similar filenames',
      };
    }

    return {
      type: 'near_duplicate',
      confidence: 'low',
      score: Math.max(nameScore, sizeMatch ? 50 : 0),
      reason: 'Possible near-duplicate',
    };
  }

  findSimilarFiles(target: DuplicateFile, candidates: DuplicateFile[], threshold: number = 50): DuplicateFile[] {
    const results: Array<{ file: DuplicateFile; score: number }> = [];
    for (const candidate of candidates) {
      if (candidate.id === target.id) continue;
      const result = this.analyzePair(target, candidate);
      if (result.score >= threshold) {
        results.push({ file: candidate, score: result.score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.map((r) => r.file);
  }

  private _compareNames(files: DuplicateFile[]): number {
    if (files.length < 2) return 100;
    const firstName = files[0]!.name.toLowerCase();
    return files.every((f) => f.name.toLowerCase() === firstName) ? 100 : 0;
  }

  private _compareSizes(files: DuplicateFile[]): number {
    if (files.length < 2) return 100;
    const firstSize = files[0]!.size;
    return files.every((f) => f.size === firstSize) ? 100 : 0;
  }

  private _compareTwoNames(nameA: string, nameB: string): number {
    const a = nameA.toLowerCase();
    const b = nameB.toLowerCase();
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 85;
    const longer = a.length >= b.length ? a : b;
    const shorter = a.length >= b.length ? b : a;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer[i] === shorter[i]) matches++;
    }
    return Math.round((matches / longer.length) * 100);
  }
}

export const similarityEngine = new SimilarityEngine();
