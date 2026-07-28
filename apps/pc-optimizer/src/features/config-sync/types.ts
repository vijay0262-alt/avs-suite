/**
 * Configuration types — mirrors the backend CustomerConfigurationResponse
 * from avs-license-server (app/customer/configuration_schemas.py).
 *
 * The desktop app receives this object from:
 *   GET /api/customer/configuration
 *
 * It is versioned with a checksum for efficient change detection.
 * Future modules add new sections without breaking existing consumers.
 */

// ── Active sections ───────────────────────────────────────────

export interface MaintenanceScheduleConfig {
  id: string;
  name: string;
  enabled: boolean;
  frequency: string;
  timezone: string;
  schedule_time: string;
  day_of_week: number | null;
  day_of_month: number | null;
  custom_interval_hours: number | null;
  tasks: string[];
  device_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface MaintenanceSchedulerSection {
  schedules: MaintenanceScheduleConfig[];
}

export interface ApplicationPreferencesSection {
  theme: string;
  language: string | null;
  timezone: string | null;
  country: string | null;
  update_channel: string;
}

export interface NotificationPreferencesSection {
  marketing_email_consent: boolean;
  marketing_sms_consent: boolean;
  channels: Record<string, unknown>;
}

// ── Capabilities ──────────────────────────────────────────────

export interface CapabilityInfo {
  id: string;
  display_name: string;
  description: string;
  category: string;
  minimum_version: string;
  status: string;
}

export interface CapabilitiesSection {
  available: CapabilityInfo[];
  locked: CapabilityInfo[];
  upcoming: CapabilityInfo[];
}

// ── Placeholder sections (future modules) ─────────────────────

export interface PlaceholderSection {
  status: string;
}

// ── Top-level configuration response ──────────────────────────

export interface CustomerConfiguration {
  version: number;
  updated_at: string;
  checksum: string | null;

  maintenance_scheduler: MaintenanceSchedulerSection;
  application_preferences: ApplicationPreferencesSection;
  notification_preferences: NotificationPreferencesSection;
  capabilities: CapabilitiesSection;

  // Placeholder sections (future modules)
  ai_settings: PlaceholderSection;
  cleaning_preferences: PlaceholderSection;
  privacy_settings: PlaceholderSection;
  browser_cleaning_preferences: PlaceholderSection;
  startup_optimization: PlaceholderSection;
}

// ── Sync result ───────────────────────────────────────────────

export type SyncStatus = 'success' | 'no_change' | 'failed' | 'offline';

export interface SyncResult {
  status: SyncStatus;
  version: number;
  checksum: string | null;
  previous_version: number | null;
  timestamp: string;
  error?: string;
}

// ── Cache entry ───────────────────────────────────────────────

export interface ConfigurationCacheEntry {
  version: number;
  checksum: string | null;
  last_sync: string;
  sync_status: SyncStatus;
  config: CustomerConfiguration;
}

// ── Event types ───────────────────────────────────────────────

export type ConfigurationEvent =
  | 'configuration_loaded'
  | 'configuration_updated'
  | 'sync_started'
  | 'sync_successful'
  | 'sync_failed'
  | 'offline_mode'
  | 'version_changed'
  | 'checksum_changed';

export interface ConfigurationEventPayloads {
  configuration_loaded: { config: CustomerConfiguration };
  configuration_updated: { old: CustomerConfiguration | null; new: CustomerConfiguration };
  sync_started: Record<string, never>;
  sync_successful: { result: SyncResult };
  sync_failed: { error: string; timestamp: string };
  offline_mode: { using_cache: boolean };
  version_changed: { old: number | null; new: number };
  checksum_changed: { old: string | null; new: string | null };
}

export type ConfigurationEventListener = (payload: unknown) => void;
