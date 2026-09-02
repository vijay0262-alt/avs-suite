/**
 * Threat Engine service — wraps the backend threat.* RPC methods.
 *
 * Provides a unified antivirus / anti-malware scanning interface backed by
 * multiple detection sources (hash blocklist, YARA rules, ClamAV signatures,
 * VirusTotal).
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

// ── Types ───────────────────────────────────────────────────────

export type ThreatSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ThreatScanType = 'quick' | 'full' | 'custom';
export type ThreatScanStatusValue =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'failed';
export type ThreatStatusValue = 'active' | 'idle' | 'scanning' | 'error';

export interface ThreatDefinitionCounts {
  hash_blocklist: number;
  yara_rules: number;
  clamav_signatures: number;
  clamav_available: boolean;
  clamav_version: string | null;
  last_updated: string | null;
}

export interface ThreatEngineConfig {
  enabled_sources: string[];
  virustotal_api_key: string;
  scan_max_file_size_mb: number;
  auto_quarantine: boolean;
  exclude_paths: string[];
}

export interface ThreatEngineStatus {
  status: ThreatStatusValue;
  active_scans: number;
  enabled_sources: string[];
  definitions: ThreatDefinitionCounts;
  config: ThreatEngineConfig;
}

export interface ThreatInfo {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  detection_source: string;
  threat_name: string;
  threat_type: string;
  severity: ThreatSeverity;
  confidence: number;
  details: string;
  sha256: string;
  detected_at: string;
  status: string;
}

export interface ThreatScanResult {
  scan_id: string;
  status: ThreatScanStatusValue;
  scan_type: ThreatScanType;
  started_at: string;
  completed_at: string | null;
  files_scanned: number;
  files_total: number;
  threats_found: number;
  threats: ThreatInfo[];
  errors: string[];
}

export interface ThreatScanStatus {
  scan_id: string;
  status: ThreatScanStatusValue;
  progress: number;
  files_scanned: number;
  files_total: number;
  threats_found: number;
}

export interface ThreatHistoryEntry {
  scan_id: string;
  scan_type: ThreatScanType;
  started_at: string;
  completed_at: string | null;
  files_scanned: number;
  threats_found: number;
  threats: ThreatInfo[];
}

export interface ThreatScanStartResponse {
  success: boolean;
  scan_id: string;
  files_total: number;
}

export interface ThreatConfigureResponse {
  success: boolean;
  config: ThreatEngineConfig;
}

export interface ThreatDefinitionsResponse {
  success: boolean;
  definitions: ThreatDefinitionCounts;
}

export interface ThreatUpdateDefsResponse {
  success: boolean;
  results: Record<string, { updated: boolean; count: number; error?: string }>;
}

export interface ClamAvStatus {
  installed: boolean;
  clamd_running: boolean;
  clamd_path: string | null;
  freshclam_path: string | null;
  conf_path: string | null;
  version: string | null;
  signature_count: number;
  db_path: string | null;
}

export interface ClamAvSetupStatus {
  installed: boolean;
  version: string | null;
  setup_date: string | null;
  install_dir: string | null;
  setup_in_progress: boolean;
  setup_progress: Record<string, unknown> | null;
}

export interface ThreatListResponse {
  success: boolean;
  threats: ThreatInfo[];
}

export interface ThreatQuarantineResponse {
  success: boolean;
  result: { quarantine_id: string; file_path: string };
}

export interface ThreatRestoreResponse {
  success: boolean;
  result: { file_path: string; restored: boolean };
}

export interface ThreatRemoveResponse {
  success: boolean;
}

export interface ThreatHistoryResponse {
  success: boolean;
  history: ThreatHistoryEntry[];
}

export interface ThreatCancelResponse {
  success: boolean;
}

// ── Service ─────────────────────────────────────────────────────

export const threatEngineService = {
  /** Get the current threat engine status, active scans, and config. */
  async getStatus(): Promise<ThreatEngineStatus> {
    return client().call(RPC_METHODS.THREAT_STATUS);
  },

  /** Start a scan on a specific path with the given scan type. */
  async scan(
    path: string,
    scanType: ThreatScanType,
  ): Promise<ThreatScanStartResponse> {
    return client().call(RPC_METHODS.THREAT_SCAN, { path, scan_type: scanType });
  },

  /** Start a quick scan (common malware locations). */
  async quickScan(): Promise<ThreatScanStartResponse> {
    return client().call(RPC_METHODS.THREAT_QUICK_SCAN);
  },

  /** Start a full system scan. */
  async fullScan(): Promise<ThreatScanStartResponse> {
    return client().call(RPC_METHODS.THREAT_FULL_SCAN);
  },

  /** Get the live status of a running or completed scan. */
  async getScanStatus(scanId: string): Promise<ThreatScanStatus> {
    return client().call(RPC_METHODS.THREAT_SCAN_STATUS, { scan_id: scanId });
  },

  /** Get the full result of a completed scan. */
  async getScanResult(scanId: string): Promise<ThreatScanResult> {
    return client().call(RPC_METHODS.THREAT_SCAN_RESULT, { scan_id: scanId });
  },

  /** Cancel a running scan. */
  async cancelScan(scanId: string): Promise<ThreatCancelResponse> {
    return client().call(RPC_METHODS.THREAT_SCAN_CANCEL, { scan_id: scanId });
  },

  /** Update the threat engine configuration. */
  async configure(
    config: Partial<ThreatEngineConfig>,
  ): Promise<ThreatConfigureResponse> {
    return client().call(RPC_METHODS.THREAT_CONFIGURE, { config });
  },

  /** Get current definition counts and last-updated timestamp. */
  async getDefinitions(): Promise<ThreatDefinitionsResponse> {
    return client().call(RPC_METHODS.THREAT_DEFINITIONS);
  },

  /** Update threat definitions (optionally force a full refresh). */
  async updateDefinitions(force?: boolean): Promise<ThreatUpdateDefsResponse> {
    return client().call(RPC_METHODS.THREAT_UPDATE_DEFS, { force: !!force });
  },

  /** List detected threats, optionally filtered by scan ID. */
  async listThreats(scanId?: string): Promise<ThreatListResponse> {
    return client().call(RPC_METHODS.THREAT_LIST_THREATS, {
      scan_id: scanId,
    });
  },

  /** Quarantine a detected threat. */
  async quarantineThreat(
    filePath: string,
    threatInfo: Partial<ThreatInfo>,
  ): Promise<ThreatQuarantineResponse> {
    return client().call(RPC_METHODS.THREAT_QUARANTINE, {
      file_path: filePath,
      threat_info: threatInfo,
    });
  },

  /** Restore a previously quarantined threat. */
  async restoreThreat(quarantineId: string): Promise<ThreatRestoreResponse> {
    return client().call(RPC_METHODS.THREAT_RESTORE, {
      quarantine_id: quarantineId,
    });
  },

  /** Permanently remove a detected threat file. */
  async removeThreat(filePath: string): Promise<ThreatRemoveResponse> {
    return client().call(RPC_METHODS.THREAT_REMOVE, { file_path: filePath });
  },

  /** Get scan history. */
  async getHistory(): Promise<ThreatHistoryResponse> {
    return client().call(RPC_METHODS.THREAT_HISTORY);
  },

  // ── ClamAV-specific methods ──────────────────────────────────

  /** Get ClamAV installation and daemon status. */
  async getClamAvStatus(): Promise<{ success: boolean; status: ClamAvStatus }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_STATUS);
  },

  /** Update ClamAV signature database via freshclam. */
  async updateClamAvDb(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_UPDATE);
  },

  /** Detect ClamAV installation on this system. */
  async detectClamAv(): Promise<{ success: boolean; detection: ClamAvStatus }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_DETECT);
  },

  /** Start ClamAV portable download and setup (async). */
  async setupClamAv(): Promise<{ success: boolean; setup_in_progress: boolean; message: string }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_SETUP);
  },

  /** Get ClamAV setup progress. */
  async getClamAvSetupStatus(): Promise<{ success: boolean; status: ClamAvSetupStatus }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_SETUP_STATUS);
  },

  /** Start the ClamAV daemon (clamd). */
  async startClamAvDaemon(): Promise<{ success: boolean; message: string; pid?: number }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_START);
  },

  /** Remove the ClamAV portable installation. */
  async uninstallClamAv(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.THREAT_CLAMAV_UNINSTALL);
  },
};
