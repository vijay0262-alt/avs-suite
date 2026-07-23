/**
 * Update Manager — frontend update framework.
 *
 * Provides a React hook that wraps the existing @avs/updater
 * IUpdateService interface. Does NOT enable automatic updates.
 * Only provides manual "Check for Updates" capability with
 * configurable download URL.
 */
import { useState, useCallback, useEffect } from 'react';
import type { UpdateInfo, DownloadProgress, IUpdateService } from '@avs/updater';
import { NullUpdateService } from '@avs/updater';
import { getVersionInfo } from '../config/version';

export type UpdateCheckStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error';

export interface UpdateManagerState {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  updateInfo: UpdateInfo | null;
  downloadProgress: DownloadProgress | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  quitAndInstall: () => void;
}

const defaultService = new NullUpdateService();

export function useUpdateManager(service: IUpdateService = defaultService): UpdateManagerState {
  const versionInfo = getVersionInfo();
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const offAvailable = service.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setLatestVersion(info.version);
      setStatus('available');
    });
    const offProgress = service.onDownloadProgress((p) => {
      setDownloadProgress(p);
      setStatus('downloading');
    });
    const offDownloaded = service.onUpdateDownloaded((info) => {
      setUpdateInfo(info);
      setStatus('downloaded');
    });
    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
    };
  }, [service]);

  const checkForUpdates = useCallback(async () => {
    setStatus('checking');
    setError(null);
    try {
      const info = await service.checkForUpdates();
      if (info) {
        setUpdateInfo(info);
        setLatestVersion(info.version);
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [service]);

  const downloadUpdate = useCallback(async () => {
    setStatus('downloading');
    setError(null);
    try {
      await service.downloadUpdate();
      setStatus('downloaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [service]);

  const quitAndInstall = useCallback(() => {
    service.quitAndInstall();
  }, [service]);

  return {
    status,
    currentVersion: versionInfo.version,
    latestVersion,
    updateInfo,
    downloadProgress,
    error,
    checkForUpdates,
    downloadUpdate,
    quitAndInstall,
  };
}

/**
 * Update configuration — URL and channel settings.
 * These are placeholders for future update server integration.
 */
export const UPDATE_CONFIG = {
  feedUrl: 'https://www.avs.example.com/updates',
  downloadUrl: 'https://www.avs.example.com/downloads',
  changelogUrl: 'https://www.avs.example.com/changelog',
  autoCheckEnabled: false,
  autoDownloadEnabled: false,
} as const;
