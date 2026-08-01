/**
 * Hardware Intelligence Center — Type Definitions
 *
 * All hardware component types, sensor data structures, provider interfaces,
 * snapshot models, and event payloads for the Hardware Intelligence subsystem.
 *
 * Version 1.1 — Foundation only: discovery, monitoring, architecture.
 * No AI, no optimization, no fan control, no overclocking.
 */

// ── Hardware Categories ──────────────────────────────────────────────

export type HardwareCategory =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'motherboard'
  | 'storage'
  | 'network'
  | 'battery'
  | 'power_supply'
  | 'cooling'
  | 'operating_system'
  | 'display'
  | 'usb'
  | 'pci'
  | 'audio';

// ── Provider Source Types ────────────────────────────────────────────

export type ProviderSource =
  | 'wmi'
  | 'performance_counter'
  | 'native_windows_api'
  | 'libre_hardware_monitor'
  | 'open_hardware_monitor'
  | 'vendor_sdk'
  | 'gpu_sdk'
  | 'mock'
  | 'unknown';

// ── Sensor Availability ──────────────────────────────────────────────

export type SensorAvailability =
  | 'available'
  | 'unsupported'
  | 'access_denied'
  | 'not_implemented'
  | 'error';

export interface SensorStatus {
  availability: SensorAvailability;
  message?: string;
}

// ── Sensor Reading ───────────────────────────────────────────────────

/**
 * Every sensor value is wrapped with provenance metadata.
 * This enables multi-provider attribution, confidence scoring,
 * staleness detection, and future AI explainability.
 */
export interface SensorReading<T> {
  value: T;
  unit: string;
  source: ProviderSource;
  timestamp: number;
  confidence: number; // 0.0 – 1.0
  supported: boolean;
  estimated: boolean;
  stale: boolean;
}

/** Convenience factory for creating sensor readings with defaults. */
export function mkSensor<T>(
  value: T,
  unit: string,
  source: ProviderSource = 'mock',
  confidence = 1.0,
): SensorReading<T> {
  return {
    value,
    unit,
    source,
    timestamp: Date.now(),
    confidence,
    supported: true,
    estimated: false,
    stale: false,
  };
}

/** Factory for an unsupported/missing sensor reading. */
export function unsupportedSensor<T>(
  unit: string,
  source: ProviderSource = 'unknown',
): SensorReading<T> {
  return {
    value: undefined as unknown as T,
    unit,
    source,
    timestamp: Date.now(),
    confidence: 0,
    supported: false,
    estimated: false,
    stale: false,
  };
}

// ── CPU ──────────────────────────────────────────────────────────────

export interface CPUInfo {
  vendor: string;
  model: string;
  architecture: string;
  generation?: string;
  socket?: string;
  logicalCores: number;
  physicalCores: number;
  threads: number;
  baseFrequencyMHz: number;
  boostFrequencyMHz?: number;
  currentFrequencyMHz?: SensorReading<number>;
  perCoreUtilization?: SensorReading<number>[];
  packageUtilization?: SensorReading<number>;
  cacheSizes?: {
    l1KB?: number;
    l2KB?: number;
    l3KB?: number;
  };
  instructionSets?: string[];
  virtualization?: {
    supported: boolean;
    enabled: boolean;
  };
}

export interface CPUSensors {
  temperatureC?: SensorReading<number>;
  powerDrawW?: SensorReading<number>;
  voltageV?: SensorReading<number>;
  thermalThrottling: SensorReading<boolean>;
}

export interface CPUComponent {
  category: 'cpu';
  info: CPUInfo;
  sensors: CPUSensors;
  sensorStatus: SensorStatus;
}

// ── GPU ──────────────────────────────────────────────────────────────

export interface GPUInfo {
  vendor: string;
  model: string;
  driver: string;
  driverDate?: string;
  vramMB: number;
  dedicatedMemoryMB?: SensorReading<number>;
  sharedMemoryMB?: SensorReading<number>;
  pcieGeneration?: string;
  pcieLaneWidth?: string;
}

export interface GPUSensors {
  gpuUtilization?: SensorReading<number>;
  memoryUtilization?: SensorReading<number>;
  temperatureC?: SensorReading<number>;
  fanSpeedRPM?: SensorReading<number>;
  coreClockMHz?: SensorReading<number>;
  memoryClockMHz?: SensorReading<number>;
  powerDrawW?: SensorReading<number>;
  encoderUsage?: SensorReading<number>;
  decoderUsage?: SensorReading<number>;
}

