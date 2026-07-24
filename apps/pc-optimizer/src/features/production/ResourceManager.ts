/**
 * Resource Management (Part 8) — Production Readiness Framework.
 *
 * Tracks and manages resources to prevent leaks and exhaustion:
 *   - File handles
 *   - Temporary resources
 *   - Timers
 *   - Event listeners / subscriptions
 *   - Background workers
 *
 * Provides a registry for tracking all resources and a graceful
 * shutdown mechanism.
 */

import { logger } from './Logger';
import { errorHandler } from './ErrorHandler';

// ── Resource Types ──────────────────────────────────────────────────

export type ResourceType = 'file_handle' | 'timer' | 'event_listener' | 'worker' | 'temp_resource';

export interface TrackedResource {
  id: string;
  type: ResourceType;
  name: string;
  createdAt: string;
  /** Cleanup function to release the resource. */
  cleanup: () => void;
  /** Whether the resource has been released. */
  released: boolean;
}

type ResourceListener = (resource: TrackedResource) => void;

// ── Resource Manager ────────────────────────────────────────────────

class ResourceManagerImpl {
  private resources = new Map<string, TrackedResource>();
  private listeners = new Set<ResourceListener>();

  /**
   * Track a file handle with automatic cleanup.
   */
  trackFileHandle(name: string, closeFn: () => void): string {
    return this.track('file_handle', name, closeFn);
  }

  /**
   * Track a timer with automatic cleanup.
   */
  trackTimer(name: string, timerId: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): string {
    return this.track('timer', name, () => {
      clearTimeout(timerId as ReturnType<typeof setTimeout>);
      clearInterval(timerId as ReturnType<typeof setInterval>);
    });
  }

  /**
   * Track an event listener subscription with automatic cleanup.
   */
  trackEventListener(name: string, unsubscribeFn: () => void): string {
    return this.track('event_listener', name, unsubscribeFn);
  }

  /**
   * Track a background worker with automatic cleanup.
   */
  trackWorker(name: string, terminateFn: () => void): string {
    return this.track('worker', name, terminateFn);
  }

  /**
   * Track a temporary resource with automatic cleanup.
   */
  trackTempResource(name: string, cleanupFn: () => void): string {
    return this.track('temp_resource', name, cleanupFn);
  }

  /**
   * Core tracking method.
   */
  private track(type: ResourceType, name: string, cleanup: () => void): string {
    const id = `res-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const resource: TrackedResource = {
      id,
      type,
      name,
      createdAt: new Date().toISOString(),
      cleanup,
      released: false,
    };
    this.resources.set(id, resource);
    logger.debug('ResourceManager', 'track', `Tracking ${type}: ${name}`, {
      data: { resourceId: id },
    });
    this.notifyListeners(resource);
    return id;
  }

  /**
   * Release a specific resource by ID.
   */
  release(resourceId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource || resource.released) return false;

    try {
      resource.cleanup();
      resource.released = true;
      logger.debug('ResourceManager', 'release', `Released ${resource.type}: ${resource.name}`);
      this.notifyListeners(resource);
    } catch (err) {
      errorHandler.reportException('warning', `resource-release:${resource.name}`, err);
      resource.released = true; // mark as released even if cleanup failed
    }

    this.resources.delete(resourceId);
    return true;
  }

  /**
   * Release all resources of a specific type.
   */
  releaseByType(type: ResourceType): number {
    let count = 0;
    for (const [id, resource] of this.resources) {
      if (resource.type === type && !resource.released) {
        this.release(id);
        count++;
      }
    }
    if (count > 0) {
      logger.info('ResourceManager', 'releaseByType', `Released ${count} ${type} resources`);
    }
    return count;
  }

  /**
   * Gracefully shut down all resources.
   * Called during application shutdown.
   */
  shutdown(): void {
    logger.info('ResourceManager', 'shutdown', `Shutting down ${this.resources.size} resources`);

    // Release workers first (most expensive)
    this.releaseByType('worker');

    // Then timers
    this.releaseByType('timer');

    // Then file handles
    this.releaseByType('file_handle');

    // Then event listeners
    this.releaseByType('event_listener');

    // Then temp resources
    this.releaseByType('temp_resource');

    // Release any remaining
    for (const [id] of this.resources) {
      this.release(id);
    }

    this.listeners.clear();
  }

  // ── Queries ───────────────────────────────────────────────────────

  getActiveResources(): TrackedResource[] {
    return Array.from(this.resources.values()).filter((r) => !r.released);
  }

  getResourceCount(): number {
    return this.resources.size;
  }

  getActiveCount(): number {
    return this.getActiveResources().length;
  }

  getResourcesByType(type: ResourceType): TrackedResource[] {
    return this.getActiveResources().filter((r) => r.type === type);
  }

  /**
   * Check for potential resource leaks (resources held for a long time).
   */
  getPotentialLeaks(maxAgeMs: number = 300_000): TrackedResource[] {
    const now = Date.now();
    return this.getActiveResources().filter((r) => {
      const age = now - new Date(r.createdAt).getTime();
      return age > maxAgeMs;
    });
  }

  // ── Subscription ──────────────────────────────────────────────────

  subscribe(listener: ResourceListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ── Maintenance ───────────────────────────────────────────────────

  clear(): void {
    this.resources.clear();
    this.listeners.clear();
  }

  private notifyListeners(resource: TrackedResource): void {
    for (const listener of this.listeners) {
      try {
        listener(resource);
      } catch {
        // ignore
      }
    }
  }
}

// ── Disposable Helper ───────────────────────────────────────────────

/**
 * A helper class for managing resources with automatic cleanup.
 * Use with try/finally or the `using` pattern.
 *
 * @example
 * const scope = new DisposableScope();
 * scope.addTimer('refresh', setInterval(() => {}, 5000));
 * scope.addEventListener('bus', bus.subscribe(() => {}));
 * // Later:
 * scope.dispose(); // cleans up all tracked resources
 */
export class DisposableScope {
  private resourceIds: string[] = [];

  addTimer(name: string, timerId: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): this {
    const id = resourceManager.trackTimer(name, timerId);
    this.resourceIds.push(id);
    return this;
  }

  addEventListener(name: string, unsubscribeFn: () => void): this {
    const id = resourceManager.trackEventListener(name, unsubscribeFn);
    this.resourceIds.push(id);
    return this;
  }

  addFileHandle(name: string, closeFn: () => void): this {
    const id = resourceManager.trackFileHandle(name, closeFn);
    this.resourceIds.push(id);
    return this;
  }

  addWorker(name: string, terminateFn: () => void): this {
    const id = resourceManager.trackWorker(name, terminateFn);
    this.resourceIds.push(id);
    return this;
  }

  addTempResource(name: string, cleanupFn: () => void): this {
    const id = resourceManager.trackTempResource(name, cleanupFn);
    this.resourceIds.push(id);
    return this;
  }

  dispose(): void {
    for (const id of this.resourceIds) {
      resourceManager.release(id);
    }
    this.resourceIds = [];
  }
}

export const resourceManager = new ResourceManagerImpl();
