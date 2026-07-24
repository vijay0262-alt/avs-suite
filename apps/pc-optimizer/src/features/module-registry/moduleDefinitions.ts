/**
 * Module Definitions — metadata for all existing optimizer modules.
 *
 * These definitions are registered with the Module Registry at app startup.
 * Future modules only need to add a definition here and implement
 * the OptimizerModule interface — no Dashboard or Health Engine changes.
 */

import type { ModuleMetadata } from './moduleRegistry.types';

export const JUNK_CLEANER_MODULE: ModuleMetadata = {
  moduleId: 'junk',
  displayName: 'Junk Cleaner',
  description: 'Scan and clean temporary files, browser cache, and recycle bin.',
  category: 'cleanup',
  icon: 'TrashIcon',
  version: '1.0.0',
  routePath: '/junk-cleaner',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: true },
  featurePermissions: {
    scan: 'junk.scan',
    clean: 'junk.clean',
    background: 'auto.junk_cleanup',
  },
  maxHealthPenalty: 30,
  supportedOS: [],
};

export const REGISTRY_CLEANER_MODULE: ModuleMetadata = {
  moduleId: 'registry',
  displayName: 'Registry Cleaner',
  description: 'Scan and fix invalid registry entries.',
  category: 'optimization',
  icon: 'WrenchScrewdriverIcon',
  version: '1.0.0',
  routePath: '/registry-cleaner',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: false },
  featurePermissions: {
    scan: 'registry.scan',
    clean: 'registry.fix',
  },
  maxHealthPenalty: 15,
  supportedOS: [],
};

export const STARTUP_MANAGER_MODULE: ModuleMetadata = {
  moduleId: 'startup',
  displayName: 'Startup Manager',
  description: 'Manage applications that launch at startup.',
  category: 'optimization',
  icon: 'RocketLaunchIcon',
  version: '1.0.0',
  routePath: '/startup-manager',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: false },
  featurePermissions: {
    scan: 'startup.view',
    clean: 'startup.disable',
  },
  maxHealthPenalty: 15,
  supportedOS: [],
};

export const PRIVACY_CLEANER_MODULE: ModuleMetadata = {
  moduleId: 'privacy',
  displayName: 'Privacy Cleaner',
  description: 'Clean browsing traces and activity history.',
  category: 'privacy',
  icon: 'ShieldCheckIcon',
  version: '1.0.0',
  routePath: '/privacy-cleaner',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: true },
  featurePermissions: {
    scan: 'privacy.scan',
    clean: 'privacy.clean',
    background: 'auto.privacy_protection',
  },
  maxHealthPenalty: 10,
  supportedOS: [],
};

export const DUPLICATE_FINDER_MODULE: ModuleMetadata = {
  moduleId: 'duplicate',
  displayName: 'Duplicate Finder',
  description: 'Find and remove duplicate files.',
  category: 'cleanup',
  icon: 'DocumentDuplicateIcon',
  version: '1.0.0',
  routePath: '/duplicate-finder',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: false },
  featurePermissions: {
    scan: 'duplicate.scan',
    clean: 'duplicate.delete',
  },
  maxHealthPenalty: 10,
  supportedOS: [],
};

export const DISK_ANALYZER_MODULE: ModuleMetadata = {
  moduleId: 'disk',
  displayName: 'Disk Analyzer',
  description: 'Analyze disk space usage and find large files.',
  category: 'system',
  icon: 'CircleStackIcon',
  version: '1.0.0',
  routePath: '/disk-analyzer',
  capabilities: { canScan: true, canClean: false, canOptimize: false, canRunInBackground: false },
  featurePermissions: {
    scan: 'disk.analyzer',
  },
  maxHealthPenalty: 10,
  supportedOS: [],
};

export const PERFORMANCE_MODULE: ModuleMetadata = {
  moduleId: 'performance',
  displayName: 'Performance',
  description: 'Monitor and optimize CPU, memory, and system performance.',
  category: 'optimization',
  icon: 'CpuChipIcon',
  version: '1.0.0',
  routePath: '/performance',
  capabilities: { canScan: true, canClean: false, canOptimize: true, canRunInBackground: true },
  featurePermissions: {
    scan: 'performance.optimize',
    optimize: 'performance.optimize',
    background: 'background.monitoring',
  },
  maxHealthPenalty: 15,
  supportedOS: [],
};