export interface GPUComponent {
  category: 'gpu';
  info: GPUInfo;
  sensors: GPUSensors;
  sensorStatus: SensorStatus;
}

// ── RAM ──────────────────────────────────────────────────────────────

export interface RAMModule {
  manufacturer?: string;
  partNumber?: string;
  sizeMB: number;
  speedMTs?: number;
  formFactor?: string;
  bank?: string;
  channel?: string;
}

export interface RAMInfo {
  installedMB: number;
  availableMB?: SensorReading<number>;
  usedMB?: SensorReading<number>;
  cachedMB?: SensorReading<number>;
  memoryPressure?: SensorReading<number>;
  speedMTs?: number;
  channels?: number;
  slotsUsed?: number;
  slotsTotal?: number;
  ecc: boolean;
  modules: RAMModule[];
}

export interface RAMComponent {
  category: 'ram';
  info: RAMInfo;
  sensorStatus: SensorStatus;
}

// ── Motherboard ──────────────────────────────────────────────────────

export interface MotherboardInfo {
  manufacturer: string;
  model: string;
  version?: string;
  serial?: string;
  biosVendor?: string;
  biosVersion?: string;
  biosDate?: string;
  chipset?: string;
}

export interface MotherboardComponent {
  category: 'motherboard';
  info: MotherboardInfo;
  sensorStatus: SensorStatus;
}

// ── Storage ──────────────────────────────────────────────────────────

export interface StorageInfo {
  type: 'ssd' | 'hdd' | 'nvme' | 'unknown';
  model: string;
  serial?: string;
  firmware?: string;
  capacityBytes: number;
  usedBytes?: SensorReading<number>;
  freeBytes?: SensorReading<number>;
  filesystem?: string;
  interface?: string;
  smartSupported: boolean;
}

export interface StorageSensors {
  temperatureC?: SensorReading<number>;
  healthPercent?: SensorReading<number>;
  lifetimeRemainingPercent?: SensorReading<number>;
  readSpeedMBps?: SensorReading<number>;
  writeSpeedMBps?: SensorReading<number>;
}

export interface StorageComponent {
  category: 'storage';
  info: StorageInfo;
  sensors: StorageSensors;
  sensorStatus: SensorStatus;
}

// ── Network ──────────────────────────────────────────────────────────

export interface NetworkInfo {
  adapter: string;
  mac: string;
  ipv4?: string[];
  ipv6?: string[];
  linkSpeedMbps?: number;
  type: 'wifi' | 'ethernet' | 'bluetooth' | 'virtual' | 'unknown';
  signalStrengthPercent?: SensorReading<number>;
}

export interface NetworkSensors {
  usagePercent?: SensorReading<number>;
  downloadMbps?: SensorReading<number>;
  uploadMbps?: SensorReading<number>;
}

export interface NetworkComponent {
  category: 'network';
  info: NetworkInfo;
  sensors: NetworkSensors;
  sensorStatus: SensorStatus;
}

// ── Battery ──────────────────────────────────────────────────────────

export interface BatteryInfo {
  designCapacityWH?: number;
  fullChargeCapacityWH?: number;
  chargeCycles?: number;
  currentChargePercent: SensorReading<number>;
  wearLevelPercent?: SensorReading<number>;
  chargingStatus: SensorReading<'charging' | 'discharging' | 'idle' | 'unknown'>;
  estimatedRuntimeMinutes?: SensorReading<number>;
}

export interface BatteryComponent {
  category: 'battery';
  info: BatteryInfo;
  sensorStatus: SensorStatus;
}

// ── Power Supply ─────────────────────────────────────────────────────

export interface PowerSupplyInfo {
  name?: string;
  manufacturer?: string;
  wattageW?: number;
  efficiencyRating?: string;
}

export interface PowerSupplyComponent {
  category: 'power_supply';
  info: PowerSupplyInfo;
  sensorStatus: SensorStatus;
}

// ── Cooling ──────────────────────────────────────────────────────────

export interface FanInfo {
  name: string;
  type: 'cpu_fan' | 'case_fan' | 'pump' | 'gpu_fan' | 'unknown';
  rpm?: SensorReading<number>;
}

export interface CoolingInfo {
  fans: FanInfo[];
}

export interface CoolingComponent {
  category: 'cooling';
  info: CoolingInfo;
  sensorStatus: SensorStatus;
}

// ── Operating System ─────────────────────────────────────────────────

export interface OSInfo {
  name: string;
  version: string;
  build?: string;
  architecture: string;
  installDate?: string;
  lastBootTime?: string;
  uptimeSeconds?: SensorReading<number>;
}

