/**
 * Device Profile Manager — public API facade for the AI Device Profile Engine.
 *
 * Public APIs:
 *   buildDeviceProfile()      — generate a new profile
 *   getDeviceProfile()        — retrieve current profile
 *   refreshProfile()          — re-generate from latest data
 *   getPrimaryProfile()       — get primary profile type
 *   getSecondaryProfiles()    — get secondary profile scores
 *   getProfileHistory()       — get history entries and change records
 *   getProfileStatistics()    — get aggregated statistics
 *   registerPlugin()          — register a profile provider plugin
 *   unregisterPlugin()        — unregister a plugin
 *   validateProfile()         — validate current profile
 *   updateConfig()            — update configuration
 *   clear()                   — reset state
 */
import type {
  AIContext,
  KnowledgeObject,
  PredictionList,
  DeviceProfile,
  ProfileStatistics,
  ProfileConfiguration,
  ProfileProviderPlugin,
  ProfileValidationResult,
  ProfileHistoryEntry,
  ProfileChangeRecord,
  DeviceProfileType,
  ProfileScore,
} from './types';
import { DeviceProfileEngine } from './deviceProfileEngine';
import { ProfileValidator } from './profileValidator';
import { DEFAULT_PROFILE_CONFIG, createProfileConfig } from './profileConfiguration';

export class DeviceProfileManager {
  private _engine: DeviceProfileEngine;
  private _validator: ProfileValidator;
  private _currentProfile: DeviceProfile | null = null;
  private _config: ProfileConfiguration;

  constructor(config?: ProfileConfiguration) {
    this._config = config ?? { ...DEFAULT_PROFILE_CONFIG };
    this._engine = new DeviceProfileEngine(this._config);
    this._validator = new ProfileValidator(this._config);
  }

  buildDeviceProfile(
    context: AIContext,
    knowledge: KnowledgeObject,
    predictions: PredictionList | null,
  ): DeviceProfile | null {
    const profile = this._engine.generateProfile(context, knowledge, predictions);
    if (profile) {
      this._currentProfile = profile;
    }
    return profile;
  }

  getDeviceProfile(): DeviceProfile | null {
    return this._currentProfile;
  }

  refreshProfile(
    context: AIContext,
    knowledge: KnowledgeObject,
    predictions: PredictionList | null,
  ): DeviceProfile | null {
    return this.buildDeviceProfile(context, knowledge, predictions);
  }

  getPrimaryProfile(): DeviceProfileType | null {
    return this._currentProfile?.primaryProfile ?? null;
  }

  getSecondaryProfiles(): ProfileScore[] {
    return this._currentProfile?.secondaryProfiles ?? [];
  }

  getProfileHistory(): { entries: ProfileHistoryEntry[]; changes: ProfileChangeRecord[] } {
    return {
      entries: this._engine.history.getEntries(),
      changes: this._engine.history.getChangeRecords(),
    };
  }

  getProfileStatistics(): ProfileStatistics {
    const profile = this._currentProfile;
    const changes = this._engine.history.getChangeRecords();

    const byType: Record<string, number> = {};
    const byPerformanceTier: Record<string, number> = {};
    const byWorkload: Record<string, number> = {};

    if (profile) {
      byType[profile.primaryProfile] = 1;
      byPerformanceTier[profile.hardwareSummary.performanceTier] = 1;
      byWorkload[profile.workloadSummary.primaryWorkload] = 1;
    }

    return {
      totalProfiles: this._currentProfile ? 1 : 0,
      byType,
      byPerformanceTier,
      byWorkload,
      averageConfidence: profile?.confidenceScore ?? 0,
      profileChangesCount: changes.length,
      lastUpdated: profile?.updatedAt ?? null,
      profileVersion: this._config.profileVersion,
    };
  }

  registerPlugin(plugin: ProfileProviderPlugin): boolean {
    return this._engine.registry.registerPlugin(plugin);
  }

  unregisterPlugin(name: string): boolean {
    return this._engine.registry.unregisterPlugin(name);
  }

  validateProfile(): ProfileValidationResult {
    if (!this._currentProfile) {
      return { valid: false, issues: [{ level: 'error', code: 'NO_PROFILE', message: 'No profile available' }] };
    }
    return this._validator.validateProfile(this._currentProfile);
  }

  updateConfig(overrides: Partial<ProfileConfiguration>): void {
    this._config = createProfileConfig(overrides);
    this._engine.updateConfig(this._config);
    this._validator.updateConfig(this._config);
  }

  get config(): ProfileConfiguration {
    return this._config;
  }

  get events() {
    return this._engine.events;
  }

  clear(): void {
    this._currentProfile = null;
    this._engine.history.clear();
    this._engine.registry.clear();
    this._engine.events.clear();
  }
}
