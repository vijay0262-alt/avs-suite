import clsx from 'clsx';
import {
  MagnifyingGlassIcon,
  BoltIcon,
  ArrowPathIcon,
  ArchiveBoxXMarkIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import type { ScheduledTask, AutomationType } from '../protectionCenter.types';

const typeIcon: Record<AutomationType, typeof MagnifyingGlassIcon> = {
  scan: MagnifyingGlassIcon,
  optimize: BoltIcon,
  update: ArrowPathIcon,
  backup: ArchiveBoxXMarkIcon,
};

export interface UpcomingAutomationProps {
  tasks: ScheduledTask[];
  isPro: boolean;
}

export function UpcomingAutomation({ tasks, isPro }: UpcomingAutomationProps) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4 text-center">
        <p className="text-small text-[var(--avs-text-muted)]">No scheduled tasks.</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="Upcoming automation"
    >
      <ul className="space-y-3" role="list">
        {tasks.map((task) => {
          const Icon = typeIcon[task.type] ?? MagnifyingGlassIcon;
          const isLocked = task.proOnly && !isPro;
          return (
            <li
              key={task.id}
              className={clsx(
                'flex items-center gap-3 rounded-[var(--avs-radius-md)] p-2',
                isLocked && 'opacity-60',
              )}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]">
                <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-small font-medium text-[var(--avs-text-primary)]">{task.name}</span>
                  {task.proOnly && (
                    <StarIcon className="h-3.5 w-3.5 text-[var(--avs-brand-primary)]" aria-label="Pro feature" />
                  )}
                </div>
                <p className="text-caption text-[var(--avs-text-muted)]">{task.recurrence}</p>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={clsx(
                    'text-caption font-medium',
                    task.enabled ? 'text-[var(--avs-success)]' : 'text-[var(--avs-text-muted)]',
                  )}
                >
                  {isLocked ? 'Pro only' : task.enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {!isPro && (
        <p className="mt-3 pt-3 border-t border-[var(--avs-border)] text-caption text-[var(--avs-text-muted)]">
          Upgrade to Professional to unlock automated scheduling.
        </p>
      )}
    </div>
  );
}
