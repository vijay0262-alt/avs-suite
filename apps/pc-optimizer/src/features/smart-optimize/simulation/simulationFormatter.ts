/**
 * Simulation Formatter — formats simulation results for display.
 *
 * Supports: JSON, Markdown, PDF-ready data model.
 */
import type { SimulationResult, SimulationComparison, SimulationConfiguration, ExportFormat } from './types';

export class SimulationFormatter {
  private _config: SimulationConfiguration;

  constructor(config: SimulationConfiguration) {
    this._config = config;
  }

  formatJSON(simulation: SimulationResult): string {
    return JSON.stringify(simulation, null, 2);
  }

  formatJSONComparison(comparison: SimulationComparison): string {
    return JSON.stringify(comparison, null, 2);
  }

  formatMarkdown(simulation: SimulationResult): string {
    const lines: string[] = [];
    const typeLabel = simulation.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    lines.push(`# Optimization Simulation: ${typeLabel}`);
    lines.push('');
    lines.push(`**Plan ID:** ${simulation.planId}`);
    lines.push(`**Generated At:** ${simulation.generatedAt}`);
    lines.push(`**Simulation ID:** ${simulation.id}`);
    lines.push('');
    lines.push('## Estimated Outcomes');
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Health Before | ${simulation.estimatedHealthBefore}/100 |`);
    lines.push(`| Health After | ${simulation.estimatedHealthAfter}/100 |`);
    lines.push(`| Storage Recovered | ${simulation.estimatedStorageRecovered.toFixed(1)} MB |`);
    lines.push(`| Performance Gain | ${(simulation.estimatedPerformanceGain * 100).toFixed(1)}% |`);
    lines.push(`| Privacy Improvement | ${(simulation.estimatedPrivacyImprovement * 100).toFixed(1)}% |`);
    lines.push(`| Memory Recovery | ${simulation.estimatedMemoryRecovery.toFixed(1)}% |`);
    lines.push(`| Startup Improvement | ${(simulation.estimatedStartupImprovement * 100).toFixed(1)}% |`);
    lines.push(`| Duration | ${simulation.estimatedDuration}ms |`);
    lines.push(`| Risk Level | ${simulation.estimatedRisk} |`);
    lines.push(`| Confidence | ${(simulation.estimatedConfidence * 100).toFixed(0)}% |`);
    lines.push(`| Rollback Available | ${simulation.rollbackAvailability ? 'Yes' : 'No'} |`);
    lines.push('');
    lines.push('## Explainability');
    lines.push('');
    lines.push(`**Why this estimate:** ${simulation.explainability.whyThisEstimate}`);
    lines.push('');
    lines.push(`**Confidence Score:** ${(simulation.explainability.confidenceScore * 100).toFixed(0)}%`);
    lines.push('');
    lines.push(`**Potential Uncertainty:** ${simulation.explainability.potentialUncertainty}`);
    lines.push('');
    lines.push('### Evidence Used');
    lines.push('');
    for (const e of simulation.explainability.evidenceUsed) {
      lines.push(`- ${e}`);
    }
    lines.push('');
    lines.push('### Assumptions');
    lines.push('');
    for (const a of simulation.assumptions) {
      lines.push(`- ${a.description} (impact: ${a.impact}, confidence: ${(a.confidence * 100).toFixed(0)}%)`);
    }
    lines.push('');
    lines.push('### Action Breakdown');
    lines.push('');
    lines.push(`| Action | Duration | Benefit | Risk | Confidence |`);
    lines.push(`|--------|----------|---------|------|------------|`);
    for (const a of simulation.actionBreakdown) {
      lines.push(`| ${a.title} | ${a.estimatedDuration}ms | ${a.estimatedBenefit.toFixed(2)} | ${a.estimatedRisk} | ${(a.confidence * 100).toFixed(0)}% |`);
    }
    lines.push('');

    return lines.join('\n');
  }

  formatMarkdownComparison(comparison: SimulationComparison): string {
    const lines: string[] = [];

    lines.push('# Simulation Comparison');
    lines.push('');
    lines.push(`**Generated At:** ${comparison.generatedAt}`);
    lines.push(`**Comparison ID:** ${comparison.id}`);
    lines.push('');

    lines.push('## Comparison Summary');
    lines.push('');
    lines.push(comparison.summary);
    lines.push('');
    lines.push('## Recommendation');
    lines.push('');
    lines.push(comparison.recommendation);
    lines.push('');

    if (comparison.winner) {
      lines.push(`**Winner:** ${comparison.winner}`);
      lines.push('');
    }

    lines.push('## Metric Deltas');
    lines.push('');
    lines.push(`| Metric | ${comparison.simulations.map((_, i) => `Plan ${i + 1}`).join(' | ')} | Best |`);
    lines.push(`|--------|${comparison.simulations.map(() => '------').join('|')}|------|`);
    for (const delta of comparison.deltas) {
      const values = delta.values.map((v) => v.toFixed(2)).join(' | ');
      lines.push(`| ${delta.label} | ${values} | Plan ${delta.bestIndex + 1} |`);
    }
    lines.push('');

    for (let i = 0; i < comparison.simulations.length; i++) {
      const sim = comparison.simulations[i]!;
      lines.push(`## Plan ${i + 1}: ${sim.planId}`);
      lines.push('');
      lines.push(`- Health: ${sim.estimatedHealthBefore} → ${sim.estimatedHealthAfter} (+${(sim.estimatedHealthAfter - sim.estimatedHealthBefore).toFixed(0)})`);
      lines.push(`- Storage: +${sim.estimatedStorageRecovered.toFixed(1)} MB`);
      lines.push(`- Performance: +${(sim.estimatedPerformanceGain * 100).toFixed(1)}%`);
      lines.push(`- Duration: ${sim.estimatedDuration}ms`);
      lines.push(`- Risk: ${sim.estimatedRisk}`);
      lines.push(`- Confidence: ${(sim.estimatedConfidence * 100).toFixed(0)}%`);
      lines.push('');
    }

