/**
 * Startup Analyzer — generates a complete analysis of the
 * system's startup configuration.
 *
 * Produces:
 *   • Total/enabled/disabled counts
 *   • Estimated boot time impact
 *   • High-impact applications
 *   • Duplicate startup entries
 *   • Missing executables
 *   • Unsigned applications
 *   • Protected applications
 *   • Startup health score
 *   • Estimated boot improvement
 *   • Recommendations
 *
 * Also provides health contribution data for the AI Health Engine
 * without modifying its architecture.
 */
import type {
  StartupEntry,
  StartupAnalysis,
  StartupRecommendation,
  StartupHealthContribution,
  StartupHealthIssue,
} from './types';
import { StartupImpactCalculator } from './startupImpactCalculator';
import { startupEvents } from './startupEvents';

export class StartupAnalyzer {
  private _impactCalculator: StartupImpactCalculator;

  constructor(impactCalculator?: StartupImpactCalculator) {
    this._impactCalculator = impactCalculator ?? new StartupImpactCalculator();
  }

  /**
   * Analyze startup entries and produce a complete report.
   */
  analyze(entries: StartupEntry[]): StartupAnalysis {
    const enabled = entries.filter((e) => e.enabled);
    const disabled = entries.filter((e) => !e.enabled);

    // Calculate impacts for enabled entries
    const impacts = this._impactCalculator.calculateAll(enabled);
    const totalBootImpact = impacts.reduce((sum, i) => sum + i.bootDelayMs, 0);

    // High impact entries (high or very_high, enabled)
    const highImpactEntries = enabled.filter((e) => {
      const impact = impacts.find((i) => i.entryId === e.id);
      return impact && (impact.level === 'high' || impact.level === 'very_high');
    });

    // Duplicate entries (same executable path, different sources)
    const duplicateEntries = this._findDuplicates(entries);

    // Missing executables
    const missingExecutables = entries.filter((e) => !e.executableExists);

    // Unsigned entries
    const unsignedEntries = entries.filter(
      (e) => e.signatureStatus === 'unsigned' || e.signatureStatus === 'unknown',
    );

    // Protected entries
    const protectedEntries = entries.filter((e) => e.isProtected);

    // Calculate health score
    const healthScore = this._calculateHealthScore(entries, impacts);

    // Generate recommendations
    const recommendations = this._generateRecommendations(
      entries,
      impacts,
      highImpactEntries,
      missingExecutables,
      unsignedEntries,
      duplicateEntries,
    );

    // Estimate boot improvement if all recommendations are applied
    const estimatedBootImprovementMs = recommendations.reduce(
      (sum, r) => sum + r.estimatedImprovementMs,
      0,
    );

    const analysis: StartupAnalysis = {
      totalEntries: entries.length,
      enabledCount: enabled.length,
      disabledCount: disabled.length,
      estimatedBootImpactMs: totalBootImpact,
      highImpactEntries,
      duplicateEntries,
      missingExecutables,
      unsignedEntries,
      protectedEntries,
      healthScore,
      estimatedBootImprovementMs,
      recommendations,
      analyzedAt: new Date().toISOString(),
    };

    startupEvents.emit('startup_analysis_completed', {
      analysis,
      timestamp: analysis.analyzedAt,
    });

    return analysis;
  }

  /**
   * Generate health contribution data for the AI Health Engine.
   * This is consumed by the health engine without modifying it.
   */
  getHealthContribution(entries: StartupEntry[]): StartupHealthContribution {
    const analysis = this.analyze(entries);
    const issues: StartupHealthIssue[] = [];

    if (analysis.enabledCount > 30) {
      issues.push({
        title: 'Too many startup programs',
        description: `${analysis.enabledCount} programs start with Windows. This significantly slows boot time.`,
        severity: 'high',
        impact: 20,
        autoFixable: true,
      });
    } else if (analysis.enabledCount > 15) {
      issues.push({
        title: 'High startup program count',
        description: `${analysis.enabledCount} programs start with Windows. Consider disabling unnecessary ones.`,
        severity: 'medium',
        impact: 10,
        autoFixable: true,
      });
    } else if (analysis.enabledCount > 8) {
      issues.push({
        title: 'Moderate startup programs',
        description: `${analysis.enabledCount} programs start with Windows.`,
        severity: 'low',
        impact: 4,
        autoFixable: true,
      });
    }

    if (analysis.highImpactEntries.length > 3) {
      issues.push({
        title: 'Multiple high-impact startup applications',
        description: `${analysis.highImpactEntries.length} applications have a high impact on boot time.`,
        severity: 'medium',
        impact: 8,
        autoFixable: true,
      });
    }

    if (analysis.missingExecutables.length > 0) {
      issues.push({
        title: 'Broken startup entries',
        description: `${analysis.missingExecutables.length} startup entries point to missing executables.`,
        severity: 'low',
        impact: 5,
        autoFixable: true,
      });
    }

    const insights: string[] = [
      `${analysis.enabledCount} of ${analysis.totalEntries} startup applications are enabled`,
      `Estimated boot impact: ${(analysis.estimatedBootImpactMs / 1000).toFixed(1)} seconds`,
      `${analysis.highImpactEntries.length} high-impact applications detected`,
    ];

    if (analysis.unsignedEntries.length > 0) {
      insights.push(`${analysis.unsignedEntries.length} unsigned applications found`);
    }

    if (analysis.duplicateEntries.length > 0) {
      insights.push(`${analysis.duplicateEntries.length} duplicate startup entries detected`);
    }

    return {
      score: analysis.healthScore,
      issues,
      insights,
      recommendations: analysis.recommendations.map((r) => r.title),
      estimatedBootImprovementMs: analysis.estimatedBootImprovementMs,
    };
  }

