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

export interface QuarantineEntry {
  quarantineId: string;
  originalPath: string;
  quarantinePath: string;
  threatId: string;
  reason: string;
  quarantinedAt: string;
  fileSize: number;
  restored: boolean;
}

// ── Service ────────────────────────────────────────────────────

export const securityBackendService = {
  // ── Security scanning ──────────────────────────────────────

  async getSnapshot(): Promise<SecuritySnapshotData> {
    return rpc.raw<SecuritySnapshotData>(RPC_METHODS.SECURITY_SNAPSHOT);
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

  async quarantineFile(filePath: string, threatId?: string, reason?: string): Promise<{ quarantineId: string; quarantined: boolean; originalPath: string; quarantinePath: string; timestamp: string; error?: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_QUARANTINE, { filePath, threatId, reason });
  },

  async restoreQuarantined(quarantineId: string): Promise<{ quarantineId: string; restored: boolean; originalPath: string; timestamp: string; error?: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_QUARANTINE_RESTORE, { quarantineId });
  },

  async listQuarantined(): Promise<{ items: QuarantineEntry[]; count: number; totalItems: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_QUARANTINE_LIST);
  },

  async deleteQuarantined(quarantineId: string): Promise<{ quarantineId: string; deleted: boolean; timestamp: string; error?: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_QUARANTINE_DELETE, { quarantineId });
  },

  // ── Remediation plans ──────────────────────────────────────

  async generateRemediationPlan(threats: Array<{ id: string; type: string; filePath: string; severity: string }>): Promise<{ planId: string; actions: Array<Record<string, unknown>>; totalActions: number; generatedAt: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_REMEDIATION_PLAN, { threats });
  },

  async executeRemediationPlan(plan: { planId: string; actions: Array<Record<string, unknown>> }, actionIds?: string[]): Promise<{ planId: string; executed: number; failed: number; skipped: number; results: Array<Record<string, unknown>>; timestamp: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_REMEDIATION_EXECUTE, { plan, actionIds });
  },

  async rollbackRemediation(quarantineIds: string[]): Promise<{ restored: number; total: number; results: Array<Record<string, unknown>>; timestamp: string }> {
    return rpc.raw(RPC_METHODS.SECURITY_REMEDIATION_ROLLBACK, { quarantineIds });
  },
};
