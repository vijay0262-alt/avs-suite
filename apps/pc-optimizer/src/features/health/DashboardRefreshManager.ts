/**
 * DashboardRefreshManager — singleton that keeps the Dashboard reactive
 * even when the Dashboard page is not mounted.
 *
 * Problem:
 *   DashboardViewModel subscribes to optimizationEventBus in bootstrap(),
 *   but it only exists while the Dashboard page is mounted. If the user
 *   cleans junk from the Junk Cleaner page, no Dashboard ViewModel is
 *   listening — the Dashboard shows stale data when the user navigates back.
 *
 * Solution:
 *   This singleton always listens to optimizationEventBus. When a Dashboard
 *   ViewModel mounts, it registers here. If an optimization event arrives
 *   while a ViewModel is registered, the manager relays the event so the
 *   ViewModel can refresh immediately. If no ViewModel is registered, the
 *   manager sets a "pending refresh" flag. When a ViewModel registers and
 *   a refresh is pending, it gets an immediate callback so it can load
 *   fresh data on mount.
 */

import { optimizationEventBus } from './OptimizationEventBus';
import type { OptimizationEvent } from './OptimizationEventBus';

type RefreshCallback = (event: OptimizationEvent) => void;

class DashboardRefreshManagerImpl {
  private activeCallback: RefreshCallback | null = null;
  private pendingRefresh: OptimizationEvent | null = null;
  private globalUnsub: (() => void) | null = null;
  private initialized = false;

  /**
   * Start listening to optimization events globally.
   * Called once at app startup.
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.globalUnsub = optimizationEventBus.subscribe((event) => {
      if (this.activeCallback) {
        this.activeCallback(event);
      } else {
        // No Dashboard mounted — remember the latest event
        this.pendingRefresh = event;
      }
    });
  }

  /**
   * Register a Dashboard ViewModel's refresh callback.
   * If a pending refresh exists, fires immediately.
   */
  register(callback: RefreshCallback): () => void {
    this.activeCallback = callback;
    // If events arrived while no Dashboard was mounted, trigger refresh
    if (this.pendingRefresh) {
      const pending = this.pendingRefresh;
      this.pendingRefresh = null;
      // Defer to next tick so the ViewModel can finish mounting first
      setTimeout(() => callback(pending), 0);
    }
    return () => {
      if (this.activeCallback === callback) {
        this.activeCallback = null;
      }
    };
  }

  /**
   * Check if a pending refresh exists (for testing).
   */
  hasPendingRefresh(): boolean {
    return this.pendingRefresh !== null;
  }

  /**
   * Reset state (for testing).
   */
  reset(): void {
    if (this.globalUnsub) {
      this.globalUnsub();
      this.globalUnsub = null;
    }
    this.initialized = false;
    this.activeCallback = null;
    this.pendingRefresh = null;
  }
}

export const dashboardRefreshManager = new DashboardRefreshManagerImpl();
