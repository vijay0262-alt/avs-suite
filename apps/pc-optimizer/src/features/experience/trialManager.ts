/**
 * Trial Manager — manages trial state lifecycle.
 *
 * Supports:
 *   Trial Active, Trial Expired, Trial Available,
 *   Trial Used, Trial Disabled, Future Promotional Trial, Feature Trial
 *
 * Different trial durations are supported via configuration.
 */
import type { TrialInfo, TrialStatus, TrialConfiguration } from './types';
import { experienceEvents } from './experienceEvents';

export class TrialManager {
  private _status: TrialStatus = 'available';
  private _startedAt: string | null = null;
  private _expiresAt: string | null = null;
  private _config: TrialConfiguration;
  private _trialCount: number = 0;
  private _featureTrials: Map<string, { startedAt: string; expiresAt: string }> = new Map();

  constructor(config: TrialConfiguration) {
    this._config = config;
    if (!config.enabled) {
      this._status = 'disabled';
    }
  }

  /**
   * Start a trial.
   */
  startTrial(durationDays?: number): boolean {
    if (this._status === 'disabled') return false;
    if (this._status === 'active') return false;
    if (this._trialCount >= this._config.maxTrials) {
      this._status = 'used';
      return false;
    }

    const duration = durationDays ?? this._config.defaultDurationDays;
    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + duration);

    this._startedAt = now.toISOString();
    this._expiresAt = expires.toISOString();
    this._status = 'active';
    this._trialCount++;

    experienceEvents.emit('trial_started', {
      timestamp: now.toISOString(),
      durationDays: duration,
      expiresAt: this._expiresAt,
    });

    return true;
  }

  /**
   * Start a feature-specific trial.
   */
  startFeatureTrial(featureId: string, durationDays?: number): boolean {
    if (this._status === 'disabled') return false;
    if (this._featureTrials.has(featureId)) return false;

    const featureTrial = this._config.featureTrials.find((ft) => ft.featureId === featureId);
    const duration = durationDays ?? featureTrial?.durationDays ?? this._config.defaultDurationDays;

    const now = new Date();
    const expires = new Date(now);
    expires.setDate(expires.getDate() + duration);

    this._featureTrials.set(featureId, {
      startedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    });

    return true;
  }

  /**
   * Check if a feature trial is active.
   */
  isFeatureTrialActive(featureId: string): boolean {
    const trial = this._featureTrials.get(featureId);
    if (!trial) return false;
    return new Date(trial.expiresAt).getTime() > Date.now();
  }

  /**
   * Expire the current trial immediately.
   */
  expireTrial(): void {
    if (this._status !== 'active') return;
    this._status = 'expired';

    experienceEvents.emit('trial_expired', {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current trial info.
   */
  getTrialInfo(): TrialInfo {
    this._checkExpiry();

    let daysRemaining = 0;
    if (this._status === 'active' && this._expiresAt) {
      const ms = new Date(this._expiresAt).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    }

    return {
      status: this._status,
      startedAt: this._startedAt,
      expiresAt: this._expiresAt,
      durationDays: this._config.defaultDurationDays,
      daysRemaining,
      isEligible: this._status === 'available' && this._trialCount < this._config.maxTrials,
    };
  }

  /**
   * Get trial status.
   */
  getStatus(): TrialStatus {
    this._checkExpiry();
    return this._status;
  }

  /**
   * Check if trial is active.
   */
  isTrialActive(): boolean {
    this._checkExpiry();
    return this._status === 'active';
  }

  /**
   * Update trial configuration.
   */
  updateConfig(config: TrialConfiguration): void {
    this._config = config;
    if (!config.enabled && this._status === 'available') {
      this._status = 'disabled';
    }
  }

  /**
   * Reset trial state (for testing).
   */
  reset(): void {
    this._status = this._config.enabled ? 'available' : 'disabled';
    this._startedAt = null;
    this._expiresAt = null;
    this._trialCount = 0;
    this._featureTrials.clear();
  }

  // ── Private ────────────────────────────────────────────────

  private _checkExpiry(): void {
    if (this._status === 'active' && this._expiresAt) {
      if (new Date(this._expiresAt).getTime() <= Date.now()) {
        this._status = 'expired';
        experienceEvents.emit('trial_expired', {
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
