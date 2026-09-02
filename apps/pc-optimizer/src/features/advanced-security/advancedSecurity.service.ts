/**
 * Advanced Security service — wraps the backend
 * `advanced_security.*` RPC methods.
 *
 * Tier 3 advanced threat protection:
 * - Behavioral sandbox
 * - ML anomaly classifier
 * - Web shield / URL filtering
 * - Ransomware vaccine
 * - Email attachment scanner
 * - Boot sector / MBR scanner
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

// ── Types ───────────────────────────────────────────────────────

export type ThreatLevel = 'safe' | 'suspicious' | 'malicious';
export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';
export type SandboxVerdict = 'benign' | 'suspicious' | 'malicious';

export interface SandboxStatus {
  available: boolean;
  observation_time?: number;
  score_threshold?: number;
  analyses_run?: number;
  platform?: string;
  captured_at?: string;
}

export interface SandboxResult {
  verdict: SandboxVerdict;
  score: number;
  indicators: { type: string; description: string; score: number }[];
  duration: number;
  file_path: string;
  sha256: string;
}

export interface MLStatus {
  available: boolean;
  running?: boolean;
  baseline_samples?: number;
  anomalies_detected?: number;
  model_type?: string;
  platform?: string;
}

export interface MLAnomaly {
  timestamp: string;
  pid: number;
  process_name: string;
  score: number;
  severity: 'medium' | 'high' | 'critical';
  reasons: string[];
  metrics?: Record<string, number>;
}

export interface WebShieldStatus {
  available: boolean;
  urls_checked?: number;
  threats_blocked?: number;
  feeds_loaded?: number;
  blocklist_size?: number;
}

export interface UrlCheckResult {
  safe: boolean;
  risk_level: RiskLevel;
  reasons: string[];
  categories: string[];
}

export interface BlockedUrl {
  url: string;
  category: string;
  timestamp: string;
}

export interface RansomwareStatus {
  available: boolean;
  running?: boolean;
  canary_files_deployed?: number;
  alerts_triggered?: number;
  protected_dirs?: string[];
}

export interface RansomwareAlert {
  timestamp: string;
  file_path: string;
  event_type: string;
  severity: 'medium' | 'high' | 'critical';
  expected_hash?: string;
  current_hash?: string;
  process_name?: string;
  process_pid?: number;
}

export interface EmailScanResult {
  safe: boolean;
  threat_level: ThreatLevel;
  threats: { type: string; description: string; severity: string }[];
  file_info: { name: string; size: number; extension: string; sha256: string };
}

export interface EmailScannerStatus {
  available: boolean;
  files_scanned?: number;
  threats_found?: number;
  last_scan?: string | null;
}

export interface BootScanResult {
  safe: boolean;
  threats: { type: string; description: string; severity: string }[];
  mbr_info: {
    drive: string;
    boot_signature_valid: boolean;
    partition_entries: number;
    active_partitions: number;
    boot_code_type: string;
  };
}

export interface BootScannerStatus {
  available: boolean;
  last_scan?: string | null;
  threats_found?: number;
}

export interface AdvancedSecurityStatus {
  platform: string;
  behavioral_sandbox: SandboxStatus | null;
  ml_anomaly: MLStatus | null;
  web_shield: WebShieldStatus | null;
  ransomware_vaccine: RansomwareStatus | null;
  email_scanner: EmailScannerStatus | null;
  boot_scanner: BootScannerStatus | null;
}

// ── Response types ──────────────────────────────────────────────

export interface StatusResponse {
  success: boolean;
  status: AdvancedSecurityStatus;
}

export interface SandboxAnalyzeResponse {
  success: boolean;
  result: SandboxResult;
}

export interface MLAnomaliesResponse {
  success: boolean;
  anomalies: MLAnomaly[];
}

export interface WebCheckResponse {
  success: boolean;
  result: UrlCheckResult;
}

export interface WebBlockedResponse {
  success: boolean;
  blocked: BlockedUrl[];
}

export interface RansomwareAlertsResponse {
  success: boolean;
  alerts: RansomwareAlert[];
}

export interface EmailScanResponse {
  success: boolean;
  result: EmailScanResult;
}

export interface BootScanResponse {
  success: boolean;
  result: BootScanResult;
}

// ── Service ─────────────────────────────────────────────────────

export const advancedSecurityService = {
  // Overall status
  async getStatus(): Promise<StatusResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_STATUS);
  },

  // Behavioral Sandbox
  async sandboxAnalyze(filePath: string): Promise<SandboxAnalyzeResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_SANDBOX_ANALYZE, {
      file_path: filePath,
    });
  },
  async sandboxStatus(): Promise<{ success: boolean; status: SandboxStatus }> {
    return client().call(RPC_METHODS.ADV_SECURITY_SANDBOX_STATUS);
  },

  // ML Anomaly
  async mlStart(): Promise<{ success: boolean; message?: string }> {
    return client().call(RPC_METHODS.ADV_SECURITY_ML_START);
  },
  async mlStop(): Promise<{ success: boolean; message?: string }> {
    return client().call(RPC_METHODS.ADV_SECURITY_ML_STOP);
  },
  async mlStatus(): Promise<{ success: boolean; status: MLStatus }> {
    return client().call(RPC_METHODS.ADV_SECURITY_ML_STATUS);
  },
  async mlAnomalies(): Promise<MLAnomaliesResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_ML_ANOMALIES);
  },
  async mlTrain(durationSeconds: number = 60): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_ML_TRAIN, {
      duration_seconds: durationSeconds,
    });
  },

  // Web Shield
  async webCheck(url: string): Promise<WebCheckResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_WEB_CHECK, { url });
  },
  async webStatus(): Promise<{ success: boolean; status: WebShieldStatus }> {
    return client().call(RPC_METHODS.ADV_SECURITY_WEB_STATUS);
  },
  async webUpdateFeeds(force: boolean = false): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_WEB_UPDATE_FEEDS, { force });
  },
  async webBlocked(): Promise<WebBlockedResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_WEB_BLOCKED);
  },
  async webAddBlock(url: string, category: string = 'manual'): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_WEB_ADD_BLOCK, { url, category });
  },
  async webRemoveBlock(url: string): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_WEB_REMOVE_BLOCK, { url });
  },

  // Ransomware Vaccine
  async ransomwareStart(): Promise<{ success: boolean; message?: string }> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_START);
  },
  async ransomwareStop(): Promise<{ success: boolean; message?: string }> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_STOP);
  },
  async ransomwareStatus(): Promise<{ success: boolean; status: RansomwareStatus }> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_STATUS);
  },
  async ransomwareAlerts(): Promise<RansomwareAlertsResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_ALERTS);
  },
  async ransomwareConfigure(config: Partial<{ canary_count: number; protected_dirs: string[]; auto_block: boolean; monitor_interval: number }>): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_CONFIGURE, config);
  },
  async ransomwareDeploy(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_DEPLOY);
  },
  async ransomwareRemove(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_RANSOMWARE_REMOVE);
  },

  // Email Scanner
  async emailScan(filePath: string): Promise<EmailScanResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_EMAIL_SCAN, { file_path: filePath });
  },
  async emailScanDir(dirPath: string): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_EMAIL_SCAN_DIR, { dir_path: dirPath });
  },
  async emailStatus(): Promise<{ success: boolean; status: EmailScannerStatus }> {
    return client().call(RPC_METHODS.ADV_SECURITY_EMAIL_STATUS);
  },
  async emailHistory(): Promise<{ success: boolean; history: Record<string, unknown>[] }> {
    return client().call(RPC_METHODS.ADV_SECURITY_EMAIL_HISTORY);
  },

  // Boot Sector Scanner
  async bootScan(): Promise<BootScanResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_BOOT_SCAN);
  },
  async bootScanDrive(driveIndex: number): Promise<BootScanResponse> {
    return client().call(RPC_METHODS.ADV_SECURITY_BOOT_SCAN_DRIVE, {
      drive_index: driveIndex,
    });
  },
  async bootStatus(): Promise<{ success: boolean; status: BootScannerStatus }> {
    return client().call(RPC_METHODS.ADV_SECURITY_BOOT_STATUS);
  },
  async bootBackup(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_BOOT_BACKUP);
  },
  async bootVerify(backupPath: string): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.ADV_SECURITY_BOOT_VERIFY, {
      backup_path: backupPath,
    });
  },
  async bootHistory(): Promise<{ success: boolean; history: Record<string, unknown>[] }> {
    return client().call(RPC_METHODS.ADV_SECURITY_BOOT_HISTORY);
  },
};
