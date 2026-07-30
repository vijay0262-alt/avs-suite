/**
 * Product Completion Program — Quality Metrics
 *
 * PCP PHASE 1 PART 1
 *
 * Collects, aggregates, and scores quality metrics across modules.
 * Computes stability, performance, reliability, maintainability, UX,
 * accessibility, and security scores, plus an overall readiness score.
 */
import type {
  QualityMetrics,
  QualityScore,
  QualityDimension,
  ModuleMetrics,
  QualityAuditResult,
  QualityIssue,
  QualitySeverity,
} from './types';

export class QualityMetricsCollector {
  private _moduleMetrics: Map<string, ModuleMetrics> = new Map();

  recordModule(moduleId: string, metrics: Partial<ModuleMetrics>): void {
    const existing = this._moduleMetrics.get(moduleId);
    if (existing) {
      this._moduleMetrics.set(moduleId, { ...existing, ...metrics });
    } else {
      this._moduleMetrics.set(moduleId, {
        moduleId,
        stabilityScore: metrics.stabilityScore ?? 100,
        performanceScore: metrics.performanceScore ?? 100,
        reliabilityScore: metrics.reliabilityScore ?? 100,
        maintainabilityScore: metrics.maintainabilityScore ?? 100,
        uxScore: metrics.uxScore ?? 100,
        accessibilityScore: metrics.accessibilityScore ?? 100,
        securityScore: metrics.securityScore ?? 100,
        testCoveragePercent: metrics.testCoveragePercent ?? 0,
        cyclomaticComplexity: metrics.cyclomaticComplexity ?? 1,
        codeLines: metrics.codeLines ?? 0,
        dependencyCount: metrics.dependencyCount ?? 0,
        issueCount: metrics.issueCount ?? 0,
        futureMetadata: metrics.futureMetadata ?? {},
      } as ModuleMetrics);
    }
  }

  getModuleMetrics(moduleId: string): ModuleMetrics | undefined {
    return this._moduleMetrics.get(moduleId);
  }

  getAllModuleMetrics(): ModuleMetrics[] {
    return Array.from(this._moduleMetrics.values());
  }

  computeScoresFromIssues(issues: QualityIssue[]): void {
    const byModule = new Map<string, QualityIssue[]>();
    for (const issue of issues) {
      const list = byModule.get(issue.moduleId) ?? [];
      list.push(issue);
      byModule.set(issue.moduleId, list);
    }

    for (const [moduleId, moduleIssues] of byModule) {
      const scores = this._computeScoresFromIssues(moduleIssues);
      this.recordModule(moduleId, scores);
    }
  }

  private _computeScoresFromIssues(issues: QualityIssue[]): Partial<ModuleMetrics> {
    const severityWeights: Record<QualitySeverity, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      info: 1,
    };

    let stabilityDeduction = 0;
    let performanceDeduction = 0;
    let reliabilityDeduction = 0;
    let maintainabilityDeduction = 0;
    let uxDeduction = 0;
    let accessibilityDeduction = 0;
    let securityDeduction = 0;

    for (const issue of issues) {
      const weight = severityWeights[issue.severity];
      switch (issue.dimension) {
        case 'stability':
          stabilityDeduction += weight;
          break;
        case 'performance':
          performanceDeduction += weight;
          break;
        case 'reliability':
          reliabilityDeduction += weight;
          break;
        case 'maintainability':
          maintainabilityDeduction += weight;
          break;
        case 'ux':
          uxDeduction += weight;
          break;
        case 'accessibility':
          accessibilityDeduction += weight;
          break;
        case 'security':
          securityDeduction += weight;
          break;
      }
    }

