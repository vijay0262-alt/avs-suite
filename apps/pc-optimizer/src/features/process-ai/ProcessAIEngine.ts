/**
 * ProcessAIEngine — top-level orchestrator for the AI Process Intelligence Engine.
 *
 * Consumes ProcessSnapshot data from ProcessManager and produces a
 * comprehensive ProcessAIReport with:
 *   - Per-process analyses (impact, issues, health, classification)
 *   - Human-readable insights with evidence chains
 *   - Evidence-based recommendations (never auto-terminate)
 *   - System-wide risk assessment
 *   - Trend summaries from historical data
 *   - Dashboard data (top consumers, startup, background, alerts)
 *
 * Core principle: Every insight is traceable to process evidence.
 * No automatic termination. No priority modification. No service changes.
 * The AI must only analyze, explain, and recommend.
 */
import type {
  ProcessAIReport,
  ProcessConfiguration,
  ProcessAnalysis,
  ProcessInsight,
  ProcessRecommendation,
  ProcessRiskAssessment,
  ProcessTrendSummary,
  ProcessDashboardData,
  ProcessSnapshot,
} from './types';
import {
  DEFAULT_PROCESS_CONFIG,
  confidenceToLabel,
} from './types';
import { ProcessManager } from './ProcessManager';
import { ProcessAnalyzer } from './ProcessAnalyzer';
import { ProcessTrendAnalyzer } from './ProcessTrendAnalyzer';
import { ProcessExplanationEngine } from './ProcessExplanationEngine';
import { ProcessRiskAssessmentEngine } from './ProcessRiskAssessment';
import { ProcessRecommendationEngine } from './ProcessRecommendationEngine';
import { ProcessDashboardProvider } from './ProcessDashboardProvider';
import { processEventBus } from './ProcessEvents';

export class ProcessAIEngine {
  private config: ProcessConfiguration;
  private manager: ProcessManager;
  private analyzer: ProcessAnalyzer;
  private trendAnalyzer: ProcessTrendAnalyzer;
  private explanationEngine: ProcessExplanationEngine;
  private riskEngine: ProcessRiskAssessmentEngine;
  private recommendationEngine: ProcessRecommendationEngine;
  private dashboardProvider: ProcessDashboardProvider;
  private lastReport: ProcessAIReport | null = null;

  constructor(config: ProcessConfiguration = DEFAULT_PROCESS_CONFIG, manager?: ProcessManager) {
    this.config = config;
    this.manager = manager ?? new ProcessManager(config);
    this.analyzer = new ProcessAnalyzer(config, this.manager.repository.getHistory());
    this.trendAnalyzer = new ProcessTrendAnalyzer(config, this.manager.repository.getHistory());
    this.explanationEngine = new ProcessExplanationEngine();
    this.riskEngine = new ProcessRiskAssessmentEngine();
    this.recommendationEngine = new ProcessRecommendationEngine(config);
    this.dashboardProvider = new ProcessDashboardProvider();
  }

  /**
   * Analyze a process snapshot and produce a full AI report.
   */
  analyze(snapshot: ProcessSnapshot): ProcessAIReport {
    // Analyze all processes
    const analyses = this.analyzer.analyzeAll(snapshot);

    // Build insights
    const insights: ProcessInsight[] = [];
    for (const analysis of analyses) {
      const entry = snapshot.entries.find((e) => e.info.pid === analysis.pid);
      if (!entry) continue;

      const explanation = this.explanationEngine.explainProcess(entry, analysis);

      const insight: ProcessInsight = {
        id: `insight-${snapshot.id}-${analysis.pid}`,
        pid: analysis.pid,
        name: analysis.name,
        displayName: analysis.displayName,
        category: analysis.category,
        title: analysis.impact.overall.primaryConcern !== 'None'
          ? `${analysis.displayName}: ${analysis.impact.overall.primaryConcern} Impact`
          : `${analysis.displayName}: Normal Operation`,
        summary: explanation.summary,
        explanation: explanation.explanation,
        purpose: explanation.purpose,
        currentActivity: explanation.currentActivity,
        resourceExplanation: explanation.resourceExplanation,
        expectedBehavior: explanation.expectedBehavior,
        evidence: analysis.issues.length > 0
          ? analysis.issues.flatMap((i) => i.evidence)
          : analysis.impact.cpu.evidence.concat(analysis.impact.memory.evidence),
        confidence: analysis.confidence,
        confidenceLabel: confidenceToLabel(analysis.confidence),
        severity: this.getWorstSeverity(analysis),
        risk: analysis.risk,
        recommendation: analysis.recommendedAction,
        expectedRecovery: analysis.expectedRecovery,
        requiresRestart: analysis.requiresRestart,
        rollbackAvailable: analysis.rollbackAvailable,
        timestamp: snapshot.timestamp,
      };
      insights.push(insight);
    }

    // Sort insights by severity then confidence
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
    insights.sort((a, b) => {
      const s = severityOrder[a.severity] - severityOrder[b.severity];
      if (s !== 0) return s;
      return b.confidence - a.confidence;
    });

    // Generate recommendations
    const recommendations: ProcessRecommendation[] = this.config.enableRecommendations
      ? this.recommendationEngine.generate(analyses)
      : [];

    // Assess risk
    const riskAssessment: ProcessRiskAssessment = this.config.enableRiskAssessment
      ? this.riskEngine.assess(analyses)
      : this.emptyRiskAssessment();

    // Trend summaries
    const trendSummaries: ProcessTrendSummary[] = this.config.enableTrendAnalysis
      ? this.trendAnalyzer.getTrendSummaries(analyses.map((a) => a.pid))
      : [];

    // Dashboard data
    const dashboard: ProcessDashboardData = this.config.enableDashboard
      ? this.dashboardProvider.build(snapshot, analyses)
      : this.emptyDashboard(snapshot);

    // System summary
    const systemSummary = this.explanationEngine.explainSystemSummary(
      snapshot.processCount,
      snapshot.systemTotals.totalCpuUsagePercent,
      snapshot.systemTotals.totalMemoryMB,
      dashboard.summary.highImpactCount,
    );

    const systemExplanation = this.buildSystemExplanation(snapshot, analyses, riskAssessment);

    // Overall confidence
    const overallConfidence = analyses.length > 0
      ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length
      : 0;

    const report: ProcessAIReport = {
      timestamp: Date.now(),
      snapshotId: snapshot.id,
      totalProcesses: snapshot.processCount,
      systemSummary,
      systemExplanation,
      analyses,
      insights: insights.slice(0, this.config.maxInsights),
      recommendations,
      riskAssessment,
      trendSummaries,
      dashboard,
      overallConfidence,
    };

    this.lastReport = report;

    // Emit events for high-risk processes
    for (const analysis of analyses) {
      if (analysis.impact.cpu.level === 'high' || analysis.impact.cpu.level === 'critical') {
        processEventBus.emitHighCpu(analysis.pid, analysis.name, analysis.impact.cpu.usagePercent);
      }
      if (analysis.impact.memory.isLeakSuspected) {
        processEventBus.emitMemoryLeak(analysis.pid, analysis.name, analysis.impact.memory.usageMB);
      }
      if (analysis.safetyLevel === 'review_recommended' && analysis.issues.some((i) => i.type === 'suspicious_behavior')) {
        processEventBus.emitSuspicious(analysis.pid, analysis.name, 'Unsigned process detected');
      }
    }

    return report;
  }

