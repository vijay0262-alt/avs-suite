/**
 * AI Security Center — Type Definitions
 *
 * Version 1.2 — EPIC 1 — AI Security Center
 *
 * Foundation types for the AI Security Framework. Every future security
 * capability plugs into this framework via the provider architecture.
 *
 * Core principles:
 *   - The AI must never invent information. Every detection is evidence-based.
 *   - The UI never scans directly — it consumes only SecuritySnapshot.
 *   - Providers never communicate with each other directly.
 *   - No remediation, no real-time protection, no quarantine in this phase.
 *   - Foundation only: architecture, detection framework, provider system.
 */

// ── Threat Categories ────────────────────────────────────────────────

export type ThreatCategory =
  | 'spyware'
  | 'adware'
  | 'malware'
  | 'trojans'
  | 'ransomware'
  | 'pup'
  | 'pua'
  | 'browser_hijacker'
  | 'crypto_miner'
  | 'keylogger'
  | 'rootkit'
  | 'bootkit'
  | 'backdoor'
  | 'dropper'
  | 'downloader'
  | 'unsafe_script'
  | 'suspicious_scheduled_task'
  | 'suspicious_service'
  | 'suspicious_startup_entry'
  | 'unknown';

// ── Severity & Risk ──────────────────────────────────────────────────

export type ThreatSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type ThreatRisk = 'none' | 'low' | 'moderate' | 'high' | 'severe';
export type ThreatStatus = 'active' | 'resolved' | 'ignored' | 'quarantined' | 'pending' | 'false_positive';
export type ConfidenceLabel = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

// ── Provider Types ───────────────────────────────────────────────────

export type ProviderType =
  | 'behavior'
  | 'signature'
  | 'persistence'
  | 'browser_protection'
  | 'reputation'
  | 'threat_intelligence';

export type ProviderStatus = 'active' | 'inactive' | 'error' | 'unsupported' | 'initializing';

// ── Scan Types ───────────────────────────────────────────────────────

export type ScanType =
  | 'quick'
  | 'full'
  | 'custom'
  | 'folder'
  | 'process'
  | 'memory'
  | 'boot';

export type ScanStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

// ── Evidence ─────────────────────────────────────────────────────────

export interface SecurityEvidence {
  source: string;
  type: string;
  value: string;
  description: string;
  timestamp: number;
}

// ── MITRE ATT&CK ─────────────────────────────────────────────────────

export interface MitreAttackMapping {
  tactic: string;
  technique: string;
  subtechnique?: string;
  reference: string;
}

// ── Affected Asset ───────────────────────────────────────────────────

export interface AffectedAsset {
  type: 'file' | 'process' | 'registry' | 'service' | 'scheduled_task' | 'startup_entry' | 'browser_extension' | 'network';
  path: string;
  name: string;
  hash?: string;
  pid?: number;
}

// ── Threat ───────────────────────────────────────────────────────────

export interface Threat {
  id: string;
  name: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  confidence: number;
  confidenceLabel: ConfidenceLabel;
  risk: ThreatRisk;
  status: ThreatStatus;
  evidence: SecurityEvidence[];
  detectionSource: string;
  detectionTime: number;
  recommendation: string;
  explanation: string;
  mitreAttack: MitreAttackMapping | null;
  affectedAssets: AffectedAsset[];
  requiresRestart: boolean;
  reversible: boolean;
  canRemediate: boolean;
}

// ── Provider Interface ───────────────────────────────────────────────

export interface SecurityProviderInfo {
  id: string;
  name: string;
  type: ProviderType;
  version: string;
  status: ProviderStatus;
  enabled: boolean;
  priority: number;
  description: string;
  capabilities: string[];
  lastError: string | null;
  lastRun: number | null;
}

export interface ProviderScanContext {
  scanType: ScanType;
  scanId: string;
  targets: string[];
  options: Record<string, unknown>;
}

export interface ProviderScanResult {
  providerId: string;
  providerType: ProviderType;
  threats: Threat[];
  duration: number;
  success: boolean;
  error: string | null;
  itemsScanned: number;
  metadata: Record<string, unknown>;
}

// ── Security Snapshot ────────────────────────────────────────────────

export interface SecuritySnapshot {
  id: string;
  timestamp: number;
  threats: Threat[];
  securityScore: number;
  threatScore: number;
  riskScore: number;
  exposureScore: number;
  confidenceScore: number;
  providerStatuses: SecurityProviderInfo[];
  protectionStatus: ProtectionStatus;
  definitionsVersion: string;
  lastScan: number | null;
  lastUpdate: number | null;
  capabilities: SecurityCapabilityInfo[];
  historySummary: SecurityHistorySummary | null;
}