export interface OSComponent {
  category: 'operating_system';
  info: OSInfo;
  sensorStatus: SensorStatus;
}

// ── Display ──────────────────────────────────────────────────────────

export interface DisplayInfo {
  name: string;
  manufacturer?: string;
  resolutionWidth: number;
  resolutionHeight: number;
  refreshRateHz?: number;
  colorDepth?: number;
  connectionType?: string;
  scalingPercent?: number;
}

export interface DisplayComponent {
  category: 'display';
  info: DisplayInfo;
  sensorStatus: SensorStatus;
}

// ── USB Devices ──────────────────────────────────────────────────────

export interface USBDevice {
  name: string;
  vendorId?: string;
  productId?: string;
  manufacturer?: string;
  type?: string;
  connected: boolean;
}

export interface USBComponent {
  category: 'usb';
  devices: USBDevice[];
  sensorStatus: SensorStatus;
}

// ── PCI Devices ──────────────────────────────────────────────────────

export interface PCIDevice {
  name: string;
  vendorId?: string;
  deviceId?: string;
  class?: string;
  subclass?: string;
}

export interface PCIComponent {
  category: 'pci';
  devices: PCIDevice[];
  sensorStatus: SensorStatus;
}

// ── Audio ────────────────────────────────────────────────────────────

export interface AudioDevice {
  name: string;
  manufacturer?: string;
  type: 'output' | 'input' | 'loopback' | 'unknown';
  enabled: boolean;
  default: boolean;
}

export interface AudioComponent {
  category: 'audio';
  devices: AudioDevice[];
  sensorStatus: SensorStatus;
}

// ── Hardware Component Union ─────────────────────────────────────────

export type HardwareComponent =
  | CPUComponent
  | GPUComponent
  | RAMComponent
  | MotherboardComponent
  | StorageComponent
  | NetworkComponent
  | BatteryComponent
  | PowerSupplyComponent
  | CoolingComponent
  | OSComponent
  | DisplayComponent
  | USBComponent
  | PCIComponent
  | AudioComponent;

// ── Hardware Snapshot ────────────────────────────────────────────────

export interface HardwareSnapshot {
  id: string;
  timestamp: number;
  scanDurationMs: number;
  components: HardwareComponent[];
  providerHealth: Record<string, ProviderHealthStatus>;
  metadata: {
    source: ProviderSource;
    version: string;
    partial: boolean;
  };
}

// ── Provider Health ──────────────────────────────────────────────────

export type ProviderHealthState =
  | 'healthy'
  | 'degraded'
  | 'failed'
  | 'initializing';

export interface ProviderHealthStatus {
  state: ProviderHealthState;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

// ── Hardware Capabilities ────────────────────────────────────────────

export interface HardwareCapabilities {
  cpu: {
    temperature: boolean;
    powerDraw: boolean;
    voltage: boolean;
    perCoreUtilization: boolean;
    frequency: boolean;
    thermalThrottling: boolean;
  };
  gpu: {
    utilization: boolean;
    temperature: boolean;
    fanSpeed: boolean;
    powerDraw: boolean;
    encoderDecoder: boolean;
  };
  storage: {
    temperature: boolean;
    smart: boolean;
    lifetimeRemaining: boolean;
    readWriteSpeed: boolean;
  };
  network: {
    signalStrength: boolean;
    usage: boolean;
  };
  battery: {
    wearLevel: boolean;
    chargeCycles: boolean;
    estimatedRuntime: boolean;
  };
  cooling: {
    fanRPM: boolean;
  };
}

// ── Hardware Configuration ───────────────────────────────────────────

export interface HardwareConfiguration {
  pollIntervalMs: number;
  historyRetentionMs: number;
  maxSnapshots: number;
  cacheTtlMs: number;
  enabledCategories: HardwareCategory[];
  preferredProviderSource: ProviderSource;
  enablePolling: boolean;
}

export const DEFAULT_HARDWARE_CONFIG: HardwareConfiguration = {
  pollIntervalMs: 5000,
  historyRetentionMs: 24 * 60 * 60 * 1000,
  maxSnapshots: 1000,
  cacheTtlMs: 3000,
  enabledCategories: [
    'cpu',
    'gpu',
    'ram',
    'motherboard',
    'storage',
    'network',
    'battery',
    'power_supply',
    'cooling',
    'operating_system',
    'display',
    'usb',
    'pci',
    'audio',
  ],
  preferredProviderSource: 'wmi',
  enablePolling: true,
};

// ── Hardware Health ──────────────────────────────────────────────────

export type HealthLevel = 'good' | 'fair' | 'poor' | 'critical' | 'unknown';

export interface HardwareHealthStatus {
  overall: HealthLevel;
  score: number;
  components: Record<string, {
    level: HealthLevel;
    issues: string[];
  }>;
  lastUpdated: number;
}

// ── Hardware Events ──────────────────────────────────────────────────

export const HardwareEventType = {
  ScanStarted: 'hardware_scan_started',
  ScanCompleted: 'hardware_scan_completed',
  SnapshotUpdated: 'hardware_snapshot_updated',
  ProviderFailed: 'hardware_provider_failed',
  SensorMissing: 'hardware_sensor_missing',
} as const;

export type HardwareEventTypeName =
  (typeof HardwareEventType)[keyof typeof HardwareEventType];

export interface HardwareEvent {
  type: HardwareEventTypeName;
  timestamp: number;
  category?: HardwareCategory;
  providerSource?: ProviderSource;
  data?: HardwareEventData;
}

export interface HardwareEventData {
  snapshotId?: string;
  scanDurationMs?: number;
  componentCount?: number;
  error?: string;
  sensorName?: string;
  message?: string;
}

// ── Provider Interfaces ──────────────────────────────────────────────

export interface HardwareProvider {
  readonly id: string;
  readonly source: ProviderSource;
  readonly categories: readonly HardwareCategory[];

