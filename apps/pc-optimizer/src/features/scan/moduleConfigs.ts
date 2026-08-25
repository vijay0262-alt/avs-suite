/**
 * moduleConfigs.ts — scan configurations for the unified Scan UI.
 *
 * Re-exports the existing optimize and security configurations from the
 * unified-scan framework and adds a new `AI Protection Center` config.
 */
import type { UnifiedScanModuleConfig } from '../unified-scan/unifiedScanTypes';
import {
  OPTIMIZE_SCAN_CONFIG,
  SECURITY_SCAN_CONFIG,
} from '../unified-scan/moduleConfigs';

export { OPTIMIZE_SCAN_CONFIG, SECURITY_SCAN_CONFIG };

export const PROTECTION_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'protection-center',
  moduleName: 'AI Protection Center',
  moduleIcon: 'ShieldCheckIcon',
  supportsCancel: true,
  supportsPause: false,
  phases: [
    {
      id: 'preparing',
      label: 'Preparing Protection Scan',
      description: 'Initializing protection engine and policies',
      startPercent: 0,
      endPercent: 10,
      activities: [
        'Initializing protection engine...',
        'Loading security policies...',
        'Preparing scan context...',
      ],
    },
    {
      id: 'firewall',
      label: 'Firewall Check',
      description: 'Verifying firewall state and rules',
      startPercent: 10,
      endPercent: 30,
      activities: [
        'Inspecting firewall status...',
        'Verifying default rules...',
        'Checking active network profiles...',
      ],
    },
    {
      id: 'antivirus',
      label: 'Antivirus Integration',
      description: 'Checking antivirus and real-time providers',
      startPercent: 30,
      endPercent: 50,
      activities: [
        'Checking antivirus registration...',
        'Verifying real-time providers...',
        'Inspecting signature status...',
      ],
    },
    {
      id: 'realtime',
      label: 'Real-Time Protection',
      description: 'Inspecting real-time monitors and behavior engine',
      startPercent: 50,
      endPercent: 70,
      activities: [
        'Inspecting real-time monitors...',
        'Checking behavior engine...',
        'Verifying event subscribers...',
      ],
    },
    {
      id: 'threat_intel',
      label: 'Threat Intelligence',
      description: 'Checking protection signatures, updates, and cloud status',
      startPercent: 70,
      endPercent: 85,
      activities: [
        'Loading threat intelligence...',
        'Checking signature updates...',
        'Verifying cloud connectivity...',
      ],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing the protection report',
      startPercent: 85,
      endPercent: 100,
      activities: [
        'Aggregating results...',
        'Preparing protection report...',
        'Generating AI summary...',
      ],
    },
  ],
  counters: [
    { id: 'confirmedThreats', label: 'Confirmed Threats', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'suspiciousItems', label: 'Suspicious Items', icon: 'EyeIcon', format: 'number' },
    { id: 'threatsSecured', label: 'Threats Secured', icon: 'ShieldCheckIcon', format: 'number' },
    { id: 'threatsRemaining', label: 'Threats Remaining', icon: 'ShieldExclamationIcon', format: 'number' },
    { id: 'aiConfidence', label: 'AI Confidence', icon: 'SparklesIcon', format: 'percent' },
  ],
};

export const SCAN_CONFIG_MAP: Record<
  'protection' | 'optimize' | 'security',
  UnifiedScanModuleConfig
> = {
  protection: PROTECTION_SCAN_CONFIG,
  optimize: OPTIMIZE_SCAN_CONFIG,
  security: SECURITY_SCAN_CONFIG,
};

export function getScanConfig(module: 'protection' | 'optimize' | 'security'): UnifiedScanModuleConfig {
  return SCAN_CONFIG_MAP[module];
}
