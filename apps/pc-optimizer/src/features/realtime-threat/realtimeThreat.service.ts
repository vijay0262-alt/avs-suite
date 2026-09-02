/**
 * Real-Time Threat Protection service — wraps the backend
 * `realtime_threat.*` RPC methods.
 *
 * Provides real-time monitoring of file system activity (ETW/WMI),
 * USB device insertion, and network C2 (command & control) detection
 * backed by threat intelligence feeds.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

// ── Types ───────────────────────────────────────────────────────

export type RealtimeThreatEventType =
  | 'file_create'
  | 'file_modify'
  | 'file_delete'
  | 'process_start'
  | 'usb_insert'
  | 'usb_remove'
  | 'usb_inserted'
  | 'usb_removed'
  | 'usb_threat_alert'
  | 'c2_detected';

export type RealtimeThreatSeverity = 'critical' | 'high' | 'medium' | 'low';

/** Generic monitor status — covers ETW, USB, and network C2 monitors. */
export interface MonitorStatus {
  running: boolean;
  events_buffered?: number;
  eventCount?: number;
  alerts_buffered?: number;
  started_at?: string | null;
  startedAt?: string | null;
  stopped_at?: string | null;
  stoppedAt?: string | null;
  captured_at?: string;
  /** ETW-specific */
  supported?: boolean;
  usingFallback?: boolean;
  fileWatchers?: { directory: string; running: boolean }[];
  processWatcherRunning?: boolean;
  maxEvents?: number;
  watchedDirectories?: string[];
  /** USB-specific */
  devices_watched?: number;
  scans_triggered?: number;
  auto_scan_enabled?: boolean;
  scan_on_insert?: boolean;
  quick_scan?: boolean;
  excluded_drives?: string[];
  /** Network C2-specific */
  connections_checked?: number;
  threats_found?: number;
  feeds_loaded?: number;
  feed_names?: string[];
  last_feed_update?: string | null;
  [key: string]: unknown;
}

export interface RealtimeThreatConfig {
  etw_file_monitor: boolean;
  etw_process_monitor: boolean;
  usb_auto_scan: boolean;
  usb_scan_quick: boolean;
  usb_exclude_drives: string[];
  network_c2_monitor: boolean;
  network_poll_interval: number;
  auto_scan_on_alert: boolean;
}

export interface RealtimeThreatStatus {
  platform: string;
  etw_file_monitor: MonitorStatus | null;
  etw_process_monitor: MonitorStatus | null;
  usb_monitor: MonitorStatus | null;
  network_c2: MonitorStatus | null;
  config: RealtimeThreatConfig;
}

export interface RealtimeThreatEvent {
  timestamp: string;
  type: RealtimeThreatEventType;
  path?: string;
  process_name?: string;
  details?: Record<string, unknown>;
  severity?: RealtimeThreatSeverity;
  /** USB event fields */
  drive_letter?: string;
  label?: string;
  size?: number;
  free_space?: number;
  filesystem?: string;
  auto_scanned?: boolean;
  scan_id?: string | null;
  [key: string]: unknown;
}

export interface RealtimeThreatAlert {
  timestamp: string;
  type?: string;
  severity: RealtimeThreatSeverity;
  local_address?: string;
  remote_ip?: string;
  remote_port?: number;
  process_name?: string;
  process_pid?: number;
  feed_name?: string;
  threat_description?: string;
  status?: string;
  [key: string]: unknown;
}

export interface UsbDevice {
  drive_letter: string;
  label: string;
  size: number;
  free_space: number;
  filesystem: string;
}

export interface ThreatFeedStatus {
  network_c2: MonitorStatus | { error: string } | null;
  hash_blocklist: { count: number; last_updated: string | null } | { error: string } | null;
}

// ── Response types ──────────────────────────────────────────────

export interface RealtimeThreatStatusResponse {
  success: boolean;
  status: RealtimeThreatStatus;
}

export interface RealtimeThreatStartStopResponse {
  success: boolean;
  results: Record<string, string>;
}

export interface RealtimeThreatEventsResponse {
  success: boolean;
  events: RealtimeThreatEvent[];
  count: number;
}

export interface RealtimeThreatAlertsResponse {
  success: boolean;
  alerts: RealtimeThreatAlert[];
  count: number;
}

export interface RealtimeThreatConfigureResponse {
  success: boolean;
  config: RealtimeThreatConfig;
}

export interface RealtimeThreatUsbDevicesResponse {
  success: boolean;
  devices: UsbDevice[];
  message?: string;
}

export interface RealtimeThreatUsbScanResponse {
  success: boolean;
  result: {
    success: boolean;
    scan_id?: string;
    drive?: string;
    files_total?: number;
    error?: string;
    [key: string]: unknown;
  };
}

export interface RealtimeThreatNetworkScanResponse {
  success: boolean;
  alerts: RealtimeThreatAlert[];
  count: number;
}

export interface RealtimeThreatUpdateFeedsResponse {
  success: boolean;
  results: Record<string, Record<string, unknown>>;
}

export interface RealtimeThreatFeedStatusResponse {
  success: boolean;
  feeds: ThreatFeedStatus;
}

// ── Service ─────────────────────────────────────────────────────

export const realtimeThreatService = {
  /** Get the current real-time threat monitoring status and config. */
  async getStatus(): Promise<RealtimeThreatStatusResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_STATUS);
  },

  /** Start all real-time threat monitors (ETW, USB, network C2). */
  async start(): Promise<RealtimeThreatStartStopResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_START);
  },

  /** Stop all real-time threat monitors. */
  async stop(): Promise<RealtimeThreatStartStopResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_STOP);
  },

  /** Get recent monitoring events from all (or a specific) monitor. */
  async getEvents(
    limit?: number,
    source?: string,
  ): Promise<RealtimeThreatEventsResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_EVENTS, {
      limit,
      source,
    });
  },

  /** Get recent alerts from all monitors. */
  async getAlerts(limit?: number): Promise<RealtimeThreatAlertsResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_ALERTS, { limit });
  },

  /** Update the real-time threat monitoring configuration. */
  async configure(
    config: Partial<RealtimeThreatConfig>,
  ): Promise<RealtimeThreatConfigureResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_CONFIGURE, { ...config });
  },

  /** List currently connected USB / removable devices. */
  async getUsbDevices(): Promise<RealtimeThreatUsbDevicesResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_USB_DEVICES);
  },

  /** Manually scan a USB drive for threats. */
  async scanUsb(driveLetter: string): Promise<RealtimeThreatUsbScanResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_USB_SCAN, {
      drive_letter: driveLetter,
    });
  },

  /** Scan all current network connections for C2 / threat indicators. */
  async networkScan(): Promise<RealtimeThreatNetworkScanResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_NETWORK_SCAN);
  },

  /** Update threat intelligence feeds (optionally force a full refresh). */
  async updateFeeds(force?: boolean): Promise<RealtimeThreatUpdateFeedsResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_UPDATE_FEEDS, {
      force: !!force,
    });
  },

  /** Get threat intelligence feed status (counts, last updated). */
  async getFeedStatus(): Promise<RealtimeThreatFeedStatusResponse> {
    return client().call(RPC_METHODS.REALTIME_THREAT_FEED_STATUS);
  },
};
