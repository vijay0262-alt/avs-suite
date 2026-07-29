/**
 * Profile Configuration — default configuration and factory.
 *
 * No hardcoded values in profile logic. All rules and thresholds
 * are configurable here for future AI tuning.
 */
import type { ProfileConfiguration, ProfileDefinition } from './types';

export const DEFAULT_PROFILE_DEFINITIONS: ProfileDefinition[] = [
  {
    type: 'general_purpose',
    label: 'General Purpose',
    description: 'A general-purpose computer used for everyday tasks',
    minHardwareTier: 'low_end',
    typicalWorkloads: ['general_use', 'browsing'],
    typicalSoftwareCategories: ['browser', 'office'],
  },
  {
    type: 'office_workstation',
    label: 'Office Workstation',
    description: 'A workstation optimized for office productivity',
    minHardwareTier: 'low_end',
    typicalWorkloads: ['office', 'browsing'],
    typicalSoftwareCategories: ['office', 'browser', 'security'],
  },
  {
    type: 'developer_workstation',
    label: 'Developer Workstation',
    description: 'A workstation used for software development',
    minHardwareTier: 'mid_range',
    typicalWorkloads: ['development', 'general_use'],
    typicalSoftwareCategories: ['developer', 'browser', 'virtualization'],
  },
  {
    type: 'gaming_pc',
    label: 'Gaming PC',
    description: 'A high-performance PC used for gaming',
    minHardwareTier: 'high_end',
    typicalWorkloads: ['gaming', 'streaming'],
    typicalSoftwareCategories: ['games', 'browser'],
  },
  {
    type: 'creative_workstation',
    label: 'Creative Workstation',
    description: 'A workstation used for creative work (video, photo, design)',
    minHardwareTier: 'high_end',
    typicalWorkloads: ['media_editing', 'streaming'],
    typicalSoftwareCategories: ['creative', 'browser'],
  },
  {
    type: 'student_laptop',
    label: 'Student Laptop',
    description: 'A laptop used by a student',
    minHardwareTier: 'low_end',
    typicalWorkloads: ['general_use', 'browsing', 'office'],
    typicalSoftwareCategories: ['browser', 'office'],
  },
  {
    type: 'business_laptop',
    label: 'Business Laptop',
    description: 'A laptop used for business purposes',
    minHardwareTier: 'mid_range',
    typicalWorkloads: ['office', 'browsing'],
    typicalSoftwareCategories: ['office', 'browser', 'security'],
  },
  {
    type: 'trading_workstation',
    label: 'Trading Workstation',
    description: 'A workstation used for financial trading',
    minHardwareTier: 'high_end',
    typicalWorkloads: ['trading', 'browsing'],
    typicalSoftwareCategories: ['office', 'browser', 'security'],
  },
  {
    type: 'home_pc',
    label: 'Home PC',
    description: 'A personal computer used at home',
    minHardwareTier: 'low_end',
    typicalWorkloads: ['browsing', 'general_use', 'streaming'],
    typicalSoftwareCategories: ['browser', 'office'],
  },
  {
    type: 'media_center',
    label: 'Media Center',
    description: 'A PC used as a media center for entertainment',
    minHardwareTier: 'mid_range',
    typicalWorkloads: ['streaming', 'general_use'],
    typicalSoftwareCategories: ['browser', 'games'],
  },
  {
    type: 'power_user',
    label: 'Power User',
    description: 'A PC used by a power user with diverse workloads',
    minHardwareTier: 'high_end',
    typicalWorkloads: ['mixed_usage', 'development', 'gaming'],
    typicalSoftwareCategories: ['developer', 'games', 'creative', 'virtualization'],
  },
  {
    type: 'server',
    label: 'Server',
    description: 'A server machine',
    minHardwareTier: 'enterprise',
    typicalWorkloads: ['general_use'],
    typicalSoftwareCategories: ['security', 'virtualization'],
  },
  {
    type: 'virtual_machine',
    label: 'Virtual Machine',
    description: 'A virtual machine',
    minHardwareTier: 'low_end',
    typicalWorkloads: ['general_use', 'development'],
    typicalSoftwareCategories: ['developer', 'browser'],
  },
];

