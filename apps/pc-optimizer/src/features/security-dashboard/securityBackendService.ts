/**
 * securityBackendService — RPC bridge for the Python security backend modules.
 *
 * Wraps `rpc.raw()` calls to the backend security, investigation, and
 * remediation modules. The frontend SecurityCenterService uses this to
 * fetch real system data before running its frontend analysis providers.
 *
 * Data flow:
 *   Backend (psutil/WMI/PowerShell) → securityBackendService → SecurityCenterService
 *   → SecurityEngine providers → SecuritySnapshot → UI
 */
import { rpc } from '../../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';

// ── Types ──────────────────────────────────────────────────────

export interface BackendProcess {
  pid: number;
  ppid: number;
  name: string;
  exe: string;
  cmdline: string;
  username: string;
  createTime: number;
  status: string;
}

export interface BackendStartupEntry {
  name: string;
  command: string;
  source: string;
  location: string;
  type: string;
}

export interface BackendScheduledTask {
  taskName: string;
  taskPath: string;
  state: string;
  author: string;
  description: string;
  actions: Array<{ execute: string; arguments: string; workingDir: string }>;
  triggers: Array<{ type: string; enabled: boolean }>;
  lastRunTime: string | null;
  nextRunTime: string | null;
  lastResult: number;
}

export interface BackendService {
  name: string;
  displayName: string;
  state: string;
  startMode: string;
  pathName: string;
  processId: number;
  serviceType: string;
  startName: string;
}

export interface BackendBrowserExtension {
  browser: string;
  extensionId: string;
  version: string;
  name: string;
  description: string;
  permissions: string[];
  hostPermissions: unknown[];
  manifestVersion: number;
  path: string;
  enabled?: boolean;
}

export interface BackendUnsignedExecutable {
  path: string;
  name: string;
  size: number;
  signatureStatus: string;
  signer: string;
  lastModified: string;
}

export interface BackendNetworkConnection {
  processName: string;
  pid: number;
  localAddress: string;
  remoteAddress: string;
  remotePort: number;
  protocol: string;
  state: string;
  timestamp: number;
}

export interface BackendListeningPort {
  processName: string;
  pid: number;
  port: number;
  protocol: string;
  address: string;
}

export interface SecuritySnapshotData {
  processes: { processes: BackendProcess[]; count: number; capturedAt: string };
  startupAnalysis: { entries: BackendStartupEntry[]; count: number; capturedAt: string };
  scheduledTasks: { tasks: BackendScheduledTask[]; count: number; capturedAt: string };
  services: { services: BackendService[]; count: number; capturedAt: string };
  browserExtensions: { extensions: BackendBrowserExtension[]; count: number; capturedAt: string };
  unsignedExecutables: { executables: BackendUnsignedExecutable[]; count: number; capturedAt: string };
  networkConnections?: { connections: BackendNetworkConnection[]; listeningPorts: BackendListeningPort[]; connectionCount: number; listeningPortCount: number; capturedAt: string };
  capturedAt: string;
  supported: boolean;
}

export interface FullSystemScanData {
  files: string[];
  fileCount: number;
  drivesScanned: string[];
  registryEntries: Array<{ key: string; value: string; source: string }>;
  registryEntryCount: number;
  unsignedExecutables: BackendUnsignedExecutable[];
  unsignedExecutableCount: number;
  capturedAt: string;
  supported: boolean;
}

export interface ScanStatus {
  scanId: string | null;
  status: string;
  progress: number;
  startedAt: string | null;
  error: string | null;
}

export interface InvestigationResult {
  investigationId: string;
  target: string;
  targetType: string;
  startedAt: string;
  status: string;
  evidence: Array<{ type: string; source: string; value: unknown; timestamp: string }>;
  timeline: Array<{ event: string; timestamp: string; source: string; details: string }>;
  correlations: Array<{ type: string; [key: string]: unknown }>;
  evidenceCount: number;
  capturedAt: string;
}

/**
 * Privacy-safe quarantine entry returned by the canonical
 * `scan_core.security_remediation.quarantine_list` RPC.
 *
 * SC-8C14 Phase 3: this interface intentionally does NOT expose
 * `quarantinePath`, `originalPath`, `asset_id`, `backup_location`,
 * registry keys, browser paths, or any internal filesystem location.
 * Only display-oriented fields are surfaced.
 */
export interface QuarantineEntry {
  id: string;
  displayName: string;
  status: 'quarantined' | 'restored' | 'deleted';
  detectedAt: string | null;
  threatType: string | null;
  severity: string | null;
  size: number;
  rollbackAvailable: boolean;
  detectionReason: string | null;
}

// ── Threat Engine (ClamAV/YARA/AMSI/Defender/Hash/Heuristic) ────

export interface ThreatEngineScanResult {
  success: boolean;
  scan_id: string;
  files_total: number;
  error?: string;
}

export interface ThreatEngineScanStatus {
  success: boolean;
  scan_id: string;
  status: 'scanning' | 'complete' | 'cancelled' | 'error' | 'idle';
  progress: number;
  files_scanned: number;
  files_total: number;
  threats_found: number;
}

export interface ThreatEngineThreat {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number;
  detection_source: string;
  threat_name: string;
  threat_type: string;
  severity: string;
  confidence: number;
  details: Record<string, unknown>;
  sha256: string | null;
  md5: string | null;
  detected_at: string;
  status: 'detected' | 'quarantined' | 'removed' | 'ignored';
  quarantine_id?: string;
}