export const SYSTEM_INFORMATION_MODULE: ModuleMetadata = {
  moduleId: 'system',
  displayName: 'System Information',
  description: 'View hardware, OS, and system health information.',
  category: 'system',
  icon: 'ComputerDesktopIcon',
  version: '1.0.0',
  routePath: '/system-information',
  capabilities: { canScan: true, canClean: false, canOptimize: false, canRunInBackground: false },
  featurePermissions: {
    scan: 'system.info',
  },
  maxHealthPenalty: 10,
  supportedOS: [],
};

export const SECURITY_MODULE: ModuleMetadata = {
  moduleId: 'security',
  displayName: 'Security Check',
  description: 'Check antivirus, firewall, and Windows Update status.',
  category: 'security',
  icon: 'ShieldExclamationIcon',
  version: '1.0.0',
  routePath: '/security',
  capabilities: { canScan: true, canClean: false, canOptimize: false, canRunInBackground: false },
  featurePermissions: {
    scan: 'system.info',
  },
  maxHealthPenalty: 20,
  supportedOS: [],
};

// ── Future Module Metadata ──────────────────────────────────────────

export const DRIVER_UPDATER_MODULE: ModuleMetadata = {
  moduleId: 'driver-updater',
  displayName: 'Driver Updater',
  description: 'Scan and update outdated system drivers.',
  category: 'future',
  icon: 'ArrowPathIcon',
  version: '0.0.0',
  routePath: '/driver-updater',
  capabilities: { canScan: true, canClean: false, canOptimize: true, canRunInBackground: false },
  featurePermissions: {
    scan: 'driver.update',
    optimize: 'driver.update',
  },
  maxHealthPenalty: 10,
  supportedOS: [],
};

export const ANTIVIRUS_MODULE: ModuleMetadata = {
  moduleId: 'antivirus',
  displayName: 'Antivirus',
  description: 'Scan for and remove malware and viruses.',
  category: 'security',
  icon: 'ShieldExclamationIcon',
  version: '0.0.0',
  routePath: '/antivirus',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: true },
  featurePermissions: {
    scan: 'antivirus.scan',
    clean: 'antivirus.scan',
    background: 'real_time.protection',
  },
  maxHealthPenalty: 15,
  supportedOS: [],
};

export const VPN_MODULE: ModuleMetadata = {
  moduleId: 'vpn',
  displayName: 'VPN',
  description: 'Secure your internet connection with a virtual private network.',
  category: 'security',
  icon: 'GlobeAltIcon',
  version: '0.0.0',
  routePath: '/vpn',
  capabilities: { canScan: false, canClean: false, canOptimize: false, canRunInBackground: true },
  featurePermissions: {},
  maxHealthPenalty: 5,
  supportedOS: [],
};

export const BACKUP_MODULE: ModuleMetadata = {
  moduleId: 'backup',
  displayName: 'Backup',
  description: 'Back up and restore important files.',
  category: 'system',
  icon: 'ArchiveBoxIcon',
  version: '0.0.0',
  routePath: '/backup',
  capabilities: { canScan: false, canClean: false, canOptimize: false, canRunInBackground: true },
  featurePermissions: {},
  maxHealthPenalty: 5,
  supportedOS: [],
};

export const FILE_RECOVERY_MODULE: ModuleMetadata = {
  moduleId: 'file-recovery',
  displayName: 'File Recovery',
  description: 'Recover deleted or lost files.',
  category: 'system',
  icon: 'ArrowUturnLeftIcon',
  version: '0.0.0',
  routePath: '/file-recovery',
  capabilities: { canScan: true, canClean: false, canOptimize: false, canRunInBackground: false },
  featurePermissions: {},
  maxHealthPenalty: 5,
  supportedOS: [],
};