export const DEFAULT_PROFILE_CONFIG: ProfileConfiguration = {
  profileVersion: '1.0.0',
  classificationRules: {
    minConfidence: 0.2,
    primaryProfileThreshold: 0.4,
    secondaryProfileThreshold: 0.15,
    maxSecondaryProfiles: 5,
    hybridProfileEnabled: true,
  },
  scoringRules: {
    hardwareWeight: 0.25,
    softwareWeight: 0.30,
    usageWeight: 0.25,
    workloadWeight: 0.20,
    historicalStabilityWeight: 0.1,
    consistencyWeight: 0.1,
    freshnessWeight: 0.05,
  },
  confidenceRules: {
    minEvidenceCount: 3,
    highConfidenceThreshold: 0.75,
    mediumConfidenceThreshold: 0.55,
    lowConfidenceThreshold: 0.35,
    insufficientDataThreshold: 0.20,
  },
  hardwareRules: {
    lowRamThresholdMB: 4096,
    mediumRamThresholdMB: 8192,
    highRamThresholdMB: 16384,
    lowCpuCores: 2,
    mediumCpuCores: 4,
    highCpuCores: 8,
    lowStorageThresholdMB: 128000,
    mediumStorageThresholdMB: 256000,
    highStorageThresholdMB: 512000,
    laptopBatteryIndication: true,
  },
  softwareRules: {
    devToolIndicators: ['visual studio', 'vscode', 'intellij', 'eclipse', 'git', 'docker', 'node', 'python', 'java sdk', 'android studio', 'vim', 'sublime'],
    creativeSoftwareIndicators: ['photoshop', 'illustrator', 'premiere', 'after effects', 'davinci', 'blender', 'autocad', 'final cut', 'gimp', 'inkscape', 'lightroom'],
    gameIndicators: ['steam', 'epic games', 'battle.net', 'origin', 'gog', 'xbox', 'playstation', 'nvidia geforce', 'discord'],
    officeSuiteIndicators: ['microsoft office', 'libreoffice', 'openoffice', 'wps office', 'google docs', 'outlook', 'excel', 'word', 'powerpoint'],
    virtualizationIndicators: ['virtualbox', 'vmware', 'hyper-v', 'docker', 'kubernetes', 'wsl', 'parallels', 'qemu'],
    securitySoftwareIndicators: ['antivirus', 'firewall', 'malwarebytes', 'kaspersky', 'norton', 'mcafee', 'bitdefender', 'windows defender', 'avast', 'avg'],
    serverIndicators: ['iis', 'apache', 'nginx', 'sql server', 'mysql', 'postgresql', 'active directory', 'exchange'],
    vmIndicators: ['virtualbox', 'vmware', 'hyper-v', 'qemu', 'parallels', 'virtual machine'],
  },
  usageRules: {
    lowOptimizationFrequency: 2,
    highOptimizationFrequency: 10,
    lowBrowsingCacheMB: 100,
    highBrowsingCacheMB: 500,
    heavyStartupThreshold: 15,
    moderateStartupThreshold: 8,
    fastDiskGrowthMBPerDay: 500,
    moderateDiskGrowthMBPerDay: 200,
  },
  profileDefinitions: [...DEFAULT_PROFILE_DEFINITIONS],
  enableHistory: true,
  maxHistoryEntries: 200,
  minConfidenceThreshold: 0.15,
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createProfileConfig(
  overrides?: DeepPartial<ProfileConfiguration>,
): ProfileConfiguration {
  if (!overrides) return { ...DEFAULT_PROFILE_CONFIG };
  return {
    ...DEFAULT_PROFILE_CONFIG,
    ...overrides,
    classificationRules: {
      ...DEFAULT_PROFILE_CONFIG.classificationRules,
      ...overrides.classificationRules,
    },
    scoringRules: {
      ...DEFAULT_PROFILE_CONFIG.scoringRules,
      ...overrides.scoringRules,
    },
    confidenceRules: {
      ...DEFAULT_PROFILE_CONFIG.confidenceRules,
      ...overrides.confidenceRules,
    },
    hardwareRules: {
      ...DEFAULT_PROFILE_CONFIG.hardwareRules,
      ...overrides.hardwareRules,
    },
    softwareRules: {
      ...DEFAULT_PROFILE_CONFIG.softwareRules,
      ...(overrides.softwareRules as Partial<typeof DEFAULT_PROFILE_CONFIG.softwareRules> | undefined),
    },
    usageRules: {
      ...DEFAULT_PROFILE_CONFIG.usageRules,
      ...overrides.usageRules,
    },
    profileDefinitions: overrides.profileDefinitions
      ? (overrides.profileDefinitions as ProfileDefinition[])
      : DEFAULT_PROFILE_CONFIG.profileDefinitions,
  };
}