export interface ProtectionStatus {
  realTimeProtection: boolean;
  definitionsActive: boolean;
  providersActive: number;
  providersTotal: number;
  lastScanStatus: ScanStatus | null;
  overallProtected: boolean;
}

export interface SecurityCapabilityInfo {
  name: string;
  available: boolean;
  enabled: boolean;
  description: string;
}

export interface SecurityHistorySummary {
  totalScans: number;
  lastScanDate: number | null;
  totalThreatsDetected: number;
  totalThreatsResolved: number;
  averageScanDuration: number;
  lastThreatDetectedAt: number | null;
}

// ── Scan Result ──────────────────────────────────────────────────────

export interface ScanResult {
  scanId: string;
  scanType: ScanType;
  status: ScanStatus;
  startedAt: number;
  completedAt: number | null;
  duration: number;
  threats: Threat[];
  providerResults: ProviderScanResult[];
  itemsScanned: number;
  securityScore: number;
  snapshot: SecuritySnapshot | null;
  error: string | null;
}

// ── Scoring ──────────────────────────────────────────────────────────

export interface SecurityScores {
  securityScore: number;
  threatScore: number;
  riskScore: number;
  confidenceScore: number;
  exposureScore: number;
}

// ── Dashboard ────────────────────────────────────────────────────────

export interface SecurityDashboardData {
  summary: SecurityDashboardSummary;
  activeThreats: SecurityDashboardEntry[];
  recentScans: SecurityDashboardScanEntry[];
  providerStatus: SecurityProviderInfo[];
  capabilities: SecurityCapabilityInfo[];
  securityScoreTrend: SecurityScoreTrendPoint[];
  lastSnapshot: SecuritySnapshot | null;
}

export interface SecurityDashboardSummary {
  securityScore: number;
  threatLevel: ThreatRisk;
  activeThreatCount: number;
  totalThreatsDetected: number;
  providersActive: number;
  providersTotal: number;
  lastScanDate: number | null;
  definitionsVersion: string;
  overallProtected: boolean;
  nextRecommendedAction: string | null;
}

export interface SecurityDashboardEntry {
  id: string;
  name: string;
  category: ThreatCategory;
  severity: ThreatSeverity;
  risk: ThreatRisk;
  confidence: number;
  detectionSource: string;
  detectionTime: number;
  affectedAssetSummary: string;
  recommendation: string;
}

export interface SecurityDashboardScanEntry {
  scanId: string;
  scanType: ScanType;
  status: ScanStatus;
  startedAt: number;
  duration: number;
  threatsFound: number;
  itemsScanned: number;
}

export interface SecurityScoreTrendPoint {
  timestamp: number;
  securityScore: number;
  threatCount: number;
}

// ── Configuration ────────────────────────────────────────────────────