  getManager(): ProcessManager {
    return this.manager;
  }

  getLastReport(): ProcessAIReport | null {
    return this.lastReport;
  }

  getConfiguration(): ProcessConfiguration {
    return this.config;
  }

  updateConfiguration(updates: Partial<ProcessConfiguration>): void {
    this.config = { ...this.config, ...updates };
  }

  dispose(): void {
    this.manager.dispose();
    this.lastReport = null;
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private getWorstSeverity(analysis: ProcessAnalysis): ProcessInsight['severity'] {
    if (analysis.issues.length === 0) return 'info';
    const order = ['info', 'low', 'medium', 'high', 'critical'] as const;
    let worst: ProcessInsight['severity'] = 'info';
    for (const issue of analysis.issues) {
      if (order.indexOf(issue.severity) > order.indexOf(worst)) {
        worst = issue.severity;
      }
    }
    return worst;
  }

  private buildSystemExplanation(
    snapshot: ProcessSnapshot,
    analyses: ProcessAnalysis[],
    risk: ProcessRiskAssessment,
  ): string {
    const parts: string[] = [];
    parts.push(`The process intelligence engine analyzed ${snapshot.processCount} running processes.`);

    const highImpact = analyses.filter((a) => a.impact.overall.level === 'high' || a.impact.overall.level === 'critical');
    if (highImpact.length > 0) {
      parts.push(`${highImpact.length} process${highImpact.length > 1 ? 'es are' : ' is'} consuming significant system resources.`);
    }

    const idle = analyses.filter((a) => a.impact.background.isIdle);
    if (idle.length > 0) {
      parts.push(`${idle.length} background process${idle.length > 1 ? 'es are' : ' is'} currently idle and could be closed to recover resources.`);
    }

    const protected_ = analyses.filter((a) => a.safetyLevel === 'critical_system');
    parts.push(`${protected_.length} critical system process${protected_.length !== 1 ? 'es are' : ' is'} protected from termination.`);

    if (risk.systemRiskFactors.length > 0) {
      parts.push(`Key risk factors: ${risk.systemRiskFactors.slice(0, 3).join('; ')}.`);
    }

    return parts.join(' ');
  }

  private emptyRiskAssessment(): ProcessRiskAssessment {
    return {
      overallRisk: 'none',
      overallUrgency: 'none',
      highRiskProcesses: [],
      systemRiskFactors: [],
      mitigatingFactors: [],
      protectedProcesses: 0,
    };
  }

  private emptyDashboard(snapshot: ProcessSnapshot): ProcessDashboardData {
    return {
      summary: {
        totalProcesses: snapshot.processCount,
        totalCpuUsagePercent: 0,
        totalMemoryMB: 0,
        totalDiskActivityMBps: 0,
        totalNetworkMbps: 0,
        backgroundProcessCount: 0,
        startupProcessCount: 0,
        highImpactCount: 0,
        criticalProcessCount: 0,
        systemProcessCount: 0,
        userProcessCount: 0,
      },
      topConsumers: [],
      startupProcesses: [],
      backgroundProcesses: [],
      alerts: [],
      lastScanAt: snapshot.timestamp,
    };
  }
}