export interface ThreatEngineScanResultFull {
  success: boolean;
  scan_id: string;
  status: string;
  scan_type: string;
  started_at: string | null;
  completed_at: string | null;
  files_scanned: number;
  files_total: number;
  threats_found: number;
  threats: ThreatEngineThreat[];
  errors: string[];
}

export interface ThreatEngineStatus {
  success: boolean;
  status: 'active' | 'idle';
  active_scans: number;
  enabled_sources: Record<string, boolean>;
  definitions: Record<string, number>;
  config: {
    scan_max_file_size_mb: number;
    scan_archives: boolean;
    auto_quarantine: boolean;
    exclude_paths: string[];
    virustotal_configured: boolean;
  };
}

// ── Service ────────────────────────────────────────────────────

export const securityBackendService = {
  // ── Security scanning ──────────────────────────────────────

  async getSnapshot(): Promise<SecuritySnapshotData> {
    return rpc.raw<SecuritySnapshotData>(RPC_METHODS.SECURITY_SNAPSHOT);
  },

  // ── Threat engine (signature-based AV scanning) ────────────

  async threatQuickScan(): Promise<ThreatEngineScanResult> {
    return rpc.raw<ThreatEngineScanResult>(RPC_METHODS.THREAT_QUICK_SCAN);
  },

  async threatFullScan(): Promise<ThreatEngineScanResult> {
    return rpc.raw<ThreatEngineScanResult>(RPC_METHODS.THREAT_FULL_SCAN);
  },

  async threatScanStatus(scanId: string): Promise<ThreatEngineScanStatus> {
    return rpc.raw<ThreatEngineScanStatus>(RPC_METHODS.THREAT_SCAN_STATUS, { scan_id: scanId });
  },

  async threatScanResult(scanId: string): Promise<ThreatEngineScanResultFull> {
    return rpc.raw<ThreatEngineScanResultFull>(RPC_METHODS.THREAT_SCAN_RESULT, { scan_id: scanId });
  },

  async threatScanCancel(scanId: string): Promise<{ success: boolean; message: string }> {
    return rpc.raw(RPC_METHODS.THREAT_SCAN_CANCEL, { scan_id: scanId });
  },

  async threatStatus(): Promise<ThreatEngineStatus> {
    return rpc.raw<ThreatEngineStatus>(RPC_METHODS.THREAT_STATUS);
  },

  async threatConfigure(params: Record<string, unknown>): Promise<{ success: boolean; config: Record<string, unknown> }> {
    return rpc.raw(RPC_METHODS.THREAT_CONFIGURE, params);
  },

  async getProcesses(): Promise<{ processes: BackendProcess[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_PROCESSES);
  },

  async getStartupAnalysis(): Promise<{ entries: BackendStartupEntry[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_STARTUP_ANALYSIS);
  },

  async getScheduledTasks(): Promise<{ tasks: BackendScheduledTask[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_SCHEDULED_TASKS);
  },

  async getServices(): Promise<{ services: BackendService[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_SERVICES);
  },

  async getBrowserExtensions(): Promise<{ extensions: BackendBrowserExtension[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_BROWSER_EXTENSIONS);
  },

  async getUnsignedExecutables(): Promise<{ executables: BackendUnsignedExecutable[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_UNSIGNED_EXECUTABLES);
  },

  async fullSystemScan(): Promise<FullSystemScanData> {
    return rpc.raw<FullSystemScanData>(RPC_METHODS.SECURITY_FULL_SYSTEM_SCAN);
  },

  async getNetworkConnections(): Promise<{ connections: BackendNetworkConnection[]; listeningPorts: BackendListeningPort[]; connectionCount: number; listeningPortCount: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_NETWORK_CONNECTIONS);
  },

  // ── Scan lifecycle ─────────────────────────────────────────

  async startScan(): Promise<{ scanId: string; status: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_SCAN);
  },

  async getScanStatus(): Promise<ScanStatus> {
    return rpc.raw(RPC_METHODS.SECURITY_SCAN_STATUS);
  },

  async cancelScan(): Promise<{ cancelled: boolean; reason?: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_SCAN_CANCEL);
  },

  // ── Investigation ──────────────────────────────────────────

  async investigate(target: string, targetType: string, indicators?: string[]): Promise<InvestigationResult> {
    return rpc.raw(RPC_METHODS.SECURITY_INVESTIGATE, { target, targetType, indicators });
  },

  async getInvestigationTimeline(investigationId: string): Promise<{ timeline: Array<{ event: string; timestamp: string; source: string; details: string }>; investigationId: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_INVESTIGATION_TIMELINE, { investigationId });
  },

  async getInvestigationEvidence(investigationId: string): Promise<{ evidence: Array<{ type: string; source: string; value: unknown; timestamp: string }>; investigationId: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_INVESTIGATION_EVIDENCE, { investigationId });
  },

  async getInvestigationCorrelation(investigationId: string): Promise<{ correlations: Array<{ type: string; [key: string]: unknown }>; investigationId: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_INVESTIGATION_CORRELATION, { investigationId });
  },

  // ── Quarantine ─────────────────────────────────────────────

  /**
   * List quarantined items via the canonical read-only RPC.
   *
   * SC-8C14 Phase 3: migrated from the transitional
   * `security.quarantine.list` RPC to the canonical
   * `scan_core.security_remediation.quarantine_list` RPC. The
   * response is privacy-safe and does not expose internal paths.
   */
  async listQuarantined(): Promise<{
    ok: boolean;
    items: QuarantineEntry[];
    count: number;
    totalItems: number;
    capturedAt: string;
    error?: string;
  }> {
    return rpc.raw(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST);
  },
};
