/**
 * Module Scan Configurations — predefined UnifiedScanModuleConfig for each
 * module in AVS Shield.  Future modules can import these or create their own.
 *
 * Each config defines:
 *   - Phases with activity messages
 *   - Counters with icons and formats
 *   - Pause/cancel support flags
 */
import type { UnifiedScanModuleConfig } from './unifiedScanTypes';

// ── AI Smart Optimize ───────────────────────────────────────────

export const OPTIMIZE_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'optimize',
  moduleName: 'AI Smart Optimize',
  moduleIcon: 'SparklesIcon',
  supportsPause: false,
  supportsCancel: true,
  // V1.0: Phases match the direct cleanup backend flow:
  // discovering (0-30%) → cleaning (30-70%) → finalizing (70-100%)
  phases: [
    {
      id: 'preparing',
      label: 'Preparing',
      description: 'Starting cleanup scan',
      startPercent: 0,
      endPercent: 5,
      activities: [
        'Starting cleanup scan...',
      ],
    },
    {
      id: 'discovering',
      label: 'Scanning',
      description: 'Scanning Temp, Windows Temp, and Prefetch folders',
      startPercent: 5,
      endPercent: 30,
      activities: [
        'Scanning User Temp...',
        'Scanning Windows Temp...',
        'Scanning Prefetch...',
        'Counting files and folders...',
      ],
    },
    {
      id: 'cleaning',
      label: 'Cleaning',
      description: 'Deleting junk files',
      startPercent: 30,
      endPercent: 70,
      activities: [
        'Deleting temporary files...',
        'Removing junk files...',
        'Cleaning up cache...',
      ],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Removing empty folders and finalizing',
      startPercent: 70,
      endPercent: 100,
      activities: [
        'Removing empty folders...',
        'Finalizing cleanup...',
      ],
    },
  ],
  // V1.0: Map direct cleanup backend phases to frontend phases.
  backendPhaseMap: {
    initializing: 'preparing',
    discovery: 'discovering',
    discovering: 'discovering',
    evaluating: 'cleaning',
    cleaning: 'cleaning',
    aggregating: 'finalizing',
    prioritizing: 'finalizing',
    planning: 'finalizing',
    finalizing: 'finalizing',
    complete: 'finalizing',
  },
  // V1.0: Map frontend counter IDs to backend ScanProgress fields.
  backendCounterMap: {
    filesFound: 'assets_discovered',
    filesCleaned: 'actions_available',
    spaceRecovered: 'bytes_recovered',
  },
  counters: [
    { id: 'filesFound', label: 'Files Found', icon: 'TrashIcon', format: 'number' },
    { id: 'filesCleaned', label: 'Files Cleaned', icon: 'CheckCircleIcon', format: 'number' },
    { id: 'spaceRecovered', label: 'Space Recovered', icon: 'CircleStackIcon', format: 'bytes' },
  ],
};

// ── AI Smart Security ───────────────────────────────────────────

