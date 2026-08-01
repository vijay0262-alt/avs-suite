/**
 * OptimizationRollbackPlanner — creates rollback plans for reversible
 * optimization actions.
 *
 * Reuses existing undo/recovery infrastructure. Never duplicates rollback logic.
 * For irreversible actions, rollback is not available.
 */
import type {
  OptimizationAction,
  RollbackPlan,
  RollbackStep,
  OptimizationActionType,
} from './types';

const ROLLBACK_STEPS: Partial<Record<OptimizationActionType, RollbackStep[]>> = {
  clean_temp_files: [
    { order: 1, description: 'Restore cleaned temporary files from backup', type: 'restore_file', target: '%TEMP%', reversible: true },
  ],
  clean_browser_cache: [
    { order: 1, description: 'Browser cache will be regenerated automatically', type: 'custom', target: 'browser_cache', reversible: true },
  ],
  empty_recycle_bin: [
    { order: 1, description: 'Restore files from Recycle Bin backup', type: 'restore_file', target: 'recycle_bin', reversible: true },
  ],
  disable_startup_entry: [
    { order: 1, description: 'Re-enable startup entry in Windows registry', type: 'restore_startup', target: 'startup_registry', reversible: true },
  ],
  delay_startup_entry: [
    { order: 1, description: 'Restore original startup entry timing', type: 'restore_startup', target: 'startup_registry', reversible: true },
  ],
  clean_registry: [
    { order: 1, description: 'Restore registry from backup (.reg file)', type: 'restore_registry', target: 'registry_backup', reversible: true },
  ],
  remove_duplicates: [
    { order: 1, description: 'Restore duplicate files from Recycle Bin', type: 'restore_file', target: 'recycle_bin', reversible: true },
  ],
  move_large_files: [
    { order: 1, description: 'Move files back to original location', type: 'restore_file', target: 'original_path', reversible: true },
  ],
  close_background_process: [
    { order: 1, description: 'Restart the closed process', type: 're-enable_service', target: 'process', reversible: true },
  ],
  adjust_power_plan: [
    { order: 1, description: 'Restore previous power plan setting', type: 'custom', target: 'power_plan', reversible: true },
  ],
};

export class OptimizationRollbackPlanner {
  createRollbackPlan(action: OptimizationAction): RollbackPlan {
    if (!action.rollbackAvailable) {
      return {
        id: `rollback-${action.id}`,
        actionId: action.id,
        actionTitle: action.title,
        steps: [],
        estimatedDurationSeconds: 0,
        canExecute: false,
        prerequisites: [],
        warnings: ['This action is irreversible — no rollback available.'],
      };
    }

    const steps = ROLLBACK_STEPS[action.type] ?? [
      { order: 1, description: `Restore previous state for ${action.title}`, type: 'custom' as const, target: action.id, reversible: true },
    ];

    const estimatedDuration = steps.length * 5;
    const prerequisites = this.getPrerequisites(action);
    const warnings = this.getWarnings(action);

    return {
      id: `rollback-${action.id}`,
      actionId: action.id,
      actionTitle: action.title,
      steps,
      estimatedDurationSeconds: estimatedDuration,
      canExecute: true,
      prerequisites,
      warnings,
    };
  }

  createRollbackPlans(actions: OptimizationAction[]): Map<string, RollbackPlan> {
    const plans = new Map<string, RollbackPlan>();
    for (const action of actions) {
      if (action.rollbackAvailable) {
        plans.set(action.id, this.createRollbackPlan(action));
      }
    }
    return plans;
  }

  private getPrerequisites(action: OptimizationAction): string[] {
    const prereqs: string[] = [];
    if (action.risk.requiresRestart) {
      prereqs.push('System must be restarted after rollback');
    }
    if (action.type === 'clean_registry') {
      prereqs.push('Registry backup file must be available');
    }
    if (action.type === 'remove_duplicates' || action.type === 'empty_recycle_bin') {
      prereqs.push('Recycle Bin must not have been emptied since optimization');
    }
    return prereqs;
  }

  private getWarnings(action: OptimizationAction): string[] {
    const warnings: string[] = [];
    if (action.type === 'clean_registry') {
      warnings.push('Registry rollback requires the backup file created during optimization.');
    }
    if (action.type === 'close_background_process') {
      warnings.push('Restarting a process may not restore its exact previous state.');
    }
    return warnings;
  }
}
