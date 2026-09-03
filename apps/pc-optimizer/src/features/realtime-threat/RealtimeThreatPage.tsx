/**
 * RealtimeThreatPage — AVS AI Shield Real-Time Threat Protection.
 *
 * Monitors file system activity (ETW/WMI), USB device insertion,
 * and network C2 connections in real time.
 *
 * Free: view status, events, alerts, USB devices
 * Pro: start/stop monitors, configure settings, scan USB/network
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import {
  ModuleLoadingState,
  ModuleErrorState,
  ModuleEmptyState,
} from '../../components/ModuleStates';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  realtimeThreatService,
  type RealtimeThreatStatus,
  type RealtimeThreatEvent,
  type RealtimeThreatAlert,
  type UsbDevice,
  type ThreatFeedStatus,
  type RealtimeThreatConfig,
  type RealtimeThreatSeverity,
} from './realtimeThreat.service';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PlayIcon,
  StopIcon,
  CpuChipIcon,
  GlobeAltIcon,
  DevicePhoneMobileIcon,
  AdjustmentsHorizontalIcon,
  BellAlertIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

// ── Helpers ─────────────────────────────────────────────────────

const SEVERITY_TONE: Record<RealtimeThreatSeverity, 'danger' | 'warning' | 'neutral' | 'info'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'info',
};

const SEVERITY_TEXT: Record<RealtimeThreatSeverity, string> = {
  critical: 'text-semantic-danger',
  high: 'text-semantic-warning',
  medium: 'text-text-secondary',
  low: 'text-semantic-info',
};

const EVENT_TYPE_COLOR: Record<string, string> = {
  file_create: 'text-semantic-info',
  file_modify: 'text-semantic-warning',
  file_delete: 'text-semantic-danger',
  process_start: 'text-purple-500',
  usb_insert: 'text-semantic-success',
  usb_inserted: 'text-semantic-success',
  usb_remove: 'text-text-muted',
  usb_removed: 'text-text-muted',
  usb_threat_alert: 'text-semantic-danger',
  c2_detected: 'text-semantic-danger',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  file_create: 'File Created',
  file_modify: 'File Modified',
  file_delete: 'File Deleted',
  process_start: 'Process Started',
  usb_insert: 'USB Inserted',
  usb_inserted: 'USB Inserted',
  usb_remove: 'USB Removed',
  usb_removed: 'USB Removed',
  usb_threat_alert: 'USB Threat',
  c2_detected: 'C2 Detected',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return ts;
  }
}

function formatRelative(ts: string | null | undefined): string {
  if (!ts) return 'Never';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  } catch {
    return ts;
  }
}

// ── Component ───────────────────────────────────────────────────

export default function RealtimeThreatPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<RealtimeThreatStatus | null>(null);
  const [events, setEvents] = useState<RealtimeThreatEvent[]>([]);
  const [alerts, setAlerts] = useState<RealtimeThreatAlert[]>([]);
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([]);
  const [feedStatus, setFeedStatus] = useState<ThreatFeedStatus | null>(null);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [config, setConfig] = useState<RealtimeThreatConfig | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [networkScanResults, setNetworkScanResults] = useState<RealtimeThreatAlert[] | null>(null);
  const [scanningUsb, setScanningUsb] = useState<string | null>(null);
  const [updatingFeeds, setUpdatingFeeds] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────

  const refreshAll = useCallback(async () => {
    try {
      const [statusRes, eventsRes, alertsRes, usbRes, feedRes] = await Promise.all([
        realtimeThreatService.getStatus(),
        realtimeThreatService.getEvents(50),
        realtimeThreatService.getAlerts(50),
        realtimeThreatService.getUsbDevices(),
        realtimeThreatService.getFeedStatus(),
      ]);
      setStatus(statusRes.status);
      setEvents(eventsRes.events || []);
      setAlerts(alertsRes.alerts || []);
      setUsbDevices(usbRes.devices || []);
      setFeedStatus(feedRes.feeds);
      setConfig(statusRes.status.config);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Poll for updates when any monitor is running
  useEffect(() => {
    const anyRunning =
      status?.etw_file_monitor?.running ||
      status?.usb_monitor?.running ||
      status?.network_c2?.running;

    if (anyRunning) {
      pollRef.current = setInterval(() => {
        realtimeThreatService.getStatus().then((r) => setStatus(r.status)).catch(() => {});
        realtimeThreatService.getEvents(50).then((r) => setEvents(r.events || [])).catch(() => {});
        realtimeThreatService.getAlerts(50).then((r) => setAlerts(r.alerts || [])).catch(() => {});
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.etw_file_monitor?.running, status?.usb_monitor?.running, status?.network_c2?.running]);

  // ── Actions ────────────────────────────────────────────────────

  const handleStartAll = async () => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setActionLoading(true);
    try {
      await realtimeThreatService.start();
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
    setActionLoading(false);
  };

  const handleStopAll = async () => {
    setActionLoading(true);
    try {
      await realtimeThreatService.stop();
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
    setActionLoading(false);
  };

  const handleScanUsb = async (driveLetter: string) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setScanningUsb(driveLetter);
    try {
      await realtimeThreatService.scanUsb(driveLetter);
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
    setScanningUsb(null);
  };

  const handleNetworkScan = async () => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setActionLoading(true);
    try {
      const res = await realtimeThreatService.networkScan();
      setNetworkScanResults(res.alerts || []);
    } catch (e) {
      setError(String(e));
    }
    setActionLoading(false);
  };

  const handleUpdateFeeds = async () => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setUpdatingFeeds(true);
    try {
      await realtimeThreatService.updateFeeds(true);
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
    setUpdatingFeeds(false);
  };

  const handleConfigure = async (partial: Partial<RealtimeThreatConfig>) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    try {
      const res = await realtimeThreatService.configure(partial);
      setConfig(res.config);
      await refreshAll();
    } catch (e) {
      setError(String(e));
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div data-testid="page-realtime-threat">
        <PageHeader title="Real-Time Threat Protection" />
        <ModuleLoadingState />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div data-testid="page-realtime-threat">
        <PageHeader title="Real-Time Threat Protection" />
        <ModuleErrorState message={error} onRetry={refreshAll} />
      </div>
    );
  }

  const anyRunning =
    status?.etw_file_monitor?.running ||
    status?.usb_monitor?.running ||
    status?.network_c2?.running;

  return (
    <div data-testid="page-realtime-threat">
      <PageHeader
        title="Real-Time Threat Protection"
        description="Continuous monitoring of file activity, USB devices, and network connections for threats."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <HelpButton text="Real-Time Threat Protection monitors your system continuously: file system changes in critical directories, USB device insertion with automatic scanning, and network connections checked against threat intelligence feeds." />
          </div>
        }
      />

      <div className="space-y-4">
        {/* Global controls */}
        <Card title="Protection Status" variant="glass">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon
                className={`h-10 w-10 ${anyRunning ? 'text-semantic-success' : 'text-text-muted'}`}
              />
              <div>
                <div className="text-small font-medium text-text-primary">
                  {anyRunning ? 'Protected' : 'Not Monitoring'}
                </div>
                <div className="text-caption text-text-secondary">
                  {anyRunning ? 'Real-time monitoring is active' : 'Click Start to begin monitoring'}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {!anyRunning ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartAll}
                  disabled={!isPro || actionLoading}
                  leftIcon={<PlayIcon className="h-4 w-4" />}
                  data-testid="realtime-threat-start"
                >
                  Start All
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleStopAll}
                  disabled={actionLoading}
                  leftIcon={<StopIcon className="h-4 w-4" />}
                  data-testid="realtime-threat-stop"
                >
                  Stop All
                </Button>
              )}
            </div>
          </div>
          {!isPro && (
            <p className="text-caption text-brand-primary mt-2">
              Professional edition required for real-time monitoring.
            </p>
          )}
        </Card>

        {error && (
          <Card variant="glass">
            <p className="text-small text-semantic-danger">{error}</p>
          </Card>
        )}

        {/* Monitor status cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ETW File Monitor */}
          <Card title="File Activity Monitor" variant="glass">
            <div className="flex items-center gap-2 mb-2">
              <CpuChipIcon
                className={`h-6 w-6 ${status?.etw_file_monitor?.running ? 'text-semantic-success' : 'text-text-muted'}`}
              />
              <Badge tone={status?.etw_file_monitor?.running ? 'success' : 'neutral'}>
                {status?.etw_file_monitor?.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="text-caption text-text-secondary space-y-1">
              <div>Events: {status?.etw_file_monitor?.events_buffered ?? status?.etw_file_monitor?.eventCount ?? 0}</div>
              <div>Watched dirs: {status?.etw_file_monitor?.watchedDirectories?.length ?? 0}</div>
              {status?.etw_file_monitor?.usingFallback && (
                <div className="text-semantic-warning">Using polling fallback</div>
              )}
            </div>
          </Card>

          {/* USB Monitor */}
          <Card title="USB Device Monitor" variant="glass">
            <div className="flex items-center gap-2 mb-2">
              <DevicePhoneMobileIcon
                className={`h-6 w-6 ${status?.usb_monitor?.running ? 'text-semantic-success' : 'text-text-muted'}`}
              />
              <Badge tone={status?.usb_monitor?.running ? 'success' : 'neutral'}>
                {status?.usb_monitor?.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="text-caption text-text-secondary space-y-1">
              <div>Devices: {status?.usb_monitor?.devices_watched ?? usbDevices.length}</div>
              <div>Scans triggered: {status?.usb_monitor?.scans_triggered ?? 0}</div>
              <div>Auto-scan: {status?.usb_monitor?.auto_scan_enabled ? 'On' : 'Off'}</div>
            </div>
          </Card>

          {/* Network C2 */}
          <Card title="Network C2 Detector" variant="glass">
            <div className="flex items-center gap-2 mb-2">
              <GlobeAltIcon
                className={`h-6 w-6 ${status?.network_c2?.running ? 'text-semantic-success' : 'text-text-muted'}`}
              />
              <Badge tone={status?.network_c2?.running ? 'success' : 'neutral'}>
                {status?.network_c2?.running ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="text-caption text-text-secondary space-y-1">
              <div>Connections checked: {status?.network_c2?.connections_checked ?? 0}</div>
              <div>Threats found: {status?.network_c2?.threats_found ?? 0}</div>
              <div>Feeds loaded: {status?.network_c2?.feeds_loaded ?? 0}</div>
            </div>
          </Card>
        </div>

        {/* USB Devices */}
        <Card title="Connected USB Devices" variant="glass">
          {usbDevices.length === 0 ? (
            <ModuleEmptyState message="No USB devices connected" />
          ) : (
            <div className="space-y-2">
              {usbDevices.map((dev) => (
                <div
                  key={dev.drive_letter}
                  className="flex items-center justify-between py-2 px-3 rounded hover:bg-[var(--avs-surface-hover)]"
                >
                  <div className="flex items-center gap-2">
                    <DevicePhoneMobileIcon className="h-5 w-5 text-semantic-info" />
                    <div>
                      <div className="text-small font-medium text-text-primary">
                        {dev.drive_letter} {dev.label && `— ${dev.label}`}
                      </div>
                      <div className="text-caption text-text-muted">
                        {formatBytes(dev.size)} · {dev.filesystem}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleScanUsb(dev.drive_letter)}
                    disabled={!isPro || scanningUsb === dev.drive_letter}
                    leftIcon={
                      scanningUsb === dev.drive_letter ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldExclamationIcon className="h-4 w-4" />
                      )
                    }
                    data-testid={`usb-scan-${dev.drive_letter}`}
                  >
                    {scanningUsb === dev.drive_letter ? 'Scanning...' : 'Scan'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Network scan */}
        <Card title="Network Connection Scan" variant="glass">
          <div className="flex items-center justify-between mb-3">
            <div className="text-small text-text-secondary">
              Check active connections against threat intelligence feeds
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleNetworkScan}
              disabled={!isPro || actionLoading}
              leftIcon={<GlobeAltIcon className="h-4 w-4" />}
              data-testid="network-scan-btn"
            >
              Scan Now
            </Button>
          </div>
          {networkScanResults !== null && (
            <div className="mt-2">
              {networkScanResults.length === 0 ? (
                <div className="flex items-center gap-2 text-small text-semantic-success">
                  <CheckCircleIcon className="h-5 w-5" />
                  No threats detected in current connections
                </div>
              ) : (
                <div className="space-y-2">
                  {networkScanResults.map((alert, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 p-2 rounded border border-semantic-danger/30 bg-semantic-danger/5"
                    >
                      <ExclamationTriangleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-small font-medium text-text-primary">
                          {alert.remote_ip}:{alert.remote_port} — {alert.feed_name}
                        </div>
                        <div className="text-caption text-text-secondary">
                          {alert.threat_description} · {alert.process_name}
                        </div>
                      </div>
                      <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Live Events Feed */}
        <Card title={`Live Events (${events.length})`} variant="glass">
          {events.length === 0 ? (
            <ModuleEmptyState message="No events recorded. Start monitoring to see activity." />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto" data-testid="events-list">
              {events.map((event, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--avs-surface-hover)] text-small"
                >
                  <span className="text-caption text-text-muted w-20 shrink-0">
                    {formatTime(event.timestamp)}
                  </span>
                  <Badge tone="neutral" className="shrink-0">
                    <span className={EVENT_TYPE_COLOR[event.type] || 'text-text-secondary'}>
                      {EVENT_TYPE_LABEL[event.type] || event.type}
                    </span>
                  </Badge>
                  <span className="text-text-secondary truncate flex-1">
                    {event.path || event.process_name || event.drive_letter || JSON.stringify(event.details || {})}
                  </span>
                  {event.severity && (
                    <Badge tone={SEVERITY_TONE[event.severity]} className="shrink-0">
                      {event.severity}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Alerts Feed */}
        <Card title={`Security Alerts (${alerts.length})`} variant="glass">
          {alerts.length === 0 ? (
            <ModuleEmptyState message="No alerts. Your system appears safe." />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="alerts-list">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-3 rounded border ${alert.severity === 'critical' ? 'border-semantic-danger/30 bg-semantic-danger/5' : 'border-semantic-warning/30 bg-semantic-warning/5'}`}
                >
                  <BellAlertIcon className={`h-5 w-5 ${SEVERITY_TEXT[alert.severity]} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={SEVERITY_TONE[alert.severity]}>{alert.severity}</Badge>
                      <span className="text-caption text-text-muted">{formatTime(alert.timestamp)}</span>
                    </div>
                    <div className="text-small text-text-primary mt-1">
                      {alert.threat_description || alert.type || 'Security Alert'}
                    </div>
                    {alert.remote_ip && (
                      <div className="text-caption text-text-muted">
                        {alert.local_address} → {alert.remote_ip}:{alert.remote_port}
                      </div>
                    )}
                    {alert.process_name && (
                      <div className="text-caption text-text-muted">Process: {alert.process_name}</div>
                    )}
                    {alert.feed_name && (
                      <div className="text-caption text-text-muted">Feed: {alert.feed_name}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Feed Status */}
        <Card title="Threat Intelligence Feeds" variant="glass">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-small text-text-secondary">
                Network C2 feeds: {feedStatus?.network_c2 && 'feeds_loaded' in feedStatus.network_c2 ? feedStatus.network_c2.feeds_loaded : 0} loaded
              </div>
              <div className="text-caption text-text-muted">
                Last updated: {feedStatus?.network_c2 && 'last_feed_update' in feedStatus.network_c2 ? formatRelative(feedStatus.network_c2.last_feed_update) : 'Never'}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-small text-text-secondary">
                Hash blocklist: {feedStatus?.hash_blocklist && 'count' in feedStatus.hash_blocklist ? feedStatus.hash_blocklist.count : 0} entries
              </div>
              <div className="text-caption text-text-muted">
                Last updated: {feedStatus?.hash_blocklist && 'last_updated' in feedStatus.hash_blocklist ? formatRelative(feedStatus.hash_blocklist.last_updated) : 'Never'}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleUpdateFeeds}
              disabled={!isPro || updatingFeeds}
              leftIcon={
                updatingFeeds ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownTrayIcon className="h-4 w-4" />
                )
              }
              data-testid="update-feeds-btn"
            >
              {updatingFeeds ? 'Updating...' : 'Update Feeds'}
            </Button>
          </div>
        </Card>

        {/* Configuration Panel */}
        <Card variant="glass">
          <button
            onClick={() => setConfigPanelOpen(!configPanelOpen)}
            className="flex items-center gap-2 w-full text-left"
            data-testid="config-toggle"
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-text-muted" />
            <span className="text-small font-medium text-text-primary">Configuration</span>
          </button>
          {configPanelOpen && (
            <div className="mt-4 space-y-4" data-testid="config-panel">
              {/* ETW File Monitor toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-small font-medium text-text-primary">File Activity Monitor</div>
                  <div className="text-caption text-text-secondary">Monitor file changes in critical directories</div>
                </div>
                <ToggleSwitch
                  on={config?.etw_file_monitor ?? false}
                  onClick={() => handleConfigure({ etw_file_monitor: !config?.etw_file_monitor })}
                  testId="toggle-etw-file"
                />
              </div>

              {/* USB auto-scan toggle */}
              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-4">
                <div>
                  <div className="text-small font-medium text-text-primary">USB Auto-Scan</div>
                  <div className="text-caption text-text-secondary">Automatically scan USB drives on insertion</div>
                </div>
                <ToggleSwitch
                  on={config?.usb_auto_scan ?? false}
                  onClick={() => handleConfigure({ usb_auto_scan: !config?.usb_auto_scan })}
                  testId="toggle-usb-auto"
                />
              </div>

              {/* Network C2 toggle */}
              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-4">
                <div>
                  <div className="text-small font-medium text-text-primary">Network C2 Detection</div>
                  <div className="text-caption text-text-secondary">Check connections against threat feeds</div>
                </div>
                <ToggleSwitch
                  on={config?.network_c2_monitor ?? false}
                  onClick={() => handleConfigure({ network_c2_monitor: !config?.network_c2_monitor })}
                  testId="toggle-network-c2"
                />
              </div>

              {/* Auto-scan on alert */}
              <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-4">
                <div>
                  <div className="text-small font-medium text-text-primary">Auto-Scan on Alert</div>
                  <div className="text-caption text-text-secondary">Trigger threat scan when suspicious activity detected</div>
                </div>
                <ToggleSwitch
                  on={config?.auto_scan_on_alert ?? false}
                  onClick={() => handleConfigure({ auto_scan_on_alert: !config?.auto_scan_on_alert })}
                  testId="toggle-auto-scan-alert"
                />
              </div>

              {/* Network poll interval */}
              <div className="border-t border-[var(--avs-border)] pt-4">
                <div className="text-small font-medium text-text-primary mb-2">
                  Network Poll Interval: {config?.network_poll_interval ?? 5}s
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={config?.network_poll_interval ?? 5}
                  onChange={(e) => handleConfigure({ network_poll_interval: parseInt(e.target.value) })}
                  className="w-full"
                  data-testid="poll-interval-slider"
                />
              </div>
            </div>
          )}
        </Card>

        {/* Free edition notice */}
        {!isPro && (
          <Card variant="glass" className="border-brand-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-brand-primary">Free Edition</div>
                <div className="text-caption text-text-secondary mt-1">
                  Upgrade to Professional to enable real-time monitoring, USB auto-scan, and network C2 detection.
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={() => showUpgrade()} data-testid="upgrade-btn">
                Upgrade
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Toggle Switch component ──────────────────────────────────────

function ToggleSwitch({
  on,
  onClick,
  testId,
}: {
  on: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-semantic-success' : 'bg-[var(--avs-border)]'}`}
      data-testid={testId}
    >
      <div
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