export const SECURITY_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'security',
  moduleName: 'AI Smart Security',
  moduleIcon: 'ShieldCheckIcon',
  supportsPause: false,
  supportsCancel: true,
  // V1.0: Simple user-facing phases. The backend emits canonical phases
  // (initializing, discovery, evaluating, aggregating, prioritizing,
  // planning) which are mapped to these simple labels via backendPhaseMap.
  phases: [
    {
      id: 'preparing',
      label: 'Preparing',
      description: 'Initializing security scan engine',
      startPercent: 0,
      endPercent: 5,
      activities: ['Loading security engine...', 'Initializing detection providers...'],
    },
    {
      id: 'scanning',
      label: 'Scanning',
      description: 'Scanning processes, files, registry, and browser',
      startPercent: 5,
      endPercent: 50,
      activities: [
        'Scanning running processes...',
        'Inspecting system directories...',
        'Checking user profile...',
        'Scanning registry...',
        'Inspecting scheduled tasks...',
        'Checking Windows services...',
        'Scanning browser extensions...',
      ],
    },
    {
      id: 'analyzing',
      label: 'Analyzing',
      description: 'Evaluating detection rules and behavior',
      startPercent: 50,
      endPercent: 75,
      activities: [
        'Evaluating detection rules...',
        'Analyzing behavior patterns...',
        'Checking file reputation...',
        'Correlating threat intelligence...',
      ],
    },
    {
      id: 'securing',
      label: 'Securing',
      description: 'Quarantining confirmed threats',
      startPercent: 75,
      endPercent: 90,
      activities: [
        'Preparing quarantine plan...',
        'Securing confirmed threats...',
        'Creating rollback strategy...',
      ],
    },
    {
      id: 'verifying',
      label: 'Verifying',
      description: 'Verifying quarantine and generating results',
      startPercent: 90,
      endPercent: 100,
      activities: [
        'Verifying quarantine results...',
        'Generating security summary...',
      ],
    },
  ],
  // V1.0: Map backend canonical phases to simple user-facing phases.
  backendPhaseMap: {
    initializing: 'preparing',
    discovery: 'scanning',
    evaluating: 'analyzing',
    aggregating: 'analyzing',
    prioritizing: 'securing',
    planning: 'verifying',
  },
  // V1.0: Only 4 meaningful security counters — no internal diagnostics.
  backendCounterMap: {
    confirmedThreats: 'confirmed_threats',
    suspiciousItems: 'suspicious_items',
    threatsSecured: 'threats_secured',
    threatsRemaining: 'threats_remaining',
  },
  // V1.0 Architecture separation: only run security-category rules.
  // This prevents the security scan from scanning for junk/temp files
  // (which is the Dashboard's job) and ensures it only runs
  // DefenderConfirmedThreatRule and other security rules.
  ruleCategories: ['security', 'suspicious'],
  counters: [
    { id: 'confirmedThreats', label: 'Confirmed Threats', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'suspiciousItems', label: 'Suspicious Items', icon: 'EyeIcon', format: 'number' },
    { id: 'threatsSecured', label: 'Threats Secured', icon: 'ShieldCheckIcon', format: 'number' },
    { id: 'threatsRemaining', label: 'Threats Remaining', icon: 'ExclamationTriangleIcon', format: 'number' },
  ],
};

// ── Junk Cleaner ────────────────────────────────────────────────

export const JUNK_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'junk',
  moduleName: 'Junk Cleaner',
  moduleIcon: 'TrashIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'temp_files',
      label: 'Temporary Files',
      description: 'Scanning temporary file directories',
      startPercent: 0,
      endPercent: 25,
      activities: ['Scanning Windows Temp...', 'Checking user Temp...', 'Inspecting application temp files...'],
    },
    {
      id: 'recycle_bin',
      label: 'Recycle Bin',
      description: 'Analyzing Recycle Bin contents',
      startPercent: 25,
      endPercent: 40,
      activities: ['Checking Recycle Bin size...', 'Enumerating deleted files...'],
    },
    {
      id: 'browser_cache',
      label: 'Browser Cache',
      description: 'Scanning browser cache for all browsers',
      startPercent: 40,
      endPercent: 65,
      activities: ['Scanning Chrome cache...', 'Checking Edge cache...', 'Inspecting Firefox cache...'],
    },
    {
      id: 'windows_update',
      label: 'Windows Update Cache',
      description: 'Scanning Windows update leftover files',
      startPercent: 65,
      endPercent: 80,
      activities: ['Checking update cache...', 'Scanning download cache...'],
    },
    {
      id: 'logs',
      label: 'Log Files',
      description: 'Scanning system and application logs',
      startPercent: 80,
      endPercent: 95,
      activities: ['Scanning system logs...', 'Checking application logs...', 'Inspecting event logs...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Calculating total junk and recommendations',
      startPercent: 95,
      endPercent: 100,
      activities: ['Calculating total junk size...', 'Preparing recommendations...'],
    },
  ],
  counters: [
    { id: 'junkFiles', label: 'Cleanable Files', icon: 'TrashIcon', format: 'number' },
    { id: 'junkSize', label: 'Total Junk Size', icon: 'CircleStackIcon', format: 'bytes' },
    { id: 'browserCache', label: 'Browser Cache', icon: 'GlobeAltIcon', format: 'bytes' },
    { id: 'recycleBin', label: 'Recycle Bin', icon: 'TrashIcon', format: 'bytes' },
    { id: 'tempFiles', label: 'Temp Files', icon: 'DocumentTextIcon', format: 'bytes' },
    { id: 'updateCache', label: 'Update Cache', icon: 'CircleStackIcon', format: 'bytes' },
  ],
};

