/**
 * AI Workspace Personalization Platform — Workspace Profile Manager
 *
 * EPIC 5 PHASE A PART 7
 *
 * Manages workspace profiles including built-in profiles (Default,
 * Performance, Gaming, Trading, Developer, Creative, Business,
 * Student, Privacy) and custom user-created profiles.
 */
import type {
  WorkspaceProfile,
  WorkspaceProfileType,
  WorkspaceConfiguration,
} from './types';
import { createBuiltinProfiles, generateProfileId } from './types';

export class WorkspaceProfileManager {
  private _config: WorkspaceConfiguration;
  private _profiles: Map<string, WorkspaceProfile> = new Map();
  private _customProfiles: Map<string, WorkspaceProfile> = new Map();

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
    this._loadBuiltinProfiles();
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  private _loadBuiltinProfiles(): void {
    const builtins = createBuiltinProfiles();
    for (const profile of builtins) {
      this._profiles.set(profile.id, profile);
    }
  }

  getProfile(id: string): WorkspaceProfile | null {
    return this._profiles.get(id) ?? this._customProfiles.get(id) ?? null;
  }

  getProfileByType(type: WorkspaceProfileType): WorkspaceProfile | null {
    for (const profile of this._profiles.values()) {
      if (profile.type === type) return profile;
    }
    for (const profile of this._customProfiles.values()) {
      if (profile.type === type) return profile;
    }
    return null;
  }

  getAllProfiles(): WorkspaceProfile[] {
    return [...this._profiles.values(), ...this._customProfiles.values()];
  }

  getBuiltinProfiles(): WorkspaceProfile[] {
    return Array.from(this._profiles.values());
  }

  getCustomProfiles(): WorkspaceProfile[] {
    return Array.from(this._customProfiles.values());
  }

  createCustomProfile(
    type: WorkspaceProfileType,
    label: string,
    description: string,
    baseProfileId?: string,
  ): WorkspaceProfile {
    if (this._config.enterprisePolicies.blockCustomProfiles) {
      throw new Error('Custom profiles are blocked by enterprise policy');
    }

    if (this._config.enterprisePolicies.enforceProfiles &&
        !this._config.enterprisePolicies.allowedProfiles.includes(type) &&
        type !== 'future_profile') {
      throw new Error(`Profile type ${type} is not allowed by enterprise policy`);
    }

    const now = new Date().toISOString();
    const base = baseProfileId ? this.getProfile(baseProfileId) : null;

    const profile: WorkspaceProfile = {
      id: generateProfileId(),
      type,
      label,
      description,
      layout: base ? structuredClone(base.layout) : { widgets: [], columns: 3, compactMode: false, sidebarCollapsed: false, theme: 'auto', futureMetadata: {} },
      quickActions: base ? [...base.quickActions] : [],
      preferredReports: base ? [...base.preferredReports] : [],
      notificationPreferences: base ? structuredClone(base.notificationPreferences) : { enableNotifications: true, enableSound: true, enableDesktop: true, enableEmail: false, priorityThreshold: 'medium', quietHoursStart: null, quietHoursEnd: null, futureMetadata: {} },
      defaultGoals: base ? [...base.defaultGoals] : [],
      preferredTools: base ? [...base.preferredTools] : [],
      aiInteractionStyle: base?.aiInteractionStyle ?? 'detailed',
      widgetOrdering: base ? [...base.widgetOrdering] : [],
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
      futureMetadata: {},
    };

    this._customProfiles.set(profile.id, profile);
    return profile;
  }

  updateCustomProfile(id: string, updates: Partial<WorkspaceProfile>): WorkspaceProfile {
    const profile = this._customProfiles.get(id);
    if (!profile) {
      throw new Error(`Custom profile ${id} not found`);
    }
    if (profile.isBuiltIn) {
      throw new Error('Cannot modify built-in profile');
    }

    const updated: WorkspaceProfile = {
      ...profile,
      ...updates,
      id: profile.id,
      isBuiltIn: profile.isBuiltIn,
      createdAt: profile.createdAt,
      updatedAt: new Date().toISOString(),
    };

    this._customProfiles.set(id, updated);
    return updated;
  }

  deleteCustomProfile(id: string): boolean {
    return this._customProfiles.delete(id);
  }

  duplicateProfile(id: string, newLabel: string): WorkspaceProfile {
    const original = this.getProfile(id);
    if (!original) {
      throw new Error(`Profile ${id} not found`);
    }

    const now = new Date().toISOString();
    const duplicate: WorkspaceProfile = {
      ...structuredClone(original),
      id: generateProfileId(),
      label: newLabel,
      type: 'custom',
      isBuiltIn: false,
      createdAt: now,
      updatedAt: now,
    };

    this._customProfiles.set(duplicate.id, duplicate);
    return duplicate;
  }

  applyToPreferences(
    profile: WorkspaceProfile,
    preferences: { userId: string; profileType: WorkspaceProfileType; layout: typeof profile.layout; quickActions: string[]; preferredReports: string[]; notificationPreferences: typeof profile.notificationPreferences; defaultGoals: string[]; preferredTools: string[]; aiInteractionStyle: typeof profile.aiInteractionStyle; widgetOrdering: string[]; [key: string]: unknown },
  ): typeof preferences {
    return {
      ...preferences,
      profileType: profile.type,
      layout: structuredClone(profile.layout),
      quickActions: [...profile.quickActions],
      preferredReports: [...profile.preferredReports],
      notificationPreferences: structuredClone(profile.notificationPreferences),
      defaultGoals: [...profile.defaultGoals],
      preferredTools: [...profile.preferredTools],
      aiInteractionStyle: profile.aiInteractionStyle,
      widgetOrdering: [...profile.widgetOrdering],
    };
  }

  clearCustomProfiles(): void {
    this._customProfiles.clear();
  }
}
