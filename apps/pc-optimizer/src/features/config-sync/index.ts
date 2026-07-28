/**
 * Public barrel export for the config-sync feature.
 */
export type {
  CustomerConfiguration,
  MaintenanceScheduleConfig,
  MaintenanceSchedulerSection,
  ApplicationPreferencesSection,
  NotificationPreferencesSection,
  CapabilityInfo,
  CapabilitiesSection,
  PlaceholderSection,
  SyncResult,
  SyncStatus,
  ConfigurationCacheEntry,
  ConfigurationEvent,
  ConfigurationEventPayloads,
  ConfigurationEventListener,
} from './types';

export { configSyncService, ConfigSyncError } from './configSyncService';
export type { ConfigSyncErrorCode } from './configSyncService';

export { configCache, createDefaultConfiguration } from './configCache';

export { configEvents } from './configEvents';

export { configManager } from './configManager';

export {
  useConfigStore,
  useConfigVersion,
  useMaintenanceSchedules,
  useAppPreferences,
  useNotificationPrefs,
  useCapabilities,
  useCapabilityEnabled,
  useConfigSyncPhase,
} from './configStore';
export type { ConfigStoreState } from './configStore';