// ── Registry Cleaner ────────────────────────────────────────────

export const REGISTRY_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'registry',
  moduleName: 'Registry Cleaner',
  moduleIcon: 'ServerStackIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'active_x',
      label: 'ActiveX & COM',
      description: 'Scanning ActiveX and COM registry entries',
      startPercent: 0,
      endPercent: 15,
      activities: ['Scanning ActiveX entries...', 'Checking COM registrations...'],
    },
    {
      id: 'file_types',
      label: 'File Types',
      description: 'Scanning file type associations',
      startPercent: 15,
      endPercent: 30,
      activities: ['Checking file associations...', 'Scanning extension entries...'],
    },
    {
      id: 'application_paths',
      label: 'Application Paths',
      description: 'Scanning application path references',
      startPercent: 30,
      endPercent: 50,
      activities: ['Checking application paths...', 'Scanning uninstall entries...'],
    },
    {
      id: 'shared_dlls',
      label: 'Shared DLLs',
      description: 'Scanning shared DLL references',
      startPercent: 50,
      endPercent: 70,
      activities: ['Checking shared DLL entries...', 'Scanning font registrations...'],
    },
    {
      id: 'startup',
      label: 'Startup Entries',
      description: 'Scanning startup registry entries',
      startPercent: 70,
      endPercent: 85,
      activities: ['Checking Run keys...', 'Scanning RunOnce entries...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Validating and categorizing issues',
      startPercent: 85,
      endPercent: 100,
      activities: ['Validating entries...', 'Categorizing issues...', 'Preparing recommendations...'],
    },
  ],
  counters: [
    { id: 'registryEntries', label: 'Entries Scanned', icon: 'ServerStackIcon', format: 'number' },
    { id: 'issuesFound', label: 'Issues Found', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'missingKeys', label: 'Missing Keys', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'invalidPaths', label: 'Invalid Paths', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'brokenLinks', label: 'Broken Links', icon: 'LinkIcon', format: 'number' },
    { id: 'safeToFix', label: 'Safe to Fix', icon: 'ShieldCheckIcon', format: 'number' },
  ],
};

// ── Privacy Cleaner ─────────────────────────────────────────────

export const PRIVACY_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'privacy',
  moduleName: 'Privacy Cleaner',
  moduleIcon: 'EyeSlashIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'browser',
      label: 'Browser Traces',
      description: 'Scanning browser traces across all browsers',
      startPercent: 0,
      endPercent: 30,
      activities: ['Scanning Chrome traces...', 'Checking Edge traces...', 'Inspecting Firefox traces...'],
    },
    {
      id: 'cookies',
      label: 'Cookies & Cache',
      description: 'Scanning cookies and cache data',
      startPercent: 30,
      endPercent: 55,
      activities: ['Scanning cookies...', 'Checking cache data...', 'Inspecting tracking cookies...'],
    },
    {
      id: 'history',
      label: 'Browsing History',
      description: 'Analyzing browsing history',
      startPercent: 55,
      endPercent: 75,
      activities: ['Analyzing browsing history...', 'Checking download history...'],
    },
    {
      id: 'temp',
      label: 'Temporary Files',
      description: 'Scanning temporary privacy files',
      startPercent: 75,
      endPercent: 90,
      activities: ['Scanning temp files...', 'Checking recent activity...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing privacy recommendations',
      startPercent: 90,
      endPercent: 100,
      activities: ['Calculating privacy risk...', 'Preparing recommendations...'],
    },
  ],
  counters: [
    { id: 'privacyItems', label: 'Privacy Items', icon: 'EyeSlashIcon', format: 'number' },
    { id: 'cookies', label: 'Cookies', icon: 'GlobeAltIcon', format: 'number' },
    { id: 'historyEntries', label: 'History Entries', icon: 'GlobeAltIcon', format: 'number' },
    { id: 'cacheFiles', label: 'Cache Files', icon: 'CircleStackIcon', format: 'number' },
    { id: 'tempFiles', label: 'Temp Files', icon: 'DocumentTextIcon', format: 'number' },
    { id: 'recentFiles', label: 'Recent Files', icon: 'DocumentTextIcon', format: 'number' },
    { id: 'trackingCookies', label: 'Tracking Cookies', icon: 'EyeSlashIcon', format: 'number' },
    { id: 'privacyRisk', label: 'Privacy Risk', icon: 'ShieldExclamationIcon', format: 'percent' },
  ],
};

