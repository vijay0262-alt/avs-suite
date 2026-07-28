/**
 * Job Builder — converts maintenance schedules into MaintenanceJob objects.
 *
 * Schedule → Job Builder → Maintenance Job → Execution Engine → Task Pipeline → Results
 *
 * The same execution engine can process:
 *   • Scheduled Maintenance (from ConfigurationManager schedules)
 *   • One-click Quick Scan (manual job)
 *   • AI Recommended Optimization (manual job)
 *   • Manual Deep Clean (manual job)
 *   • Startup Cleanup (manual job)
 *   • Browser Cleanup (manual job)
 *
 * All of these simply create a MaintenanceJob and submit it to the engine.
 */
import type {
  MaintenanceJob,
  MaintenanceTask,
  JobSource,
} from './types';
import type { MaintenanceScheduleConfig } from '../config-sync/types';
import { createTask, isTaskRegistered } from './tasks';

let _jobCounter = 0;

function generateJobId(source: string): string {
  _jobCounter += 1;
  return `job-${source}-${Date.now().toString(36)}-${_jobCounter}`;
}

export const jobBuilder = {
  /**
   * Build a MaintenanceJob from a synchronized schedule.
   *
   * @param schedule - The maintenance schedule from ConfigurationManager
   * @returns A MaintenanceJob with tasks instantiated from the schedule's task list
   * @throws if no tasks in the schedule are recognized
   */
  fromSchedule(schedule: MaintenanceScheduleConfig): MaintenanceJob {
    const tasks: MaintenanceTask[] = [];
    const unknownTasks: string[] = [];

    for (const taskId of schedule.tasks) {
      const task = createTask(taskId);
      if (task) {
        tasks.push(task);
      } else {
        unknownTasks.push(taskId);
      }
    }

    if (unknownTasks.length > 0) {
      console.warn(
        `[JobBuilder] Unknown task IDs in schedule "${schedule.name}": ${unknownTasks.join(', ')}`,
      );
    }

    return {
      id: generateJobId('scheduled'),
      source: 'scheduled',
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      tasks,
      createdAt: new Date().toISOString(),
      bypassPauseConditions: false,
    };
  },

  /**
   * Build a manual MaintenanceJob from a list of task IDs.
   *
   * Manual jobs bypass pause conditions (the user explicitly triggered them).
   *
   * @param taskIds - Array of task IDs to include
   * @param source - The source of the manual job (default: 'manual')
   * @param name - Optional name for the job
   */
  fromManual(
    taskIds: string[],
    source: JobSource = 'manual',
    name?: string,
  ): MaintenanceJob {
    const tasks: MaintenanceTask[] = [];
    const unknownTasks: string[] = [];

    for (const taskId of taskIds) {
      const task = createTask(taskId);
      if (task) {
        tasks.push(task);
      } else {
        unknownTasks.push(taskId);
      }
    }

    if (unknownTasks.length > 0) {
      console.warn(
        `[JobBuilder] Unknown task IDs: ${unknownTasks.join(', ')}`,
      );
    }

    return {
      id: generateJobId(source),
      source,
      scheduleId: null,
      scheduleName: name ?? null,
      tasks,
      createdAt: new Date().toISOString(),
      bypassPauseConditions: true,
    };
  },

  /**
   * Build a quick scan job (junk cleaner only).
   */
  quickScan(): MaintenanceJob {
    return this.fromManual(['junk_cleaner'], 'quick_scan', 'Quick Scan');
  },

  /**
   * Build a browser cleanup job.
   */
  browserCleanup(): MaintenanceJob {
    return this.fromManual(['browser_cleaner'], 'browser_cleanup', 'Browser Cleanup');
  },

  /**
   * Build a deep clean job (all available tasks).
   */
  deepClean(): MaintenanceJob {
    return this.fromManual(
      ['junk_cleaner', 'browser_cleaner', 'recycle_bin_cleaner', 'temp_files_cleaner'],
      'manual',
      'Deep Clean',
    );
  },
};

/**
 * Check if a schedule has any recognized tasks.
 */
export function scheduleHasValidTasks(schedule: MaintenanceScheduleConfig): boolean {
  return schedule.tasks.some((taskId) => isTaskRegistered(taskId));
}
