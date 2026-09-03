/**
 * NotificationManager — wraps Electron's native Notification API.
 *
 * Uses Windows toast notifications when available, falls back to
 * the basic Notification API.  All notifications are filtered by
 * the user's tray settings (notificationTypes).
 */
import { Notification, BrowserWindow } from 'electron';
import { getTraySettings } from '../tray/traySettings';
import { getMainWindow } from '../main/windowManager';

export type NotificationCategory =
  | 'threatDetected'
  | 'threatQuarantined'
  | 'startupAppAdded'
  | 'browserExtensionInstalled'
  | 'scanComplete'
  | 'optimizationComplete'
  | 'predictionAlert'
  | 'hardwareAlert'
  | 'storageWarning';

export interface AvsNotification {
  title: string;
  body: string;
  category: NotificationCategory;
  urgency?: 'normal' | 'critical';
}

type NotificationListener = (n: AvsNotification) => void;
const listeners = new Set<NotificationListener>();

/**
 * Show a native notification if the user has enabled that category.
 */
export function showNotification(notification: AvsNotification): void {
  const settings = getTraySettings();

  if (!settings.notificationsEnabled) return;
  if (!settings.notificationTypes[notification.category]) return;

  const notif = new Notification({
    title: notification.title,
    body: notification.body,
    urgency: notification.urgency ?? 'normal',
    silent: false,
  });

  notif.on('click', () => {
    // Clicking the notification focuses / opens the main window
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  notif.show();

  // Also broadcast to renderer so the UI can show in-app toasts
  for (const listener of listeners) {
    try { listener(notification); } catch { /* ignore */ }
  }
}

/**
 * Convenience helpers for common notification types.
 */
export const Notifications = {
  threatDetected(threatName: string, location: string): void {
    showNotification({
      title: 'Threat Detected',
      body: `${threatName} was detected in ${location}. AVS AI Shield is analyzing the threat.`,
      category: 'threatDetected',
      urgency: 'critical',
    });
  },

  threatQuarantined(threatName: string): void {
    showNotification({
      title: 'Threat Quarantined',
      body: `${threatName} has been safely quarantined by AVS AI Shield.`,
      category: 'threatQuarantined',
    });
  },

  startupAppAdded(appName: string): void {
    showNotification({
      title: 'Startup Application Added',
      body: `"${appName}" was added to Windows startup. Click to review.`,
      category: 'startupAppAdded',
    });
  },

  browserExtensionInstalled(extName: string, browser: string): void {
    showNotification({
      title: 'Browser Extension Installed',
      body: `"${extName}" was installed in ${browser}. Click to review.`,
      category: 'browserExtensionInstalled',
    });
  },

  scanComplete(threatsFound: number, score: number): void {
    showNotification({
      title: 'Security Scan Complete',
      body: threatsFound === 0
        ? `No threats found. Security Score: ${score}.`
        : `${threatsFound} threat${threatsFound > 1 ? 's' : ''} found. Security Score: ${score}.`,
      category: 'scanComplete',
    });
  },

  optimizationComplete(recoveredMB: number): void {
    showNotification({
      title: 'Optimization Complete',
      body: `Recovered ${(recoveredMB / 1024).toFixed(1)} GB of disk space.`,
      category: 'optimizationComplete',
    });
  },

  predictionAlert(component: string, message: string): void {
    showNotification({
      title: `Prediction Alert: ${component}`,
      body: message,
      category: 'predictionAlert',
      urgency: 'critical',
    });
  },

  hardwareAlert(component: string, temp: number): void {
    showNotification({
      title: `Hardware Alert: ${component}`,
      body: `${component} temperature is ${temp}°C. Consider cooling measures.`,
      category: 'hardwareAlert',
      urgency: 'critical',
    });
  },

  storageWarning(remainingGB: number): void {
    showNotification({
      title: 'Storage Almost Full',
      body: `Only ${remainingGB.toFixed(1)} GB remaining on your primary drive.`,
      category: 'storageWarning',
    });
  },
};

/**
 * Subscribe to notifications (for in-app toast display in the renderer).
 */
export function onNotification(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Broadcast a notification event to all renderer windows.
 */
export function broadcastNotification(notification: AvsNotification): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('avs:notification:event', notification);
  }
}

// Auto-broadcast all notifications to renderer
onNotification(broadcastNotification);
