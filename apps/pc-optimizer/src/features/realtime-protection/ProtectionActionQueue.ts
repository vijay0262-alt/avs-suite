/**
 * ProtectionActionQueue — bounded priority queue for protection actions.
 *
 * Features:
 *   - Priority-based ordering (critical > high > normal > low)
 *   - Max queue size with overflow detection
 *   - Concurrency limiting
 *   - Retry support with max attempts
 *   - Queue depth monitoring
 */
import type { QueuedAction, ActionType, ActionPriority, ActionResult } from './types';

const PRIORITY_ORDER: ActionPriority[] = ['critical', 'high', 'normal', 'low'];

export class ProtectionActionQueue {
  private queue: QueuedAction[] = [];
  private processing = new Map<string, QueuedAction>();
  private maxQueueSize: number;
  private maxConcurrent: number;
  private overflowCount = 0;
  private droppedCount = 0;

  constructor(maxQueueSize = 1000, maxConcurrent = 3) {
    this.maxQueueSize = maxQueueSize;
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(
    eventId: string,
    type: ActionType,
    priority: ActionPriority = 'normal',
    maxAttempts = 3,
  ): QueuedAction | null {
    if (this.queue.length >= this.maxQueueSize) {
      this.overflowCount++;
      this.droppedCount++;

      // Drop lowest priority items to make room for higher priority
      const lowestIdx = this.findLowestPriorityIndex();
      if (lowestIdx >= 0 && PRIORITY_ORDER.indexOf(this.queue[lowestIdx]!.priority) > PRIORITY_ORDER.indexOf(priority)) {
        this.queue.splice(lowestIdx, 1);
      } else {
        return null;
      }
    }

    const action: QueuedAction = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      eventId,
      type,
      priority,
      status: 'queued',
      queuedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      attempts: 0,
      maxAttempts,
    };

    this.queue.push(action);
    this.sortQueue();
    return action;
  }

  dequeue(): QueuedAction | null {
    if (this.processing.size >= this.maxConcurrent) return null;

    const idx = this.queue.findIndex((a) => a.status === 'queued');
    if (idx < 0) return null;

    const action = this.queue.splice(idx, 1)[0]!;
    action.status = 'processing';
    action.startedAt = Date.now();
    action.attempts++;
    this.processing.set(action.id, action);
    return action;
  }

  complete(actionId: string, result: ActionResult): void {
    const action = this.processing.get(actionId);
    if (!action) return;

    action.status = 'completed';
    action.completedAt = Date.now();
    action.result = result;
    this.processing.delete(actionId);
  }

  fail(actionId: string, error: string): void {
    const action = this.processing.get(actionId);
    if (!action) return;

    this.processing.delete(actionId);

    if (action.attempts < action.maxAttempts) {
      action.status = 'queued';
      action.error = error;
      this.queue.push(action);
      this.sortQueue();
    } else {
      action.status = 'failed';
      action.completedAt = Date.now();
      action.error = error;
    }
  }

  cancel(actionId: string): void {
    const idx = this.queue.findIndex((a) => a.id === actionId);
    if (idx >= 0) {
      this.queue[idx]!.status = 'cancelled';
      this.queue.splice(idx, 1);
      return;
    }
    this.processing.delete(actionId);
  }

  defer(actionId: string): void {
    const action = this.processing.get(actionId);
    if (!action) return;

    this.processing.delete(actionId);
    action.status = 'deferred';
    action.completedAt = Date.now();
  }

  getQueueDepth(): number {
    return this.queue.length;
  }

  getProcessingCount(): number {
    return this.processing.size;
  }

  getProcessingActions(): QueuedAction[] {
    return [...this.processing.values()];
  }

  getOverflowCount(): number {
    return this.overflowCount;
  }

  getDroppedCount(): number {
    return this.droppedCount;
  }

  getQueuedActions(): QueuedAction[] {
    return [...this.queue];
  }

  hasCapacity(): boolean {
    return this.queue.length < this.maxQueueSize && this.processing.size < this.maxConcurrent;
  }

  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.overflowCount = 0;
    this.droppedCount = 0;
  }

  setMaxQueueSize(size: number): void {
    this.maxQueueSize = size;
  }

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max;
  }

  private findLowestPriorityIndex(): number {
    let lowestIdx = -1;
    let lowestPriority = -1;

    for (let i = 0; i < this.queue.length; i++) {
      const priorityIdx = PRIORITY_ORDER.indexOf(this.queue[i]!.priority);
      if (priorityIdx > lowestPriority) {
        lowestPriority = priorityIdx;
        lowestIdx = i;
      }
    }

    return lowestIdx;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.queuedAt - b.queuedAt;
    });
  }
}
