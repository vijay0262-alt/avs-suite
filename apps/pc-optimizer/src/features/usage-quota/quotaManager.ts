/**
 * Quota Manager — orchestrates the quota engine.
 *
 * Provides APIs:
 *   getQuota(quotaId)
 *   getRemaining(quotaId)
 *   isQuotaAvailable(quotaId)
 *   consumeQuota(quotaId, amount, action, sourceModule, ...)
 *   restoreQuota(quotaId, amount)
 *   resetQuota(quotaId)
 *   resetAll()
 *   getUsageStatistics()
 *   getQuotaSummary()
 *
 * Integrates: Registry, Tracker, ResetService, Statistics, Storage, Events.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  QuotaState,
  QuotaConfig,
  QuotaSummary,
  QuotaStatistics,
  QuotaStorageAdapter,
  QuotaStorageData,
} from './types';
import { QuotaRegistry } from './quotaRegistry';
import { QuotaTracker } from './quotaTracker';
import { QuotaResetService } from './quotaResetService';
import { QuotaStatisticsService } from './quotaStatistics';
import { QuotaValidator } from './quotaValidator';
import { MemoryQuotaStorage } from './quotaStorage';
import { quotaEvents } from './quotaEvents';

export class QuotaManager {
  private _registry: QuotaRegistry;
  private _tracker: QuotaTracker;
  private _resetService: QuotaResetService;
  private _statistics: QuotaStatisticsService;
  private _validator: QuotaValidator;
  private _storage: QuotaStorageAdapter;
  private _states: Map<string, QuotaState> = new Map();
  private _initialized: boolean = false;

  constructor(storage?: QuotaStorageAdapter) {
    this._registry = new QuotaRegistry();
    this._tracker = new QuotaTracker();
    this._resetService = new QuotaResetService();
    this._validator = new QuotaValidator();
    this._storage = storage ?? new MemoryQuotaStorage();
    this._statistics = new QuotaStatisticsService(this._tracker, this._registry);
  }

  /**
   * Initialize the quota engine with default definitions.
   * Loads from storage if available, otherwise creates fresh state.
   */
  async initialize(): Promise<void> {
    this._registry.loadDefaults();
    await this._loadFromStorage();
    this._initialized = true;
  }

  /**
   * Initialize with a custom configuration.
   */
  async initializeWithConfig(config: QuotaConfig): Promise<void> {
    this._registry.loadConfig(config);
    await this._loadFromStorage();
    this._initialized = true;
  }

  /**
   * Load quota definitions from a configuration object.
   */
  loadConfig(config: QuotaConfig): void {
    this._registry.loadConfig(config);
    this._rebuildStates();
  }

  /**
   * Get a quota's current state.
   */
  getQuota(quotaId: string): QuotaState | null {
    this._ensureQuotaExists(quotaId);
    return this._states.get(quotaId) ?? null;
  }

  /**
   * Get remaining usage for a quota.
   */
  getRemaining(quotaId: string): number {
    const state = this._states.get(quotaId);
    if (!state) return 0;
    if (state.isUnlimited) return Infinity;
    if (!state.isEnabled) return 0;
    return state.remainingUsage;
  }

  /**
   * Check if a quota has available usage.
   */
  isQuotaAvailable(quotaId: string, amount: number = 1): boolean {
    const state = this._states.get(quotaId);
    if (!state || !state.isEnabled) return false;
    if (state.isUnlimited) return true;
    return state.remainingUsage >= amount;
  }

  /**
   * Consume quota usage.
   * Returns true if consumption was successful, false if quota exceeded.
   */
  consumeQuota(
    quotaId: string,
    amount: number,
    action: string,
    sourceModule: string,
    options?: {
      feature?: string;
      capability?: string;
      userId?: string;
      deviceId?: string;
      sessionId?: string;
    },
  ): boolean {
    this._ensureQuotaExists(quotaId);
    const state = this._states.get(quotaId);
    if (!state || !state.isEnabled) return false;

    if (state.isUnlimited) {
      this._tracker.record({
        quotaId,
        timestamp: new Date().toISOString(),
        action,
        amountUsed: amount,
        remaining: Infinity,
        sourceModule,
        ...options,
      });
      quotaEvents.emit('quota_consumed', {
        timestamp: new Date().toISOString(),
        quotaId,
        amountUsed: amount,
        remaining: Infinity,
        action,
        sourceModule,
      });
      return true;
    }

    if (state.remainingUsage < amount) {
      quotaEvents.emit('quota_exceeded', {
        timestamp: new Date().toISOString(),
        quotaId,
        attemptedAmount: amount,
        remaining: state.remainingUsage,
        limitValue: state.limitValue,
      });
      return false;
    }

    const newUsage = state.currentUsage + amount;
    const newRemaining = state.limitValue - newUsage;
    const updatedState: QuotaState = {
      ...state,
      currentUsage: newUsage,
      remainingUsage: newRemaining,
      isAvailable: newRemaining > 0,
    };
    this._states.set(quotaId, updatedState);

    this._tracker.record({
      quotaId,
      timestamp: new Date().toISOString(),
      action,
      amountUsed: amount,
      remaining: newRemaining,
      sourceModule,
      ...options,
    });

    quotaEvents.emit('quota_consumed', {
      timestamp: new Date().toISOString(),
      quotaId,
      amountUsed: amount,
      remaining: newRemaining,
      action,
      sourceModule,
    });

    quotaEvents.emit('quota_updated', {
      timestamp: new Date().toISOString(),
      quotaId,
      currentUsage: newUsage,
      remaining: newRemaining,
    });

    void this._persistState();

    return true;
  }

  /**
   * Restore quota usage (e.g. after undo/rollback).
   */
  restoreQuota(quotaId: string, amount: number): boolean {
    this._ensureQuotaExists(quotaId);
    const state = this._states.get(quotaId);
    if (!state || !state.isEnabled || state.isUnlimited) return false;

    const newUsage = Math.max(0, state.currentUsage - amount);
    const newRemaining = state.limitValue - newUsage;
    const updatedState: QuotaState = {
      ...state,
      currentUsage: newUsage,
      remainingUsage: newRemaining,
      isAvailable: newRemaining > 0,
    };
    this._states.set(quotaId, updatedState);

    quotaEvents.emit('quota_restored', {
      timestamp: new Date().toISOString(),
      quotaId,
      amountRestored: amount,
      remaining: newRemaining,
    });

    quotaEvents.emit('quota_updated', {
      timestamp: new Date().toISOString(),
      quotaId,
      currentUsage: newUsage,
      remaining: newRemaining,
    });

    void this._persistState();

    return true;
  }

  /**
   * Reset a single quota.
   */
  resetQuota(quotaId: string): boolean {
    this._ensureQuotaExists(quotaId);
    const state = this._states.get(quotaId);
    if (!state) return false;

    const previousUsage = state.currentUsage;
    const newState = this._resetService.resetState(state);
    this._states.set(quotaId, newState);

    quotaEvents.emit('quota_reset', {
      timestamp: new Date().toISOString(),
      quotaId,
      previousUsage,
      resetTo: 0,
    });

    void this._persistState();

    return true;
  }

  /**
   * Reset all quotas.
   */
  resetAll(): void {
    this._states = this._resetService.resetAll(this._states);

    for (const [id] of this._states) {
      quotaEvents.emit('quota_reset', {
        timestamp: new Date().toISOString(),
        quotaId: id,
        previousUsage: 0,
        resetTo: 0,
      });
    }

    void this._persistState();
  }

  /**
   * Check and perform resets for quotas that need resetting.
   */
  performScheduledResets(): void {
    this._states = this._resetService.resetIfNeeded(this._states);
    void this._persistState();
  }

  /**
   * Get usage statistics.
   */
  getUsageStatistics(): QuotaStatistics {
    const stats = this._statistics.generateStatistics(this._states);

    quotaEvents.emit('statistics_updated', {
      timestamp: new Date().toISOString(),
      totalQuotas: this._states.size,
      activeQuotas: Array.from(this._states.values()).filter((s) => s.isEnabled).length,
      exceededQuotas: Array.from(this._states.values()).filter((s) => !s.isAvailable && !s.isUnlimited && s.isEnabled).length,
    });

    return stats;
  }

  /**
   * Get a summary of all quotas.
   */
  getQuotaSummary(): QuotaSummary {
    const states = Array.from(this._states.values());
    return {
      totalQuotas: states.length,
      activeQuotas: states.filter((s) => s.isEnabled).length,
      unlimitedQuotas: states.filter((s) => s.isUnlimited).length,
      exceededQuotas: states.filter((s) => !s.isAvailable && !s.isUnlimited && s.isEnabled).length,
      disabledQuotas: states.filter((s) => !s.isEnabled).length,
      quotas: states,
    };
  }

  /**
   * Get the registry (for advanced queries).
   */
  getRegistry(): QuotaRegistry {
    return this._registry;
  }

  /**
   * Get the tracker (for advanced queries).
   */
  getTracker(): QuotaTracker {
    return this._tracker;
  }

  /**
   * Get the validator.
   */
  getValidator(): QuotaValidator {
    return this._validator;
  }

  /**
   * Check if the manager is initialized.
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Persist current state to storage.
   */
  async persist(): Promise<void> {
    await this._persistState();
  }

  /**
   * Clear all state and records.
   */
  async clear(): Promise<void> {
    this._states.clear();
    this._tracker.clear();
    await this._storage.clear();
    this._initialized = false;
  }

  // ── Private ────────────────────────────────────────────────

  private _ensureQuotaExists(quotaId: string): void {
    if (!this._states.has(quotaId)) {
      const def = this._registry.getQuota(quotaId);
      if (def) {
        this._states.set(
          quotaId,
          this._resetService.createInitialState(
            def.id,
            def.limitValue,
            def.limitType,
            def.resetPolicy,
            def.usageUnit,
            def.isUnlimited,
            def.enabled,
          ),
        );
      }
    }
  }

  private _rebuildStates(): void {
    const newStates = new Map<string, QuotaState>();
    for (const quota of this._registry.getAllQuotas()) {
      const existing = this._states.get(quota.id);
      if (existing) {
        // Preserve usage but update limit/flags from definition
        newStates.set(quota.id, {
          ...existing,
          limitValue: quota.limitValue,
          limitType: quota.limitType,
          resetPolicy: quota.resetPolicy,
          usageUnit: quota.usageUnit,
          isUnlimited: quota.isUnlimited,
          isEnabled: quota.enabled,
          remainingUsage: quota.isUnlimited ? Infinity : Math.max(0, quota.limitValue - existing.currentUsage),
        });
      } else {
        newStates.set(
          quota.id,
          this._resetService.createInitialState(
            quota.id,
            quota.limitValue,
            quota.limitType,
            quota.resetPolicy,
            quota.usageUnit,
            quota.isUnlimited,
            quota.enabled,
          ),
        );
      }
    }
    this._states = newStates;
  }

  private async _loadFromStorage(): Promise<void> {
    try {
      const data = await this._storage.load();
      const validation = this._validator.validateStorageData(data);
      if (!validation.valid) {
        // Storage is corrupted — start fresh
        this._rebuildStates();
        return;
      }

      // Load records
      this._tracker.loadRecords(data.records);

      // Load states (merge with definitions)
      this._rebuildStates();

      // Restore usage from storage
      for (const [quotaId, storedState] of Object.entries(data.states)) {
        const state = this._states.get(quotaId);
        if (state) {
          this._states.set(quotaId, {
            ...state,
            currentUsage: storedState.currentUsage,
            remainingUsage: state.isUnlimited ? Infinity : Math.max(0, state.limitValue - storedState.currentUsage),
            isAvailable: state.isUnlimited ? true : (state.limitValue - storedState.currentUsage) > 0,
            lastResetAt: storedState.lastResetAt,
          });
        }
      }

      // Perform scheduled resets if needed
      this._states = this._resetService.resetIfNeeded(this._states);
    } catch {
      // Storage failed — start fresh
      this._rebuildStates();
    }
  }

  private async _persistState(): Promise<void> {
    try {
      const states: Record<string, { currentUsage: number; lastResetAt: string | null }> = {};
      for (const [id, state] of this._states) {
        states[id] = {
          currentUsage: state.currentUsage,
          lastResetAt: state.lastResetAt,
        };
      }

      const data: QuotaStorageData = {
        states,
        records: this._tracker.exportRecords(),
      };

      await this._storage.save(data);
    } catch {
      // Storage failed — fail silently
    }
  }
}

export const quotaManager = new QuotaManager();