// ── Duplicate Finder ────────────────────────────────────────────

export const DUPLICATE_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'duplicate',
  moduleName: 'Duplicate Finder',
  moduleIcon: 'DocumentDuplicateIcon',
  supportsPause: true,
  supportsCancel: true,
  phases: [
    {
      id: 'scanning',
      label: 'Scanning Directories',
      description: 'Scanning directories for duplicate files',
      startPercent: 0,
      endPercent: 40,
      activities: ['Scanning user folders...', 'Checking Downloads...', 'Inspecting Documents...', 'Scanning Desktop...'],
    },
    {
      id: 'hashing',
      label: 'Calculating Hashes',
      description: 'Calculating file hashes for comparison',
      startPercent: 40,
      endPercent: 70,
      activities: ['Calculating file hashes...', 'Comparing file sizes...', 'Matching hash values...'],
    },
    {
      id: 'analysis',
      label: 'Duplicate Analysis',
      description: 'Identifying and grouping duplicates',
      startPercent: 70,
      endPercent: 90,
      activities: ['Grouping duplicates...', 'Calculating wasted space...', 'Identifying safe deletions...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing duplicate report',
      startPercent: 90,
      endPercent: 100,
      activities: ['Preparing report...', 'Calculating recovery potential...'],
    },
  ],
  counters: [
    { id: 'duplicateFiles', label: 'Duplicate Files', icon: 'DocumentDuplicateIcon', format: 'number' },
    { id: 'duplicateGroups', label: 'Duplicate Groups', icon: 'DocumentDuplicateIcon', format: 'number' },
    { id: 'wastedSpace', label: 'Wasted Space', icon: 'CircleStackIcon', format: 'bytes' },
    { id: 'recoverableSpace', label: 'Recoverable Space', icon: 'CircleStackIcon', format: 'bytes' },
  ],
};

// ── Hardware Intelligence ───────────────────────────────────────

