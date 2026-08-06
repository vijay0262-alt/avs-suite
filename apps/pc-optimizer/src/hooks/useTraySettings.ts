/**
 * useTraySettings — React hook for accessing and updating tray settings
 * (close behavior, startup with Windows, notification preferences).
 */
import { useState, useEffect, useCallback } from 'react';

export interface TraySettings {
  closeBehavior: 'minimize-to-tray' | 'exit';
  startWithWindows: boolean;
  minimizeOnStart: boolean;
  notificationsEnabled: boolean;
  notificationTypes: {
    threatDetected: boolean;
    threatQuarantined: boolean;
    startupAppAdded: boolean;
    browserExtensionInstalled: boolean;
    scanComplete: boolean;
    optimizationComplete: boolean;
    predictionAlert: boolean;
    hardwareAlert: boolean;
    storageWarning: boolean;
  };
  pauseUntil: number | null;
}

const DEFAULT_SETTINGS: TraySettings = {
  closeBehavior: 'minimize-to-tray',
  startWithWindows: false,
  minimizeOnStart: false,
  notificationsEnabled: true,
  notificationTypes: {
    threatDetected: true,
    threatQuarantined: true,
    startupAppAdded: true,
    browserExtensionInstalled: true,
    scanComplete: true,
    optimizationComplete: true,
    predictionAlert: true,
    hardwareAlert: true,
    storageWarning: true,
  },
  pauseUntil: null,
};

export function useTraySettings() {
  const [settings, setSettings] = useState<TraySettings>(DEFAULT_SETTINGS);
  const [startupEnabled, setStartupEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tray = window.avs?.tray;
    if (typeof window === 'undefined' || !tray) return;

    let unsubscribe: (() => void) | undefined;

    (async () => {
      try {
        const s = await tray.getSettings() as TraySettings;
        setSettings(s);
        const enabled = await tray.isStartupEnabled();
        setStartupEnabled(enabled);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    })();

    try {
      unsubscribe = tray.onSettingsChanged((s) => {
        setSettings(s as TraySettings);
      });
    } catch {
      // ignore
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<TraySettings>) => {
    const tray = window.avs?.tray;
    if (typeof window === 'undefined' || !tray) return;
    try {
      const updated = await tray.updateSettings(patch) as TraySettings;
      setSettings(updated);
    } catch {
      // ignore
    }
  }, []);

  const enableStartup = useCallback(async () => {
    const tray = window.avs?.tray;
    if (typeof window === 'undefined' || !tray) return;
    try {
      await tray.enableStartup();
      setStartupEnabled(true);
    } catch {
      // ignore
    }
  }, []);

  const disableStartup = useCallback(async () => {
    const tray = window.avs?.tray;
    if (typeof window === 'undefined' || !tray) return;
    try {
      await tray.disableStartup();
      setStartupEnabled(false);
    } catch {
      // ignore
    }
  }, []);

  return { settings, startupEnabled, loading, updateSettings, enableStartup, disableStartup };
}