    return {
      stabilityScore: clampScore(100 - stabilityDeduction),
      performanceScore: clampScore(100 - performanceDeduction),
      reliabilityScore: clampScore(100 - reliabilityDeduction),
      maintainabilityScore: clampScore(100 - maintainabilityDeduction),
      uxScore: clampScore(100 - uxDeduction),
      accessibilityScore: clampScore(100 - accessibilityDeduction),
      securityScore: clampScore(100 - securityDeduction),
      issueCount: issues.length,
    };
  }

  computeOverallScores(): QualityMetrics {
    const modules = this.getAllModuleMetrics();
    if (modules.length === 0) {
      return {
        stabilityScore: 100,
        performanceScore: 100,
        reliabilityScore: 100,
        maintainabilityScore: 100,
        uxScore: 100,
        accessibilityScore: 100,
        securityScore: 100,
        overallReadinessScore: 100,
        totalIssues: 0,
        criticalIssues: 0,
        highIssues: 0,
        mediumIssues: 0,
        lowIssues: 0,
        infoIssues: 0,
        totalModules: 0,
        healthyModules: 0,
        futureMetadata: {},
      };
    }

    const dims: QualityDimension[] = [
      'stability',
      'performance',
      'reliability',
      'maintainability',
      'ux',
      'accessibility',
      'security',
    ];

    const scoreMap: Record<QualityDimension, keyof ModuleMetrics> = {
      stability: 'stabilityScore',
      performance: 'performanceScore',
      reliability: 'reliabilityScore',
      maintainability: 'maintainabilityScore',
      ux: 'uxScore',
      accessibility: 'accessibilityScore',
      security: 'securityScore',
    };

    const avgScores: Record<QualityDimension, number> = {} as Record<QualityDimension, number>;
    for (const dim of dims) {
      const sum = modules.reduce((acc, m) => acc + (m[scoreMap[dim]] as number), 0);
      avgScores[dim] = sum / modules.length;
    }

    const overallReadiness = dims.reduce((acc, dim) => acc + avgScores[dim], 0) / dims.length;

    let totalIssues = 0;
    let healthyModules = 0;
    for (const m of modules) {
      totalIssues += m.issueCount;
      if (m.issueCount === 0) healthyModules++;
    }

    return {
      stabilityScore: roundScore(avgScores.stability),
      performanceScore: roundScore(avgScores.performance),
      reliabilityScore: roundScore(avgScores.reliability),
      maintainabilityScore: roundScore(avgScores.maintainability),
      uxScore: roundScore(avgScores.ux),
      accessibilityScore: roundScore(avgScores.accessibility),
      securityScore: roundScore(avgScores.security),
      overallReadinessScore: roundScore(overallReadiness),
      totalIssues,
      criticalIssues: 0,
      highIssues: 0,
      mediumIssues: 0,
      lowIssues: 0,
      infoIssues: 0,
      totalModules: modules.length,
      healthyModules,
      futureMetadata: {},
    };
  }

  computeScoreBreakdown(metrics: QualityMetrics): QualityScore[] {
    const dims: QualityDimension[] = [
      'stability',
      'performance',
      'reliability',
      'maintainability',
      'ux',
      'accessibility',
      'security',
    ];

    const scoreMap: Record<QualityDimension, number> = {
      stability: metrics.stabilityScore,
      performance: metrics.performanceScore,
      reliability: metrics.reliabilityScore,
      maintainability: metrics.maintainabilityScore,
      ux: metrics.uxScore,
      accessibility: metrics.accessibilityScore,
      security: metrics.securityScore,
    };

    const labelMap: Record<QualityDimension, string> = {
      stability: 'Stability',
      performance: 'Performance',
      reliability: 'Reliability',
      maintainability: 'Maintainability',
      ux: 'User Experience',
      accessibility: 'Accessibility',
      security: 'Security',
    };

    return dims.map((dim) => ({
      dimension: dim,
      label: labelMap[dim],
      score: scoreMap[dim],
      weight: 1 / dims.length,
      weightedScore: scoreMap[dim] / dims.length,
      status: scoreToStatus(scoreMap[dim]),
    }));
  }

  updateMetricsFromAuditResult(result: QualityAuditResult): void {
    this.computeScoresFromIssues(result.issues);
    const overall = this.computeOverallScores();

    result.metrics.stabilityScore = overall.stabilityScore;
    result.metrics.performanceScore = overall.performanceScore;
    result.metrics.reliabilityScore = overall.reliabilityScore;
    result.metrics.maintainabilityScore = overall.maintainabilityScore;
    result.metrics.uxScore = overall.uxScore;
    result.metrics.accessibilityScore = overall.accessibilityScore;
    result.metrics.securityScore = overall.securityScore;
    result.metrics.overallReadinessScore = overall.overallReadinessScore;
    result.metrics.totalIssues = overall.totalIssues;
    result.metrics.totalModules = overall.totalModules;
    result.metrics.healthyModules = overall.healthyModules;

    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const issue of result.issues) {
      severityCounts[issue.severity]++;
    }
    result.metrics.criticalIssues = severityCounts.critical;
    result.metrics.highIssues = severityCounts.high;
    result.metrics.mediumIssues = severityCounts.medium;
    result.metrics.lowIssues = severityCounts.low;
    result.metrics.infoIssues = severityCounts.info;
  }

  clear(): void {
    this._moduleMetrics.clear();
  }
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score));
}

function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

function scoreToStatus(score: number): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}
