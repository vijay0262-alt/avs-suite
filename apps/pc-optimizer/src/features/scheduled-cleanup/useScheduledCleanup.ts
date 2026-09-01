/**
 * useScheduledCleanup — hook for managing scheduled cleanup settings.
 * Reads/writes the settings via the settings RPC and configures
 * the Windows Task Scheduler via the scheduler RPC.
 */
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '../../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import { scheduledCleanupService } from './scheduledCleanup.service';

interface ScheduledCleanupSettings {
  scheduled_cleanup_enabled: boolean;
  scheduled_cleanup_frequency: string;
  scheduled_cleanup_time: string;
  scheduled_cleanup_day: string;
  scheduled_cleanup_actions: string[];
  junk_monitor_enabled: boolean;
  junk_monitor_threshold_gb: number;
}

const DEFAULTS: ScheduledCleanupSettings = {
  scheduled_cleanup_enabled: false,
  scheduled_cleanup_frequency: 'daily',
  scheduled_cleanup_time: '03:00',
  scheduled_cleanup_day: 'SUN',
  scheduled_cleanup_actions: ['junk_clean'],
  junk_monitor_enabled: true,
  junk_monitor_threshold_gb: 2.0,
};

export function useScheduledCleanup() {
  const [settings, setSettings] = useState<ScheduledCleanupSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const s = await rpc.raw<Record<string, unknown>>(RPC_METHODS.SETTINGS_GET);
      setSettings({
        scheduled_cleanup_enabled: Boolean(s.scheduled_cleanup_enabled ?? false),
        scheduled_cleanup_frequency: String(s.scheduled_cleanup_frequency ?? 'daily'),
        scheduled_cleanup_time: String(s.scheduled_cleanup_time ?? '03:00'),
        scheduled_cleanup_day: String(s.scheduled_cleanup_day ?? 'SUN'),
        scheduled_cleanup_actions: Array.isArray(s.scheduled_cleanup_actions)
          ? s.scheduled_cleanup_actions as string[]
          : ['junk_clean'],
        junk_monitor_enabled: Boolean(s.junk_monitor_enabled ?? true),
        junk_monitor_threshold_gb: Number(s.junk_monitor_threshold_gb ?? 2.0),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (updates: Partial<ScheduledCleanupSettings>) => {
    setSaving(true);
    setError(null);
    try {
      const newSettings = { ...settings, ...updates };
      await rpc.raw(RPC_METHODS.SETTINGS_UPDATE, {
        scheduledCleanupEnabled: newSettings.scheduled_cleanup_enabled,
        scheduledCleanupFrequency: newSettings.scheduled_cleanup_frequency,
        scheduledCleanupTime: newSettings.scheduled_cleanup_time,
        scheduledCleanupDay: newSettings.scheduled_cleanup_day,
        scheduledCleanupActions: newSettings.scheduled_cleanup_actions,
        junkMonitorEnabled: newSettings.junk_monitor_enabled,
        junkMonitorThresholdGb: newSettings.junk_monitor_threshold_gb,
      });
      setSettings(newSettings);

      // Configure the Windows Task Scheduler based on new settings
      await scheduledCleanupService.configureFromSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  return { settings, loading, saving, error, saveSettings, reload: loadSettings };
}
