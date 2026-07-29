/**
 * Profile History — tracks profile evolution over time.
 *
 * Detects: new profile, profile strengthened, profile weakened,
 * profile changed, profile merged, profile split.
 */
import type {
  DeviceProfile,
  ProfileHistoryEntry,
  ProfileChangeRecord,
  ProfileChangeType,
  ProfileConfiguration,
} from './types';
import { generateProfileHistoryId, generateProfileChangeId, clampScore } from './types';

export class ProfileHistory {
  private _entries: ProfileHistoryEntry[] = [];
  private _changeRecords: ProfileChangeRecord[] = [];
  private _previousProfile: DeviceProfile | null = null;
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  recordCreated(profile: DeviceProfile): ProfileChangeRecord | null {
    if (!this._config.enableHistory) return null;

    const change: ProfileChangeRecord = {
      id: generateProfileChangeId(),
      timestamp: new Date().toISOString(),
      changeType: 'new',
      fromProfile: null,
      toProfile: profile.primaryProfile,
      fromScore: null,
      toScore: profile.confidenceScore,
      description: `New profile created: ${profile.primaryProfile}`,
      metadata: { profileId: profile.id },
    };

    this._changeRecords.push(change);
    this._addEntry({
      id: generateProfileHistoryId(),
      profileId: profile.id,
      action: 'created',
      timestamp: new Date().toISOString(),
      metadata: { primaryProfile: profile.primaryProfile },
    });
    this._previousProfile = profile;
    this._trim();
    return change;
  }

  recordUpdated(oldProfile: DeviceProfile, newProfile: DeviceProfile): ProfileChangeRecord[] {
    if (!this._config.enableHistory) return [];
    const changes: ProfileChangeRecord[] = [];

    // Detect profile change
    if (oldProfile.primaryProfile !== newProfile.primaryProfile) {
      changes.push({
        id: generateProfileChangeId(),
        timestamp: new Date().toISOString(),
        changeType: 'changed',
        fromProfile: oldProfile.primaryProfile,
        toProfile: newProfile.primaryProfile,
        fromScore: oldProfile.confidenceScore,
        toScore: newProfile.confidenceScore,
        description: `Primary profile changed from ${oldProfile.primaryProfile} to ${newProfile.primaryProfile}`,
        metadata: { profileId: newProfile.id },
      });
    }

    // Detect confidence change
    const confidenceDelta = newProfile.confidenceScore - oldProfile.confidenceScore;
    if (Math.abs(confidenceDelta) > 0.05) {
      const changeType: ProfileChangeType = confidenceDelta > 0 ? 'strengthened' : 'weakened';
      changes.push({
        id: generateProfileChangeId(),
        timestamp: new Date().toISOString(),
        changeType,
        fromProfile: newProfile.primaryProfile,
        toProfile: newProfile.primaryProfile,
        fromScore: oldProfile.confidenceScore,
        toScore: newProfile.confidenceScore,
        description: `Profile ${changeType}: confidence ${oldProfile.confidenceScore.toFixed(2)} → ${newProfile.confidenceScore.toFixed(2)}`,
        metadata: { profileId: newProfile.id, delta: confidenceDelta },
      });
    }

    // Detect merge (fewer secondary profiles)
    if (oldProfile.secondaryProfiles.length > newProfile.secondaryProfiles.length) {
      changes.push({
        id: generateProfileChangeId(),
        timestamp: new Date().toISOString(),
        changeType: 'merged',
        fromProfile: null,
        toProfile: newProfile.primaryProfile,
        fromScore: null,
        toScore: newProfile.confidenceScore,
        description: `Profiles merged: ${oldProfile.secondaryProfiles.length} → ${newProfile.secondaryProfiles.length} secondary`,
        metadata: { profileId: newProfile.id },
      });
    }

    // Detect split (more secondary profiles)
    if (oldProfile.secondaryProfiles.length < newProfile.secondaryProfiles.length) {
      changes.push({
        id: generateProfileChangeId(),
        timestamp: new Date().toISOString(),
        changeType: 'split',
        fromProfile: null,
        toProfile: newProfile.primaryProfile,
        fromScore: null,
        toScore: newProfile.confidenceScore,
        description: `Profiles split: ${oldProfile.secondaryProfiles.length} → ${newProfile.secondaryProfiles.length} secondary`,
        metadata: { profileId: newProfile.id },
      });
    }

    for (const change of changes) {
      this._changeRecords.push(change);
    }

    this._addEntry({
      id: generateProfileHistoryId(),
      profileId: newProfile.id,
      action: changes.length > 0 ? 'changed' : 'updated',
      timestamp: new Date().toISOString(),
      metadata: { changes: changes.length },
    });

    this._previousProfile = newProfile;
    this._trim();
    return changes;
  }

  recordValidated(profileId: string): void {
    if (!this._config.enableHistory) return;
    this._addEntry({
      id: generateProfileHistoryId(),
      profileId,
      action: 'validated',
      timestamp: new Date().toISOString(),
      metadata: {},
    });
  }

  getPreviousProfile(): DeviceProfile | null {
    return this._previousProfile;
  }

  getEntries(): ProfileHistoryEntry[] {
    return [...this._entries];
  }

  getChangeRecords(): ProfileChangeRecord[] {
    return [...this._changeRecords];
  }

  getChangesFor(profileId: string): ProfileChangeRecord[] {
    return this._changeRecords.filter((c) => c.metadata.profileId === profileId);
  }

  getHistoricalStability(): number {
    if (this._changeRecords.length === 0) return 1.0;
    const profileChanges = this._changeRecords.filter((c) => c.changeType === 'changed');
    return clampScore(1 - profileChanges.length / this._changeRecords.length);
  }

  clear(): void {
    this._entries = [];
    this._changeRecords = [];
    this._previousProfile = null;
  }

  get count(): number {
    return this._entries.length;
  }

  get changeCount(): number {
    return this._changeRecords.length;
  }

  // ── Private ────────────────────────────────────────────────

  private _addEntry(entry: ProfileHistoryEntry): void {
    this._entries.push(entry);
    this._trim();
  }

  private _trim(): void {
    if (this._entries.length > this._config.maxHistoryEntries) {
      this._entries = this._entries.slice(-this._config.maxHistoryEntries);
    }
  }
}
