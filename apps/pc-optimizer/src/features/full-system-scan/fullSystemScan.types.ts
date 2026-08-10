/** Full System Scan types. */

export interface FullScanActivityEntry {
  ts: string;
  module: string;
  action: string;
  detail: string;
  path?: string;
}

export interface FullScanStatus {
  present: boolean;
  scanId: string;
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: number;
  currentModule: string | null;
  currentFolder: string | null;
  currentFile: string | null;
  itemsScanned: number;
  elapsedMs: number;
  startedAt: string;
  completedAt: string | null;
  activityLog: FullScanActivityEntry[];
  errors: string[];
}

export interface FullScanDriveInfo {
  drive: string;
  type: string;
}

export interface FullScanFileInfo {
  path: string;
  name: string;
  size: number;
  modified: number;
  extension: string;
}

export interface FullScanFSDirectoryResult {
  root: string;
  fileCount: number;
  totalBytes: number;
  files: FullScanFileInfo[];
}

export interface FullScanRegistryEntry {
  key: string;
  value: string;
  source: string;
}

export interface FullScanServiceEntry {
  name: string;
  displayName: string;
  state: string;
  startMode: string;
  pathName: string;
  processId: number;
}

export interface FullScanDriverEntry {
  deviceName: string;
  driverVersion: string;
  driverDate: string;
  providerName: string;
  isSigned: boolean;
  status: string;
}

export interface FullScanTaskEntry {
  taskName: string;
  taskPath: string;
  state: string;
  author: string;
}

export interface FullScanEventLogEntry {
  logName: string;
  level: string;
  id: number;
  message: string;
  timeCreated: string;
}

export interface FullScanDNSCacheEntry {
  entry: string;
  recordName: string;
  recordType: string;
  data: string;
}

export interface FullScanHostsEntry {
  ip: string;
  hostname: string;
}

export interface FullScanExtensionEntry {
  browser: string;
  extensionId: string;
  name: string;
  permissions: string[];
  path: string;
}

export interface FullScanResults {
  drives?: FullScanDriveInfo[];
  fileSystem?: Record<string, FullScanFSDirectoryResult>;
  registry?: { entries: FullScanRegistryEntry[]; count: number };
  services?: { services: FullScanServiceEntry[]; count: number };
  drivers?: { drivers: FullScanDriverEntry[]; count: number };
  scheduledTasks?: { tasks: FullScanTaskEntry[]; count: number };
  eventLogs?: { entries: FullScanEventLogEntry[]; count: number };
  dnsCache?: { entries: FullScanDNSCacheEntry[]; count: number };
  hostsFile?: { entries: FullScanHostsEntry[]; count: number };
  securityStatus?: {
    defender: Record<string, unknown>;
    firewall: Record<string, unknown>;
    smartScreen: Record<string, unknown>;
  };
  powershellPolicy?: { policies: Record<string, unknown>[]; count: number };
  wmiSubscriptions?: { subscriptions: Record<string, unknown>[]; count: number };
  browserExtensions?: { extensions: FullScanExtensionEntry[]; count: number };
}

export interface FullScanResult {
  present: boolean;
  scanId: string;
  status: string;
  results: FullScanResults;
  itemsScanned: number;
  elapsedMs: number;
  errors: string[];
  startedAt: string;
  completedAt: string | null;
}
