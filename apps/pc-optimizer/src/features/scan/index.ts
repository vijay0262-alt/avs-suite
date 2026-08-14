/**
 * scan — public barrel for the unified scan UI feature.
 */
export { scanService } from './scan.service';
export type { ScanService } from './scan.service';

export { useScan } from './useScan';
export type { UseScanOptions, UseScanReturn } from './useScan';

export { buildScanReport } from './reportBuilder';

export {
  OPTIMIZE_SCAN_CONFIG,
  SECURITY_SCAN_CONFIG,
  PROTECTION_SCAN_CONFIG,
  getScanConfig,
} from './moduleConfigs';

export { ScanView, type ScanViewProps } from './ScanView';
export { ScanPanel, type ScanPanelProps } from './ScanPanel';