    return lines.join('\n');
  }

  formatPDFReady(simulation: SimulationResult): string {
    return JSON.stringify({
      documentType: 'simulation_report',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: 'Simulation Summary',
          content: {
            simulationId: simulation.id,
            planId: simulation.planId,
            type: simulation.type,
            generatedAt: simulation.generatedAt,
          },
        },
        {
          title: 'Estimated Outcomes',
          content: {
            estimatedHealthBefore: simulation.estimatedHealthBefore,
            estimatedHealthAfter: simulation.estimatedHealthAfter,
            estimatedStorageRecovered: simulation.estimatedStorageRecovered,
            estimatedPerformanceGain: simulation.estimatedPerformanceGain,
            estimatedPrivacyImprovement: simulation.estimatedPrivacyImprovement,
            estimatedMemoryRecovery: simulation.estimatedMemoryRecovery,
            estimatedStartupImprovement: simulation.estimatedStartupImprovement,
            estimatedDuration: simulation.estimatedDuration,
            estimatedRisk: simulation.estimatedRisk,
            estimatedConfidence: simulation.estimatedConfidence,
            rollbackAvailability: simulation.rollbackAvailability,
          },
        },
        {
          title: 'Explainability',
          content: simulation.explainability,
        },
        {
          title: 'Assumptions',
          content: simulation.assumptions,
        },
        {
          title: 'Action Breakdown',
          content: simulation.actionBreakdown,
        },
        {
          title: 'Supporting Evidence',
          content: simulation.supportingEvidence,
        },
      ],
    }, null, 2);
  }

  formatPDFReadyComparison(comparison: SimulationComparison): string {
    return JSON.stringify({
      documentType: 'simulation_comparison',
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      sections: [
        {
          title: 'Comparison Summary',
          content: {
            comparisonId: comparison.id,
            generatedAt: comparison.generatedAt,
            winner: comparison.winner,
            summary: comparison.summary,
            recommendation: comparison.recommendation,
          },
        },
        {
          title: 'Deltas',
          content: comparison.deltas,
        },
        {
          title: 'Simulations',
          content: comparison.simulations.map((s) => ({
            simulationId: s.id,
            planId: s.planId,
            type: s.type,
            estimatedHealthAfter: s.estimatedHealthAfter,
            estimatedStorageRecovered: s.estimatedStorageRecovered,
            estimatedPerformanceGain: s.estimatedPerformanceGain,
            estimatedDuration: s.estimatedDuration,
            estimatedRisk: s.estimatedRisk,
            estimatedConfidence: s.estimatedConfidence,
          })),
        },
      ],
    }, null, 2);
  }

  format(simulation: SimulationResult, format: ExportFormat): string {
    switch (format) {
      case 'json': return this.formatJSON(simulation);
      case 'markdown': return this.formatMarkdown(simulation);
      case 'pdf_ready': return this.formatPDFReady(simulation);
      default: return this.formatJSON(simulation);
    }
  }

  formatComparison(comparison: SimulationComparison, format: ExportFormat): string {
    switch (format) {
      case 'json': return this.formatJSONComparison(comparison);
      case 'markdown': return this.formatMarkdownComparison(comparison);
      case 'pdf_ready': return this.formatPDFReadyComparison(comparison);
      default: return this.formatJSONComparison(comparison);
    }
  }

  get config(): SimulationConfiguration { return this._config; }
}