  initialize(): Promise<void>;
  dispose(): void;

  scan(): Promise<HardwareComponent[]>;
  poll(): Promise<Partial<HardwareComponent>[]>;

  isAvailable(): boolean;
  getHealth(): ProviderHealthStatus;
}

export interface SensorProvider {
  readonly id: string;
  readonly category: HardwareCategory;

  initialize(): Promise<void>;
  dispose(): void;

  read(): Promise<Record<string, number | boolean | undefined>>;
  isAvailable(): boolean;
}

// ── Hardware History ─────────────────────────────────────────────────

export interface HardwareHistoryEntry {
  snapshot: HardwareSnapshot;
  storedAt: number;
}

// ── Hardware Dashboard Provider ──────────────────────────────────────

export interface HardwareDashboardData {
  summary: {
    totalComponents: number;
    categoriesCovered: HardwareCategory[];
    overallHealth: HealthLevel;
    healthScore: number;
  };
  highlights: HardwareDashboardHighlight[];
  lastScanAt: number;
  nextScanInMs?: number;
}

export interface HardwareDashboardHighlight {
  category: HardwareCategory;
  label: string;
  value: string;
  level: HealthLevel;
}

// ── Hardware Diagnostics ─────────────────────────────────────────────

export interface HardwareDiagnosticsResult {
  timestamp: number;
  providersChecked: string[];
  categoriesChecked: HardwareCategory[];
  issues: HardwareDiagnosticIssue[];
  capabilities: HardwareCapabilities;
}

export interface HardwareDiagnosticIssue {
  category: HardwareCategory;
  providerId: string;
  severity: 'warning' | 'error';
  message: string;
}

// ── Dashboard UI Types ───────────────────────────────────────────────

export type TrendDirection = 'up' | 'down' | 'stable' | 'unknown';

export interface MetricDisplay {
  label: string;
  value: string;
  unit: string;
  trend: TrendDirection;
  normalRange?: string;
  timestamp: number;
  provider: ProviderSource;
  level: HealthLevel;
  supported: boolean;
}

export interface GraphSeries {
  name: string;
  color: string;
  points: { t: number; v: number }[];
}

export interface HardwareGraphData {
  title: string;
  unit: string;
  series: GraphSeries[];
  windowSeconds: number;
}

export type HardwareAlertSeverity = 'info' | 'warning' | 'critical';

export interface HardwareAlert {
  id: string;
  severity: HardwareAlertSeverity;
  category: HardwareCategory;
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface HardwareOverview {
  healthScore: number;
  healthLevel: HealthLevel;
  overallTempC: number | null;
  overallTempLevel: HealthLevel;
  powerStatus: 'ok' | 'warning' | 'critical' | 'unknown';
  coolingStatus: 'ok' | 'warning' | 'critical' | 'unknown';
  systemUptimeSeconds: number | null;
  lastScanAt: number;
  providerStatuses: { id: string; state: ProviderHealthState; source: ProviderSource }[];
  sensorAvailability: { total: number; available: number; unsupported: number };
}

export type ExportFormat = 'json' | 'csv' | 'pdf';