export const HARDWARE_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'hardware',
  moduleName: 'Hardware Intelligence',
  moduleIcon: 'CpuChipIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'cpu',
      label: 'CPU Analysis',
      description: 'Analyzing CPU sensors and health',
      startPercent: 0,
      endPercent: 25,
      activities: ['Reading CPU sensors...', 'Analyzing CPU health...', 'Checking thermal performance...'],
    },
    {
      id: 'memory',
      label: 'Memory Analysis',
      description: 'Analyzing memory health and usage',
      startPercent: 25,
      endPercent: 45,
      activities: ['Checking memory modules...', 'Analyzing memory health...', 'Reading SPD data...'],
    },
    {
      id: 'storage',
      label: 'Storage Analysis',
      description: 'Analyzing storage health and SMART data',
      startPercent: 45,
      endPercent: 70,
      activities: ['Reading SMART data...', 'Checking drive health...', 'Analyzing SSD wear...'],
    },
    {
      id: 'gpu',
      label: 'GPU Analysis',
      description: 'Analyzing GPU sensors and health',
      startPercent: 70,
      endPercent: 85,
      activities: ['Reading GPU sensors...', 'Checking GPU health...'],
    },
    {
      id: 'ai_analysis',
      label: 'AI Health Analysis',
      description: 'Calculating hardware health scores',
      startPercent: 85,
      endPercent: 100,
      activities: ['Calculating health scores...', 'Generating AI insights...', 'Preparing recommendations...'],
    },
  ],
  counters: [
    { id: 'sensors', label: 'Sensors Read', icon: 'CpuChipIcon', format: 'number' },
    { id: 'cpuTemp', label: 'CPU Temp', icon: 'CpuChipIcon', format: 'plain' },
    { id: 'gpuTemp', label: 'GPU Temp', icon: 'CpuChipIcon', format: 'plain' },
    { id: 'drivesChecked', label: 'Drives Checked', icon: 'CircleStackIcon', format: 'number' },
    { id: 'smartWarnings', label: 'SMART Warnings', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'recommendations', label: 'Recommendations', icon: 'SparklesIcon', format: 'number' },
  ],
};

// ── Performance Scan ────────────────────────────────────────────

export const PERFORMANCE_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'performance',
  moduleName: 'Performance Scan',
  moduleIcon: 'RocketLaunchIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'processes',
      label: 'Process Analysis',
      description: 'Analyzing running processes',
      startPercent: 0,
      endPercent: 30,
      activities: ['Enumerating processes...', 'Checking CPU usage...', 'Analyzing memory consumption...'],
    },
    {
      id: 'startup',
      label: 'Startup Analysis',
      description: 'Analyzing startup impact',
      startPercent: 30,
      endPercent: 55,
      activities: ['Checking startup programs...', 'Analyzing boot impact...', 'Evaluating services...'],
    },
    {
      id: 'resources',
      label: 'Resource Analysis',
      description: 'Analyzing system resources',
      startPercent: 55,
      endPercent: 80,
      activities: ['Checking disk usage...', 'Analyzing memory pressure...', 'Evaluating CPU bottlenecks...'],
    },
    {
      id: 'ai_analysis',
      label: 'AI Performance Analysis',
      description: 'Generating performance recommendations',
      startPercent: 80,
      endPercent: 100,
      activities: ['Calculating performance score...', 'Generating recommendations...', 'Preparing optimization plan...'],
    },
  ],
  counters: [
    { id: 'processes', label: 'Processes', icon: 'CommandLineIcon', format: 'number' },
    { id: 'startupItems', label: 'Startup Items', icon: 'ServerIcon', format: 'number' },
    { id: 'services', label: 'Services', icon: 'Cog6ToothIcon', format: 'number' },
    { id: 'cpuUsage', label: 'CPU Usage', icon: 'CpuChipIcon', format: 'percent' },
    { id: 'memoryUsage', label: 'Memory Usage', icon: 'CpuChipIcon', format: 'percent' },
    { id: 'recommendations', label: 'Recommendations', icon: 'SparklesIcon', format: 'number' },
  ],
};

// ── Startup Manager ─────────────────────────────────────────────

export const STARTUP_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'startup',
  moduleName: 'Startup Manager',
  moduleIcon: 'ServerIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'registry',
      label: 'Registry Startup',
      description: 'Scanning registry startup entries',
      startPercent: 0,
      endPercent: 30,
      activities: ['Scanning Run keys...', 'Checking RunOnce entries...'],
    },
    {
      id: 'folder',
      label: 'Startup Folder',
      description: 'Scanning startup folder shortcuts',
      startPercent: 30,
      endPercent: 50,
      activities: ['Checking startup folder...', 'Scanning all users startup...'],
    },
    {
      id: 'services',
      label: 'Auto-start Services',
      description: 'Scanning auto-start services',
      startPercent: 50,
      endPercent: 75,
      activities: ['Enumerating services...', 'Checking auto-start services...'],
    },
    {
      id: 'scheduled',
      label: 'Scheduled Tasks',
      description: 'Scanning scheduled tasks',
      startPercent: 75,
      endPercent: 100,
      activities: ['Enumerating scheduled tasks...', 'Checking startup tasks...'],
    },
  ],
  counters: [
    { id: 'startupItems', label: 'Startup Items', icon: 'ServerIcon', format: 'number' },
    { id: 'services', label: 'Services', icon: 'Cog6ToothIcon', format: 'number' },
    { id: 'scheduledTasks', label: 'Scheduled Tasks', icon: 'ClockIcon', format: 'number' },
    { id: 'disabledItems', label: 'Disabled Items', icon: 'EyeSlashIcon', format: 'number' },
    { id: 'impactScore', label: 'Impact Score', icon: 'RocketLaunchIcon', format: 'seconds' },
  ],
};