  // ── Internal methods ────────────────────────────────────────

  /**
   * Find duplicate entries (same executable path, different sources).
   */
  private _findDuplicates(entries: StartupEntry[]): StartupEntry[][] {
    const groups: Map<string, StartupEntry[]> = new Map();
    for (const entry of entries) {
      if (!entry.executablePath) continue;
      const key = entry.executablePath.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }
    return Array.from(groups.values()).filter((group) => group.length > 1);
  }

  /**
   * Calculate the startup health score (0–100).
   */
  private _calculateHealthScore(
    entries: StartupEntry[],
    impacts: { bootDelayMs: number; level: string }[],
  ): number {
    let score = 100;
    const enabled = entries.filter((e) => e.enabled);

    // Penalty per enabled entry (diminishing)
    const countPenalty = Math.min(30, enabled.length * 2);
    score -= countPenalty;

    // Penalty for high-impact entries
    const highImpactCount = impacts.filter((i) => i.level === 'high' || i.level === 'very_high').length;
    score -= Math.min(25, highImpactCount * 5);

    // Penalty for missing executables
    const missingCount = entries.filter((e) => !e.executableExists).length;
    score -= Math.min(10, missingCount * 3);

    // Penalty for unsigned entries
    const unsignedCount = entries.filter(
      (e) => e.signatureStatus === 'unsigned' || e.signatureStatus === 'unknown',
    ).length;
    score -= Math.min(10, unsignedCount * 2);

    // Penalty for duplicates
    const dupGroups = this._findDuplicates(entries);
    score -= Math.min(5, dupGroups.length * 2);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate optimization recommendations.
   */
  private _generateRecommendations(
    entries: StartupEntry[],
    impacts: { entryId: string; bootDelayMs: number; level: string }[],
    highImpactEntries: StartupEntry[],
    missingExecutables: StartupEntry[],
    unsignedEntries: StartupEntry[],
    duplicateEntries: StartupEntry[][],
  ): StartupRecommendation[] {
    const recommendations: StartupRecommendation[] = [];

    // Recommend disabling high-impact, non-protected entries
    const disableable = highImpactEntries.filter((e) => !e.isProtected);
    if (disableable.length > 0) {
      const improvement = disableable.reduce((sum, e) => {
        const impact = impacts.find((i) => i.entryId === e.id);
        return sum + (impact?.bootDelayMs ?? 0);
      }, 0);
      recommendations.push({
        type: 'disable_high_impact',
        entryIds: disableable.map((e) => e.id),
        title: `Disable ${disableable.length} high-impact startup application${disableable.length > 1 ? 's' : ''}`,
        description: `These applications significantly slow down your boot time. Disabling them could save approximately ${(improvement / 1000).toFixed(1)} seconds.`,
        estimatedImprovementMs: improvement,
        risk: 'low',
      });
    }

    // Recommend removing broken entries
    if (missingExecutables.length > 0) {
      recommendations.push({
        type: 'remove_broken',
        entryIds: missingExecutables.map((e) => e.id),
        title: `Remove ${missingExecutables.length} broken startup entr${missingExecutables.length > 1 ? 'ies' : 'y'}`,
        description: 'These startup entries point to executables that no longer exist on disk.',
        estimatedImprovementMs: 0,
        risk: 'low',
      });
    }

    // Recommend reviewing unsigned entries
    const unsignedNonProtected = unsignedEntries.filter((e) => !e.isProtected);
    if (unsignedNonProtected.length > 0) {
      recommendations.push({
        type: 'review_unsigned',
        entryIds: unsignedNonProtected.map((e) => e.id),
        title: `Review ${unsignedNonProtected.length} unsigned startup application${unsignedNonProtected.length > 1 ? 's' : ''}`,
        description: 'These applications are not digitally signed. Review them to ensure they are safe.',
        estimatedImprovementMs: 0,
        risk: 'medium',
      });
    }

    // Recommend reviewing duplicates
    if (duplicateEntries.length > 0) {
      const allDupIds = duplicateEntries.flat().map((e) => e.id);
      recommendations.push({
        type: 'review_duplicate',
        entryIds: allDupIds,
        title: `Review ${duplicateEntries.length} duplicate startup entr${duplicateEntries.length > 1 ? 'ies' : 'y'}`,
        description: 'Some applications have multiple startup entries. Consider disabling duplicates.',
        estimatedImprovementMs: 0,
        risk: 'low',
      });
    }

    return recommendations;
  }
}

/**
 * Default singleton instance.
 */
export const startupAnalyzer = new StartupAnalyzer();