export interface SecurityConfiguration {
  enabled: boolean;
  enableBehaviorAnalysis: boolean;
  enableSignatureDetection: boolean;
  enablePersistenceDetection: boolean;
  enableBrowserProtection: boolean;
  enableReputationAnalysis: boolean;
  enableThreatIntelligence: boolean;
  defaultScanType: ScanType;
  maxConcurrentProviders: number;
  scanTimeoutMs: number;
  minConfidenceThreshold: number;
  enableNotifications: boolean;
  notificationMinSeverity: ThreatSeverity;
  definitionsAutoUpdate: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  maxHistoryEntries: number;
  enableDiagnostics: boolean;
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfiguration = {
  enabled: true,
  enableBehaviorAnalysis: true,
  enableSignatureDetection: true,
  enablePersistenceDetection: true,
  enableBrowserProtection: true,
  enableReputationAnalysis: true,
  enableThreatIntelligence: true,
  defaultScanType: 'quick',
  maxConcurrentProviders: 6,
  scanTimeoutMs: 300000,
  minConfidenceThreshold: 0.3,
  enableNotifications: true,
  notificationMinSeverity: 'medium',
  definitionsAutoUpdate: true,
  cacheEnabled: true,
  cacheTtlMs: 300000,
  maxHistoryEntries: 200,
  enableDiagnostics: true,
};

// ── Events ───────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'security_scan_started'
  | 'security_scan_completed'
  | 'security_scan_failed'
  | 'threat_detected'
  | 'threat_resolved'
  | 'provider_failed'
  | 'definitions_updated'
  | 'security_snapshot_updated';

export interface SecurityEvent {
  type: SecurityEventType;
  timestamp: number;
  scanId?: string;
  threatId?: string;
  providerId?: string;
  message?: string;
}

// ── History ──────────────────────────────────────────────────────────

export interface SecurityHistoryEntry {
  id: string;
  scanId: string;
  timestamp: number;
  scanType: ScanType;
  status: ScanStatus;
  threatsDetected: number;
  threatsResolved: number;
  duration: number;
  itemsScanned: number;
  securityScore: number;
}

export interface SecurityHistoryData {
  entries: SecurityHistoryEntry[];
  totalScans: number;
  completedScans: number;
  failedScans: number;
  totalThreatsDetected: number;
  totalThreatsResolved: number;
  averageScanDuration: number;
  averageSecurityScore: number;
}

// ── Cache ────────────────────────────────────────────────────────────

export interface SecurityCacheEntry {
  key: string;
  value: unknown;
  timestamp: number;
  ttl: number;
}

// ── Diagnostics ──────────────────────────────────────────────────────

export interface SecurityDiagnosticResult {
  component: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface SecurityDiagnosticsReport {
  results: SecurityDiagnosticResult[];
  overallStatus: 'pass' | 'fail' | 'warn';
  timestamp: number;
}

// ── Health ───────────────────────────────────────────────────────────

export interface SecurityHealthReport {
  overallHealth: 'healthy' | 'degraded' | 'critical' | 'unknown';
  securityScore: number;
  issues: SecurityHealthIssue[];
  recommendations: string[];
  timestamp: number;
}

export interface SecurityHealthIssue {
  component: string;
  severity: ThreatSeverity;
  description: string;
  recommendation: string;
}

// ── Capabilities ─────────────────────────────────────────────────────

export interface SecurityCapabilitiesReport {
  available: SecurityCapabilityInfo[];
  enabled: SecurityCapabilityInfo[];
  unavailable: string[];
  totalCapabilities: number;
  availableCount: number;
  enabledCount: number;
}

// ── Helper Functions ─────────────────────────────────────────────────

/**
 * Detection input types for Part 2 detection providers.
 * Each provider accepts typed input via ProviderScanContext.options.
 */

// ── Process Behavior Input ───────────────────────────────────────────

export interface ProcessBehaviorInfo {
  processName: string;
  pid: number;
  path: string;
  indicators: BehaviorIndicator[];
}

export interface BehaviorIndicator {
  type: string;
  description: string;
  weight: number;
  timestamp: number;
}

// ── Spyware Detection Input ──────────────────────────────────────────

export interface SpywareIndicator {
  processName: string;
  pid: number;
  path: string;
  indicators: SpywareSignal[];
}

export interface SpywareSignal {
  type:
    | 'credential_access'
    | 'browser_credential_access'
    | 'clipboard_monitoring'
    | 'screen_capture'
    | 'keyboard_hook'
    | 'microphone_access'
    | 'camera_access'
    | 'browser_data_access'
    | 'suspicious_persistence';
  description: string;
  timestamp: number;
}

// ── Adware Detection Input ───────────────────────────────────────────

export interface AdwareIndicator {
  target: string;
  indicators: AdwareSignal[];
}

export interface AdwareSignal {
  type:
    | 'ad_injection'
    | 'popup_generator'
    | 'notification_abuse'
    | 'homepage_modification'
    | 'search_engine_replacement'
    | 'toolbar_installation'
    | 'affiliate_injection'
    | 'advertising_service';
  description: string;
  timestamp: number;
}

// ── PUP Detection Input ──────────────────────────────────────────────

export interface PUPIndicator {
  target: string;
  name: string;
  indicators: PUPSignal[];
}

export interface PUPSignal {
  type:
    | 'bundled_installer'
    | 'optimizer_scam'
    | 'driver_updater_scam'
    | 'fake_antivirus'
    | 'unwanted_extension'
    | 'crypto_mining_software'
    | 'download_manager_bundle';
  description: string;
  timestamp: number;
}

// ── Browser Analysis Input ───────────────────────────────────────────

export interface BrowserAnalysisInput {
  extensions: BrowserExtensionDetail[];
  settings: BrowserSettingsDetail | null;
}

export interface BrowserExtensionDetail {
  id: string;
  name: string;
  browser: string;
  version: string;
  permissions: string[];
  publisher: string | null;
  rating: number;
  installDate: number;
  suspiciousPermissions: string[];
}

export interface BrowserSettingsDetail {
  homepage: string;
  searchEngine: string;
  defaultNewTab: string;
  notificationPermissions: NotificationPermission[];
  proxy: string | null;
  certificateAnomalies: string[];
}

export interface NotificationPermission {
  origin: string;
  granted: boolean;
  suspicious: boolean;
}

// ── Persistence Analysis Input ───────────────────────────────────────

export interface PersistenceAnalysisInput {
  startupEntries: StartupEntryDetail[];
  registryRunKeys: RegistryRunKeyDetail[];
  scheduledTasks: ScheduledTaskDetail[];
  services: ServiceDetail[];
  wmiPersistence: WmiPersistenceDetail[];
  shellExtensions: ShellExtensionDetail[];
}

export interface StartupEntryDetail {
  name: string;
  path: string;
  command: string;
  location: string;
  publisher: string | null;
  signed: boolean;
}

export interface RegistryRunKeyDetail {
  key: string;
  value: string;
  data: string;
  hive: string;
  publisher: string | null;
  signed: boolean;
}

export interface ScheduledTaskDetail {
  name: string;
  path: string;
  command: string;
  author: string | null;
  triggers: string[];
  enabled: boolean;
  hidden: boolean;
  lastRun: number | null;
}

export interface ServiceDetail {
  name: string;
  displayName: string;
  binaryPath: string;
  startType: string;
  serviceType: string;
  account: string;
  signed: boolean;
  publisher: string | null;
}

export interface WmiPersistenceDetail {
  filterName: string;
  consumerName: string;
  command: string;
  filterQuery: string;
}

export interface ShellExtensionDetail {
  name: string;
  clsid: string;
  dllPath: string;
  publisher: string | null;
  signed: boolean;
}

// ── Script Analysis Input ────────────────────────────────────────────

export interface ScriptAnalysisInput {
  scripts: ScriptDetail[];
}

export interface ScriptDetail {
  path: string;
  type: 'powershell' | 'vbscript' | 'javascript' | 'batch' | 'macro';
  content: string;
  commandLine: string | null;
  executionPolicy: string | null;
  encoded: boolean;
  obfuscated: boolean;
  suspiciousCommands: string[];
  timestamp: number;
}

// ── Reputation Analysis Input ────────────────────────────────────────

export interface ReputationAnalysisInput {
  files: FileReputationDetail[];
  publishers: PublisherReputationDetail[];
}

export interface FileReputationDetail {
  path: string;
  name: string;
  hash: string;
  signed: boolean;
  signer: string | null;
  publisher: string | null;
  fileSize: number;
  installLocation: 'program_files' | 'appdata' | 'temp' | 'user_profile' | 'system' | 'unknown';
  firstSeen: number | null;
  reputationScore: number;
  knownGood: boolean;
  knownBad: boolean;
}

export interface PublisherReputationDetail {
  name: string;
  signed: boolean;
  certificateValid: boolean;
  certificateChain: string[];
  knownVendor: boolean;
  reputationScore: number;
}

// ── Network Behavior Input ───────────────────────────────────────────

export interface NetworkBehaviorInput {
  connections: NetworkConnectionDetail[];
  listeningPorts: ListeningPortDetail[];
  dnsQueries: DnsQueryDetail[];
}

export interface NetworkConnectionDetail {
  processName: string;
  pid: number;
  localAddress: string;
  remoteAddress: string;
  remotePort: number;
  protocol: string;
  state: string;
  timestamp: number;
  beaconLike: boolean;
  beaconInterval: number | null;
}

export interface ListeningPortDetail {
  processName: string;
  pid: number;
  port: number;
  protocol: string;
  address: string;
  unexpected: boolean;
}

export interface DnsQueryDetail {
  domain: string;
  processName: string;
  timestamp: number;
  suspicious: boolean;
  reasons: string[];
}

// ── Crypto Miner Detection Input ─────────────────────────────────────

export interface CryptoMinerInput {
  processes: CryptoMinerProcessDetail[];
}

export interface CryptoMinerProcessDetail {
  processName: string;
  pid: number;
  path: string;
  cpuUsage: number;
  gpuUsage: number;
  poolConnections: string[];
  miningIndicators: string[];
  timestamp: number;
}

// ── Confidence helper ────────────────────────────────────────────────

export function confidenceToLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.9) return 'very_high';
  if (confidence >= 0.75) return 'high';
  if (confidence >= 0.5) return 'medium';
  if (confidence >= 0.3) return 'low';
  return 'very_low';
}

export function severityToScore(severity: ThreatSeverity): number {
  switch (severity) {
    case 'critical': return 100;
    case 'high': return 75;
    case 'medium': return 50;
    case 'low': return 25;
    case 'info': return 5;
    default: return 0;
  }
}

export function riskToScore(risk: ThreatRisk): number {
  switch (risk) {
    case 'severe': return 90;
    case 'high': return 70;
    case 'moderate': return 40;
    case 'low': return 20;
    case 'none': return 0;
    default: return 0;
  }
}

export function scoreToRisk(score: number): ThreatRisk {
  if (score >= 80) return 'severe';
  if (score >= 60) return 'high';
  if (score >= 35) return 'moderate';
  if (score >= 15) return 'low';
  return 'none';
}