export const BROWSER_CLEANER_MODULE: ModuleMetadata = {
  moduleId: 'browser-cleaner',
  displayName: 'Browser Cleaner',
  description: 'Clean browser cache, cookies, and browsing history.',
  category: 'privacy',
  icon: 'GlobeAltIcon',
  version: '0.0.0',
  routePath: '/browser-cleaner',
  capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: true },
  featurePermissions: {
    scan: 'browser.protection',
    clean: 'browser.protection',
    background: 'auto.privacy_protection',
  },
  maxHealthPenalty: 8,
  supportedOS: [],
};

export const DISK_DEFRAGMENTER_MODULE: ModuleMetadata = {
  moduleId: 'disk-defragmenter',
  displayName: 'Disk Defragmenter',
  description: 'Defragment and optimize disk drives for faster access.',
  category: 'optimization',
  icon: 'CircleStackIcon',
  version: '0.0.0',
  routePath: '/disk-defragmenter',
  capabilities: { canScan: true, canClean: false, canOptimize: true, canRunInBackground: false },
  featurePermissions: {
    scan: 'disk.analyzer',
    optimize: 'performance.optimize',
  },
  maxHealthPenalty: 8,
  supportedOS: ['win32'],
};

export const NETWORK_OPTIMIZER_MODULE: ModuleMetadata = {
  moduleId: 'network-optimizer',
  displayName: 'Network Optimizer',
  description: 'Optimize network settings for faster internet speeds.',
  category: 'optimization',
  icon: 'WifiIcon',
  version: '0.0.0',
  routePath: '/network-optimizer',
  capabilities: { canScan: true, canClean: false, canOptimize: true, canRunInBackground: false },
  featurePermissions: {
    scan: 'performance.optimize',
    optimize: 'performance.optimize',
  },
  maxHealthPenalty: 5,
  supportedOS: [],
};

export const MEMORY_OPTIMIZER_MODULE: ModuleMetadata = {
  moduleId: 'memory-optimizer',
  displayName: 'Memory Optimizer',
  description: 'Free up RAM and optimize memory usage.',
  category: 'optimization',
  icon: 'CpuChipIcon',
  version: '0.0.0',
  routePath: '/memory-optimizer',
  capabilities: { canScan: true, canClean: false, canOptimize: true, canRunInBackground: true },
  featurePermissions: {
    scan: 'performance.optimize',
    optimize: 'performance.optimize',
    background: 'background.monitoring',
  },
  maxHealthPenalty: 7,
  supportedOS: [],
};

export const BATTERY_OPTIMIZER_MODULE: ModuleMetadata = {
  moduleId: 'battery-optimizer',
  displayName: 'Battery Optimizer',
  description: 'Optimize battery life and power consumption.',
  category: 'optimization',
  icon: 'Battery50Icon',
  version: '0.0.0',
  routePath: '/battery-optimizer',
  capabilities: { canScan: true, canClean: false, canOptimize: true, canRunInBackground: true },
  featurePermissions: {
    scan: 'battery.optimization',
    optimize: 'battery.optimization',
    background: 'background.monitoring',
  },
  maxHealthPenalty: 5,
  supportedOS: [],
};

export const ALL_MODULE_DEFINITIONS: ModuleMetadata[] = [
  JUNK_CLEANER_MODULE,
  REGISTRY_CLEANER_MODULE,
  STARTUP_MANAGER_MODULE,
  PRIVACY_CLEANER_MODULE,
  DUPLICATE_FINDER_MODULE,
  DISK_ANALYZER_MODULE,
  PERFORMANCE_MODULE,
  SYSTEM_INFORMATION_MODULE,
  SECURITY_MODULE,
  DRIVER_UPDATER_MODULE,
  ANTIVIRUS_MODULE,
  VPN_MODULE,
  BACKUP_MODULE,
  FILE_RECOVERY_MODULE,
  BROWSER_CLEANER_MODULE,
  DISK_DEFRAGMENTER_MODULE,
  NETWORK_OPTIMIZER_MODULE,
  MEMORY_OPTIMIZER_MODULE,
  BATTERY_OPTIMIZER_MODULE,
];
