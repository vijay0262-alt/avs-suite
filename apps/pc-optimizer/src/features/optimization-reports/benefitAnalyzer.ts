/**
 * Benefit Analyzer — estimates and formats benefits from optimization.
 *
 * Analyzes storage recovered, memory optimized, startup improvement,
 * performance improvement, privacy improvement, maintenance reduction,
 * and time saved.
 */
import type { BenefitAnalysis } from './types';
import { formatBytes, formatDuration } from './types';
import type { PipelineExecution } from '../execution-pipeline/types';
import type { OptimizationPlanV2 } from '../optimization-planner/types';

export class BenefitAnalyzer {
  analyze(
    execution: PipelineExecution,
    plan: OptimizationPlanV2,
  ): BenefitAnalysis {
    const storageRecovered = this._computeStorage(execution, plan);
    const memoryOptimized = this._computeMemory(execution, plan);
    const startupImprovement = plan.estimatedStartupGain;
    const performanceImprovement = plan.estimatedPerformanceGain;
    const privacyImprovement = plan.estimatedPrivacyGain;
    const maintenanceReduction = this._computeMaintenanceReduction(execution);
    const timeSaved = this._computeTimeSaved(execution, plan);

    return {
      storageRecovered,
      memoryOptimized,
      startupImprovement,
      performanceImprovement,
      privacyImprovement,
      maintenanceReduction,
      timeSaved,
      formatted: {
        storage: formatBytes(storageRecovered),
        memory: formatBytes(memoryOptimized),
        startup: startupImprovement > 0 ? `${startupImprovement.toFixed(1)} seconds` : 'No improvement',
        performance: performanceImprovement > 0 ? `+${performanceImprovement}` : 'No change',
        privacy: privacyImprovement > 0 ? `+${privacyImprovement}` : 'No change',
        maintenance: maintenanceReduction > 0 ? `${maintenanceReduction} actions reduced` : 'No reduction',
        timeSaved: formatDuration(timeSaved),
      },
    };
  }

  private _computeStorage(execution: PipelineExecution, plan: OptimizationPlanV2): number {
    const fromOutput = execution.stepResults
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => {
        const bytes = s.output?.bytesRecovered;
        return sum + (typeof bytes === 'number' ? bytes : 0);
      }, 0);
    return fromOutput || plan.estimatedStorageRecovery;
  }

  private _computeMemory(execution: PipelineExecution, _plan: OptimizationPlanV2): number {
    return execution.stepResults
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => {
        const bytes = s.output?.memoryFreed;
        return sum + (typeof bytes === 'number' ? bytes : 0);
      }, 0);
  }

  private _computeMaintenanceReduction(execution: PipelineExecution): number {
    return execution.stepResults.filter((s) => s.status === 'completed').length;
  }

  private _computeTimeSaved(execution: PipelineExecution, plan: OptimizationPlanV2): number {
    const executionTime = execution.stepResults
      .filter((s) => s.status === 'completed')
      .reduce((sum, s) => sum + s.durationMs, 0);
    const futureTimeSaved = plan.estimatedStartupGain * 1000;
    return Math.round(executionTime + futureTimeSaved);
  }
}