// ── Disk Analyzer ───────────────────────────────────────────────

export const DISK_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'disk',
  moduleName: 'Disk Analyzer',
  moduleIcon: 'CircleStackIcon',
  supportsPause: true,
  supportsCancel: true,
  phases: [
    {
      id: 'scanning',
      label: 'Scanning Disk',
      description: 'Scanning disk for file analysis',
      startPercent: 0,
      endPercent: 50,
      activities: ['Scanning directories...', 'Analyzing file sizes...', 'Categorizing files...'],
    },
    {
      id: 'analysis',
      label: 'File Analysis',
      description: 'Analyzing file types and sizes',
      startPercent: 50,
      endPercent: 80,
      activities: ['Categorizing by type...', 'Calculating largest files...', 'Identifying old files...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing disk analysis report',
      startPercent: 80,
      endPercent: 100,
      activities: ['Generating report...', 'Preparing visualizations...'],
    },
  ],
  counters: [
    { id: 'totalSize', label: 'Total Size', icon: 'CircleStackIcon', format: 'bytes' },
    { id: 'largestFiles', label: 'Largest Files', icon: 'DocumentTextIcon', format: 'number' },
    { id: 'oldFiles', label: 'Old Files', icon: 'DocumentTextIcon', format: 'number' },
    { id: 'duplicateSize', label: 'Duplicate Size', icon: 'CircleStackIcon', format: 'bytes' },
  ],
};

// ── Browser Cleaner ─────────────────────────────────────────────

export const BROWSER_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'browser',
  moduleName: 'Browser Cleaner',
  moduleIcon: 'GlobeAltIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'chrome',
      label: 'Chrome Analysis',
      description: 'Scanning Chrome browser data',
      startPercent: 0,
      endPercent: 35,
      activities: ['Scanning Chrome cache...', 'Checking Chrome cookies...', 'Inspecting Chrome extensions...'],
    },
    {
      id: 'edge',
      label: 'Edge Analysis',
      description: 'Scanning Edge browser data',
      startPercent: 35,
      endPercent: 65,
      activities: ['Scanning Edge cache...', 'Checking Edge cookies...', 'Inspecting Edge extensions...'],
    },
    {
      id: 'firefox',
      label: 'Firefox Analysis',
      description: 'Scanning Firefox browser data',
      startPercent: 65,
      endPercent: 90,
      activities: ['Scanning Firefox cache...', 'Checking Firefox cookies...', 'Inspecting Firefox add-ons...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing browser cleanup report',
      startPercent: 90,
      endPercent: 100,
      activities: ['Calculating recovery...', 'Preparing recommendations...'],
    },
  ],
  counters: [
    { id: 'browserObjects', label: 'Browser Objects', icon: 'GlobeAltIcon', format: 'number' },
    { id: 'cacheSize', label: 'Cache Size', icon: 'CircleStackIcon', format: 'bytes' },
    { id: 'cookies', label: 'Cookies', icon: 'GlobeAltIcon', format: 'number' },
    { id: 'extensions', label: 'Extensions', icon: 'Squares2X2Icon', format: 'number' },
    { id: 'historyEntries', label: 'History Entries', icon: 'GlobeAltIcon', format: 'number' },
    { id: 'recoverableSpace', label: 'Recoverable Space', icon: 'CircleStackIcon', format: 'bytes' },
  ],
};

// ── Software Updater ────────────────────────────────────────────

export const UPDATER_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'updater',
  moduleName: 'Software Updater',
  moduleIcon: 'ArrowPathIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'scanning',
      label: 'Scanning Installed Software',
      description: 'Enumerating installed applications',
      startPercent: 0,
      endPercent: 50,
      activities: ['Enumerating installed software...', 'Checking versions...', 'Scanning registry entries...'],
    },
    {
      id: 'checking',
      label: 'Checking for Updates',
      description: 'Checking for available updates',
      startPercent: 50,
      endPercent: 90,
      activities: ['Checking for updates...', 'Comparing versions...', 'Evaluating update priority...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing update recommendations',
      startPercent: 90,
      endPercent: 100,
      activities: ['Preparing recommendations...', 'Sorting by priority...'],
    },
  ],
  counters: [
    { id: 'applications', label: 'Applications', icon: 'Squares2X2Icon', format: 'number' },
    { id: 'updatesAvailable', label: 'Updates Available', icon: 'ArrowPathIcon', format: 'number' },
    { id: 'criticalUpdates', label: 'Critical Updates', icon: 'ExclamationTriangleIcon', format: 'number' },
    { id: 'upToDate', label: 'Up to Date', icon: 'CheckCircleIcon', format: 'number' },
  ],
};

// ── Uninstaller ─────────────────────────────────────────────────

export const UNINSTALLER_SCAN_CONFIG: UnifiedScanModuleConfig = {
  moduleId: 'uninstaller',
  moduleName: 'Uninstaller',
  moduleIcon: 'ArchiveBoxXMarkIcon',
  supportsPause: false,
  supportsCancel: true,
  phases: [
    {
      id: 'scanning',
      label: 'Scanning Installed Programs',
      description: 'Enumerating installed programs',
      startPercent: 0,
      endPercent: 60,
      activities: ['Scanning registry uninstall keys...', 'Checking installed programs...', 'Enumerating Windows Store apps...'],
    },
    {
      id: 'analysis',
      label: 'Analyzing',
      description: 'Analyzing program sizes and usage',
      startPercent: 60,
      endPercent: 90,
      activities: ['Calculating program sizes...', 'Checking last used dates...', 'Identifying rarely used programs...'],
    },
    {
      id: 'finalizing',
      label: 'Finalizing',
      description: 'Preparing uninstaller list',
      startPercent: 90,
      endPercent: 100,
      activities: ['Sorting by size...', 'Preparing recommendations...'],
    },
  ],
  counters: [
    { id: 'applications', label: 'Applications', icon: 'Squares2X2Icon', format: 'number' },
    { id: 'totalSize', label: 'Total Size', icon: 'CircleStackIcon', format: 'bytes' },
    { id: 'rarelyUsed', label: 'Rarely Used', icon: 'EyeSlashIcon', format: 'number' },
    { id: 'largePrograms', label: 'Large Programs', icon: 'CircleStackIcon', format: 'number' },
  ],
};

// ── Config Registry ─────────────────────────────────────────────

export const MODULE_SCAN_CONFIGS: Record<string, UnifiedScanModuleConfig> = {
  optimize: OPTIMIZE_SCAN_CONFIG,
  security: SECURITY_SCAN_CONFIG,
  junk: JUNK_SCAN_CONFIG,
  registry: REGISTRY_SCAN_CONFIG,
  privacy: PRIVACY_SCAN_CONFIG,
  duplicate: DUPLICATE_SCAN_CONFIG,
  hardware: HARDWARE_SCAN_CONFIG,
  performance: PERFORMANCE_SCAN_CONFIG,
  startup: STARTUP_SCAN_CONFIG,
  disk: DISK_SCAN_CONFIG,
  browser: BROWSER_SCAN_CONFIG,
  updater: UPDATER_SCAN_CONFIG,
  uninstaller: UNINSTALLER_SCAN_CONFIG,
};
