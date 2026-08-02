/**
 * SecurityDataAdapter — transforms raw backend system data into the
 * typed indicator objects that each frontend SecurityProvider expects.
 *
 * This is the "AI analysis" layer: it examines raw process lists,
 * startup entries, scheduled tasks, services, browser extensions,
 * and unsigned executables collected by the Python backend, and
 * produces structured indicators (SpywareIndicator[], PUPIndicator[],
 * CryptoMinerProcessDetail[], etc.) that the providers analyze to
 * detect threats.
 *
 * Data flow:
 *   Backend (psutil/WMI/PowerShell) → SecuritySnapshotData
 *   → SecurityDataAdapter.transform() → ProviderScanContext.options
 *   → SecurityEngine providers → Threat[] → UI
 *
 * Detection approach: Behavior-based, no third-party definitions needed.
 *   - Suspicious path detection (TEMP, AppData executables)
 *   - Known malicious process names (miners, fake AV)
 *   - Suspicious command-line patterns (encoded PowerShell, downloads)
 *   - Persistence mechanism analysis (registry Run keys, startup folders)
 *   - Browser extension permission analysis
 *   - Unsigned executable detection
 *   - Network connection pattern analysis (beaconing, suspicious ports)
 */
import type {
  SpywareIndicator,
  SpywareSignal,
  AdwareIndicator,
  AdwareSignal,
  PUPIndicator,
  PUPSignal,
  ProcessBehaviorInfo,
  BehaviorIndicator,
  CryptoMinerInput,
  CryptoMinerProcessDetail,
  NetworkBehaviorInput,
  NetworkConnectionDetail,
  ListeningPortDetail,
  PersistenceAnalysisInput,
  StartupEntryDetail,
  ScheduledTaskDetail,
  ServiceDetail,
  BrowserAnalysisInput,
  BrowserExtensionDetail,
  ScriptDetail,
  RansomwareIndicator,
  RansomwareSignal,
  TrojanIndicator,
  TrojanSignal,
  KeyloggerIndicator,
  KeyloggerSignal,
  RootkitIndicator,
  RootkitSignal,
} from '../security-center/types';
import type { SecuritySnapshotData, BackendNetworkConnection, BackendListeningPort } from './securityBackendService';

// ── Suspicious patterns ─────────────────────────────────────────

const SUSPICIOUS_PATHS = [
  '\\temp\\', '\\appdata\\local\\temp', '\\downloads\\',
  '\\programdata\\', '\\users\\public\\',
];

const KNOWN_MINER_NAMES = ['xmrig', 'ccminer', 'ethminer', 'claymore', 'phoenixminer',
  'nbminer', 'trex', 'lolminer', 'gminer', 'teamredminer', 'cryptonight', 'stratum',
  'minerd', 'cpuminer', 'cgminer', 'bfgminer'];

const MINING_POOL_INDICATORS = ['stratum+tcp', 'stratum+ssl', 'pool.minexmr', 'xmr-pool',
  'nanopool', 'ethermine', 'f2pool', 'antpool', 'miningpoolhub', 'dwarfpool', 'hashflare'];

const SUSPICIOUS_PORTS = [4444, 1337, 31337, 6667, 6666, 9999, 12345, 54321];

const PUP_NAMES = ['driver booster', 'advanced systemcare', 'ccleaner', 'speedup',
  'optimizer', 'driver updater', 'pc cleaner', 'registry cleaner', 'mypcbackup',
  'driveragent', 'slimcleaner', 'pc mechanic', 'avast cleanup', 'iobit'];

const FAKE_AV_NAMES = ['win7 antivirus', 'xp antivirus', 'win antivirus', 'system antivirus',
  'antivirus 2009', 'antivirus 2010', 'antivirus 360', 'security suite', 'pc security',
  'system security', 'your protector', 'virus guard', 'spyware guard'];

const ADWARE_PATTERNS = ['adhelper', 'adware', 'popup', 'coupon', 'shopping',
  'dealfinder', 'pricefountain', 'ads remover', 'adblock'];

const SUSPICIOUS_CMD_PATTERNS = [
  /-enc[a-z]*\s+[A-Za-z0-9+/=]{50,}/i,  // encoded PowerShell
  /downloadstring/i, /downloadfile/i,    // PowerShell downloads
  /invoke-expression/i,                   // PowerShell execution
  /cmd\.exe.*\/c.*powershell/i,           // PowerShell via cmd
  /schtasks.*\/create/i,                  // Task creation from cmdline
  /netsh.*firewall.*add/i,               // Firewall modification
  /reg.*add.*run/i,                       // Registry Run key modification
  /vssadmin.*delete/i,                    // Shadow copy deletion (ransomware)
  /bcdedit.*recoveryenabled.*no/i,        // Recovery disable (ransomware)
  /wbemadmin.*delete/i,                   // Backup deletion (ransomware)
];

const SUSPICIOUS_PERMISSIONS = [
  '<all_urls>', 'tabs', 'webRequest', 'webRequestBlocking',
  'nativeMessaging', 'clipboardRead', 'clipboardWrite',
  'cookies', 'history', 'browsingData',
];

const RANSOMWARE_PROCESS_NAMES = ['locky', 'cryptolocker', 'wannacry', 'wcry', 'ryuk', 'conti', 'maze', 'sodinokibi', 'gandcrab', 'cerber', 'globeimposter', 'dharma', 'phobos'];
const RANSOM_NOTE_PATTERNS = ['how_to_decrypt', 'readme', 'restore_files', 'ransom', 'recover', 'how_to_recover', 'decryption_instructions', '!restore', 'help_help', 'all_your_files'];
const SHADOW_DELETE_CMDS = ['vssadmin delete shadows', 'vssadmin delete shadowcopies', 'wmic shadowcopy delete'];
const RECOVERY_DISABLE_CMDS = ['bcdedit', 'recoveryenabled no'];
const BACKUP_DELETE_CMDS = ['wbadmin delete catalog', 'wbadmin delete systemstatebackup'];

const TROJAN_PROCESS_NAMES = ['emotet', 'trickbot', 'zeus', 'azorult', 'lokibot', 'formbook', 'redline', 'vidar', 'racoon', 'dridex', 'qakbot', 'icedid', 'bazarloader', 'hancitor'];
const SYSTEM_PROCESS_NAMES = ['explorer.exe', 'svchost.exe', 'lsass.exe', 'csrss.exe', 'winlogon.exe', 'wininit.exe', 'smss.exe', 'services.exe', 'spoolsv.exe', 'dwm.exe'];

const KEYLOGGER_PROCESS_NAMES = ['keylog', 'keylogger', 'keystroke', 'keycapture', 'keyspy', 'keytrap', 'spytector', 'refog', 'ardamax', 'actualspy', 'revealer'];
const KEYLOGGER_API_PATTERNS = ['setwindowshookex', 'getasynckeystate', 'getkeyboardstate', 'getkeynametext', 'toasciiex', 'getrawinputdata'];

const ROOTKIT_PROCESS_NAMES = ['rootkit', 'necurs', 'tdss', 'alureon', 'rustock', 'bagle', 'haxdoor', 'agobot', 'rxbot', 'spambot', 'cutwail', 'sirefef', 'zeroaccess'];

// ── Helper functions ────────────────────────────────────────────

function toTimestamp(dateStr: string | null | undefined): number {
  if (!dateStr) return Date.now();
  const ts = new Date(dateStr).getTime();
  return isNaN(ts) ? Date.now() : ts;
}

function isSuspiciousPath(path: string): boolean {
  const lower = path.toLowerCase();
  return SUSPICIOUS_PATHS.some((p) => lower.includes(p));
}

function matchPatterns(name: string, patterns: string[]): boolean {
  const lower = name.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

function matchRegexPatterns(text: string, patterns: RegExp[]): string[] {
  const matched: string[] = [];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      matched.push(pattern.source);
    }
  }
  return matched;
}

// ── Adapter ─────────────────────────────────────────────────────

export const securityDataAdapter = {

  /**
   * Transform raw backend snapshot data into the option keys and
   * typed indicator objects that the frontend SecurityProviders expect.
   *
   * Returns a Record<string, unknown> suitable for spreading into
   * ProviderScanContext.options.
   */
  transform(data: SecuritySnapshotData): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    const processes = data.processes?.processes ?? [];
    const startupEntries = data.startupAnalysis?.entries ?? [];
    const scheduledTasks = data.scheduledTasks?.tasks ?? [];
    const services = data.services?.services ?? [];
    const browserExtensions = data.browserExtensions?.extensions ?? [];
    const unsignedExecs = data.unsignedExecutables?.executables ?? [];

    // ── Process-based providers ──────────────────────────────

    const spywareIndicators = this.transformSpyware(processes, startupEntries);
    if (spywareIndicators.length > 0) options['spywareInput'] = spywareIndicators;

    const adwareIndicators = this.transformAdware(processes, browserExtensions);
    if (adwareIndicators.length > 0) options['adwareInput'] = adwareIndicators;

    const pupIndicators = this.transformPUP(processes, unsignedExecs, browserExtensions);
    if (pupIndicators.length > 0) options['pupInput'] = pupIndicators;

    const cryptoMinerInput = this.transformCryptoMiner(processes);
    if (cryptoMinerInput.processes.length > 0) options['cryptoMinerInput'] = cryptoMinerInput;

    const processBehaviors = this.transformProcessBehaviors(processes);
    if (processBehaviors.length > 0) options['processBehaviors'] = processBehaviors;

    // ── Persistence providers ────────────────────────────────

    const persistenceAnalysis = this.transformPersistence(
      startupEntries, scheduledTasks, services,
    );
    options['persistenceAnalysis'] = persistenceAnalysis;
    options['startupEntries'] = persistenceAnalysis.startupEntries;
    options['scheduledTasks'] = persistenceAnalysis.scheduledTasks;
    options['services'] = persistenceAnalysis.services;

    // ── Browser protection ───────────────────────────────────

    const browserAnalysis = this.transformBrowserAnalysis(browserExtensions);
    if (browserAnalysis.extensions.length > 0) options['browserAnalysis'] = browserAnalysis;

    // ── Reputation / unsigned executables ────────────────────

    const reputationAnalysis = this.transformReputation(unsignedExecs, processes);
    if (reputationAnalysis.files?.length || reputationAnalysis.publishers?.length) {
      options['reputationAnalysis'] = reputationAnalysis;
    }

    // ── Network behavior (from backend network connections) ──
    const networkBehavior = this.transformNetworkBehavior(data.networkConnections);
    if (networkBehavior.connections.length > 0 || networkBehavior.listeningPorts.length > 0) {
      options['networkBehavior'] = networkBehavior;
    }

    // ── Scripts (from process command lines) ─────────────────
    const scripts = this.transformScripts(processes);
    if (scripts.length > 0) options['scripts'] = scripts;

    // ── Ransomware indicators ────────────────────────────────
    const ransomwareIndicators = this.transformRansomware(processes);
    if (ransomwareIndicators.length > 0) options['ransomwareInput'] = ransomwareIndicators;

    // ── Trojan indicators ────────────────────────────────────
    const trojanIndicators = this.transformTrojans(processes);
    if (trojanIndicators.length > 0) options['trojanInput'] = trojanIndicators;

    // ── Keylogger indicators ─────────────────────────────────
    const keyloggerIndicators = this.transformKeyloggers(processes);
    if (keyloggerIndicators.length > 0) options['keyloggerInput'] = keyloggerIndicators;

    // ── Rootkit indicators ───────────────────────────────────
    const rootkitIndicators = this.transformRootkits(processes, services);
    if (rootkitIndicators.length > 0) options['rootkitInput'] = rootkitIndicators;

    return options;
  },

  // ── Spyware indicators ──────────────────────────────────────

  transformSpyware(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string; username: string }>,
    startupEntries: Array<{ name: string; command: string; source: string }>,
  ): SpywareIndicator[] {
    const indicators: SpywareIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: SpywareSignal[] = [];
      const cmdLower = (proc.cmdline || '').toLowerCase();
      const exeLower = (proc.exe || '').toLowerCase();
      const nameLower = (proc.name || '').toLowerCase();

      // Clipboard monitoring
      if (cmdLower.includes('clipboard') || nameLower.includes('clip')) {
        signals.push({ type: 'clipboard_monitoring', description: `Process accesses clipboard: ${proc.cmdline}`, timestamp: now });
      }

      // Screen capture
      if (cmdLower.includes('screenshot') || cmdLower.includes('screen') && cmdLower.includes('capture')
        || nameLower.includes('screencap') || nameLower.includes('snipping')) {
        signals.push({ type: 'screen_capture', description: `Screen capture activity: ${proc.name}`, timestamp: now });
      }

      // Keyboard hook
      if (nameLower.includes('keylog') || cmdLower.includes('setwindowshookex')
        || cmdLower.includes('getasynckeystate') || cmdLower.includes('getkeyboardstate')) {
        signals.push({ type: 'keyboard_hook', description: `Keyboard hook detected: ${proc.name}`, timestamp: now });
      }

      // Credential access
      if (cmdLower.includes('lsass') || cmdLower.includes('credential') || cmdLower.includes('sam.')
        || cmdLower.includes('mimikatz') || cmdLower.includes('sekurlsa')) {
        signals.push({ type: 'credential_access', description: `Credential access attempt: ${proc.cmdline}`, timestamp: now });
      }

      // Browser credential access
      if (exeLower.includes('chrome') && cmdLower.includes('login data')
        || cmdLower.includes('cookies') && (exeLower.includes('chrome') || exeLower.includes('edge') || exeLower.includes('firefox'))
        || cmdLower.includes('password') && cmdLower.includes('browser')) {
        signals.push({ type: 'browser_credential_access', description: `Browser credential access: ${proc.cmdline}`, timestamp: now });
      }

      // Camera/microphone access
      if (cmdLower.includes('webcam') || cmdLower.includes('camera') || cmdLower.includes('microphone')
        || nameLower.includes('webcam') || nameLower.includes('camera')) {
        const signalType = (nameLower.includes('mic') || cmdLower.includes('microphone')) ? 'microphone_access' : 'camera_access';
        signals.push({ type: signalType, description: `Camera/microphone access: ${proc.name}`, timestamp: now });
      }

      // Suspicious persistence + running from temp
      if (isSuspiciousPath(proc.exe || '') && startupEntries.some(s => s.command.includes(proc.name))) {
        signals.push({ type: 'suspicious_persistence', description: `Process in suspicious location with persistence: ${proc.exe}`, timestamp: now });
      }

      // Require 2+ signals (matches provider's false-positive control)
      if (signals.length >= 2) {
        indicators.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          indicators: signals,
        });
      }
    }

    return indicators;
  },

  // ── Adware indicators ────────────────────────────────────────

  transformAdware(
    processes: Array<{ name: string; exe: string; cmdline: string }>,
    extensions: Array<{ name: string; browser: string; permissions: string[] }>,
  ): AdwareIndicator[] {
    const indicators: AdwareIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: AdwareSignal[] = [];
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = (proc.cmdline || '').toLowerCase();

      if (matchPatterns(nameLower, ADWARE_PATTERNS)) {
        signals.push({ type: 'ad_injection', description: `Process name matches adware pattern: ${proc.name}`, timestamp: now });
      }

      if (cmdLower.includes('popup') || cmdLower.includes('adware') || cmdLower.includes('advertisement')) {
        signals.push({ type: 'popup_generator', description: `Popup/ad activity in command line: ${proc.cmdline}`, timestamp: now });
      }

      if (cmdLower.includes('homepage') && (cmdLower.includes('change') || cmdLower.includes('set'))) {
        signals.push({ type: 'homepage_modification', description: `Homepage modification: ${proc.cmdline}`, timestamp: now });
      }

      if (cmdLower.includes('searchengine') || cmdLower.includes('search_provider')) {
        signals.push({ type: 'search_engine_replacement', description: `Search engine modification: ${proc.cmdline}`, timestamp: now });
      }

      if (signals.length >= 2) {
        indicators.push({
          target: proc.exe || proc.name,
          indicators: signals,
        });
      }
    }

    // Check browser extensions for adware indicators
    for (const ext of extensions) {
      const signals: AdwareSignal[] = [];
      const nameLower = (ext.name || '').toLowerCase();

      if (matchPatterns(nameLower, ADWARE_PATTERNS)) {
        signals.push({ type: 'ad_injection', description: `Extension name matches adware: ${ext.name}`, timestamp: now });
      }

      if (ext.permissions?.some((p: string) => p.toLowerCase() === 'notifications')) {
        signals.push({ type: 'notification_abuse', description: `Extension requests notification permission`, timestamp: now });
      }

      if (ext.permissions?.some((p: string) => p.toLowerCase().includes('homepage'))) {
        signals.push({ type: 'homepage_modification', description: `Extension can modify homepage`, timestamp: now });
      }

      if (signals.length >= 2) {
        indicators.push({
          target: `${ext.browser}: ${ext.name}`,
          indicators: signals,
        });
      }
    }

    return indicators;
  },

  // ── PUP indicators ───────────────────────────────────────────

  transformPUP(
    processes: Array<{ name: string; exe: string }>,
    unsignedExecs: Array<{ path: string; name: string }>,
    extensions: Array<{ name: string; browser: string }>,
  ): PUPIndicator[] {
    const indicators: PUPIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: PUPSignal[] = [];
      const nameLower = (proc.name || '').toLowerCase();

      if (matchPatterns(nameLower, PUP_NAMES)) {
        signals.push({ type: 'optimizer_scam', description: `Process name matches known PUP: ${proc.name}`, timestamp: now });
      }

      if (matchPatterns(nameLower, FAKE_AV_NAMES)) {
        signals.push({ type: 'fake_antivirus', description: `Process name matches fake AV: ${proc.name}`, timestamp: now });
      }

      if (matchPatterns(nameLower, KNOWN_MINER_NAMES)) {
        signals.push({ type: 'crypto_mining_software', description: `Process name matches crypto miner: ${proc.name}`, timestamp: now });
      }

      if (isSuspiciousPath(proc.exe || '') && nameLower.includes('setup')) {
        signals.push({ type: 'bundled_installer', description: `Bundled installer in suspicious location: ${proc.exe}`, timestamp: now });
      }

      if (signals.length >= 1) {
        indicators.push({
          target: proc.exe || proc.name,
          name: proc.name,
          indicators: signals,
        });
      }
    }

    // Check unsigned executables for PUP patterns
    for (const exe of unsignedExecs) {
      const nameLower = (exe.name || '').toLowerCase();
      if (matchPatterns(nameLower, PUP_NAMES) || matchPatterns(nameLower, FAKE_AV_NAMES)) {
        indicators.push({
          target: exe.path,
          name: exe.name,
          indicators: [{
            type: matchPatterns(nameLower, FAKE_AV_NAMES) ? 'fake_antivirus' : 'optimizer_scam',
            description: `Unsigned executable matches PUP pattern: ${exe.name}`,
            timestamp: now,
          }],
        });
      }
    }

    // Check browser extensions for PUP
    for (const ext of extensions) {
      const nameLower = (ext.name || '').toLowerCase();
      if (matchPatterns(nameLower, PUP_NAMES) || matchPatterns(nameLower, ADWARE_PATTERNS)) {
        indicators.push({
          target: `${ext.browser}: ${ext.name}`,
          name: ext.name,
          indicators: [{
            type: 'unwanted_extension',
            description: `Browser extension matches PUP pattern: ${ext.name}`,
            timestamp: now,
          }],
        });
      }
    }

    return indicators;
  },

  // ── Crypto miner detection ───────────────────────────────────

  transformCryptoMiner(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string }>,
  ): CryptoMinerInput {
    const minerProcesses: CryptoMinerProcessDetail[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = (proc.cmdline || '').toLowerCase();

      const isKnownMiner = matchPatterns(nameLower, KNOWN_MINER_NAMES);
      const hasPoolConnection = MINING_POOL_INDICATORS.some(p => cmdLower.includes(p));
      const hasMiningCmd = cmdLower.includes('stratum') || cmdLower.includes('--cpu-priority')
        || cmdLower.includes('--threads') || cmdLower.includes('--url=');

      if (isKnownMiner || hasPoolConnection || hasMiningCmd) {
        const poolConnections: string[] = [];
        for (const pool of MINING_POOL_INDICATORS) {
          if (cmdLower.includes(pool)) {
            poolConnections.push(pool);
          }
        }

        const miningIndicators: string[] = [];
        if (isKnownMiner) miningIndicators.push(`known_miner_name: ${proc.name}`);
        if (hasMiningCmd) miningIndicators.push('mining_command_line_args');
        if (isSuspiciousPath(proc.exe || '')) miningIndicators.push(`suspicious_location: ${proc.exe}`);

        minerProcesses.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          // CPU/GPU not available from backend process list — set to 0
          // The provider requires 2+ indicators; we provide other indicators
          cpuUsage: 0,
          gpuUsage: 0,
          poolConnections,
          miningIndicators,
          timestamp: now,
        });
      }
    }

    return { processes: minerProcesses };
  },

  // ── Process behavior indicators ──────────────────────────────

  transformProcessBehaviors(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string; username: string; ppid: number }>,
  ): ProcessBehaviorInfo[] {
    const behaviors: ProcessBehaviorInfo[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const indicators: BehaviorIndicator[] = [];
      const cmdLower = (proc.cmdline || '').toLowerCase();
      const exeLower = (proc.exe || '').toLowerCase();
      const nameLower = (proc.name || '').toLowerCase();

      // Suspicious path
      if (isSuspiciousPath(exeLower)) {
        indicators.push({
          type: 'suspicious_location',
          description: `Running from suspicious path: ${proc.exe}`,
          weight: 0.6,
          timestamp: now,
        });
      }

      // Suspicious command line patterns
      const matchedPatterns = matchRegexPatterns(proc.cmdline || '', SUSPICIOUS_CMD_PATTERNS);
      for (const pattern of matchedPatterns) {
        indicators.push({
          type: 'suspicious_command',
          description: `Command line matches suspicious pattern: ${pattern}`,
          weight: 0.8,
          timestamp: now,
        });
      }

      // Running as SYSTEM from non-system path
      if ((proc.username || '').toLowerCase().includes('system') && !exeLower.includes('\\windows\\')) {
        indicators.push({
          type: 'system_privilege_escalation',
          description: `Running as SYSTEM from non-system path: ${proc.exe}`,
          weight: 0.7,
          timestamp: now,
        });
      }

      // Known miner names
      if (matchPatterns(nameLower, KNOWN_MINER_NAMES)) {
        indicators.push({
          type: 'known_miner',
          description: `Process name matches known miner: ${proc.name}`,
          weight: 0.9,
          timestamp: now,
        });
      }

      // Fake AV
      if (matchPatterns(nameLower, FAKE_AV_NAMES)) {
        indicators.push({
          type: 'fake_antivirus',
          description: `Process name matches fake AV: ${proc.name}`,
          weight: 0.85,
          timestamp: now,
        });
      }

      if (indicators.length > 0) {
        behaviors.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          indicators,
        });
      }
    }

    return behaviors;
  },

  // ── Persistence analysis ─────────────────────────────────────

  transformPersistence(
    startupEntries: Array<{ name: string; command: string; source: string; location: string; type: string }>,
    scheduledTasks: Array<{ taskName: string; taskPath: string; state: string; author: string; actions: Array<{ execute: string; arguments: string }>; triggers: Array<{ type: string; enabled: boolean }>; lastRunTime: string | null; nextRunTime: string | null }>,
    services: Array<{ name: string; displayName: string; state: string; startMode: string; pathName: string; processId: number; serviceType: string; startName: string }>,
  ): PersistenceAnalysisInput {
    // Transform startup entries
    const startupDetails: StartupEntryDetail[] = startupEntries.map(e => ({
      name: e.name,
      path: e.location || '',
      command: e.command,
      location: e.source || e.location,
      publisher: null,
      signed: false, // Backend doesn't check signatures for startup entries yet
    }));

    // Transform scheduled tasks
    const taskDetails: ScheduledTaskDetail[] = scheduledTasks.map(t => ({
      name: t.taskName,
      path: t.taskPath,
      command: t.actions?.map(a => `${a.execute} ${a.arguments}`).join('; ') || '',
      author: t.author,
      triggers: t.triggers?.map(tr => tr.type) || [],
      enabled: t.state !== 'Disabled',
      hidden: t.taskPath?.includes('\\Microsoft\\') === false && (t.taskName?.startsWith('_') || false),
      lastRun: t.lastRunTime ? toTimestamp(t.lastRunTime) : null,
    }));

    // Transform services
    const serviceDetails: ServiceDetail[] = services.map(s => ({
      name: s.name,
      displayName: s.displayName,
      binaryPath: s.pathName || '',
      startType: s.startMode || '',
      serviceType: s.serviceType || '',
      account: s.startName || '',
      signed: false, // Backend doesn't check service signatures yet
      publisher: null,
    }));

    return {
      startupEntries: startupDetails,
      registryRunKeys: [], // Backend startup entries already include Run keys
      scheduledTasks: taskDetails,
      services: serviceDetails,
      wmiPersistence: [], // Not collected by backend yet
      shellExtensions: [], // Not collected by backend yet
    };
  },

  // ── Browser extension analysis ───────────────────────────────

  transformBrowserAnalysis(
    extensions: Array<{ browser: string; extensionId: string; version: string; name: string; description: string; permissions: string[]; path: string }>,
  ): BrowserAnalysisInput {
    const now = Date.now();

    const details: BrowserExtensionDetail[] = extensions.map(ext => {
      const perms = ext.permissions || [];
      const suspicious = perms.filter((p: string) =>
        SUSPICIOUS_PERMISSIONS.includes(p.toLowerCase()),
      );

      return {
        id: ext.extensionId,
        name: ext.name,
        browser: ext.browser,
        version: ext.version,
        permissions: perms,
        publisher: null,
        rating: 0, // Not available from manifest
        installDate: now,
        suspiciousPermissions: suspicious,
      };
    });

    return {
      extensions: details,
      settings: null, // Browser settings not collected by backend yet
    };
  },

  // ── Reputation analysis ──────────────────────────────────────

  transformReputation(
    unsignedExecs: Array<{ path: string; name: string; size: number; signatureStatus: string; signer: string; lastModified: string }>,
    processes: Array<{ name: string; exe: string }>,
  ): { files: Array<Record<string, unknown>>; publishers: Array<Record<string, unknown>> } {
    const now = Date.now();

    const files = unsignedExecs.map(exe => {
      const pathLower = (exe.path || '').toLowerCase();
      let installLocation: string = 'unknown';
      if (pathLower.includes('\\program files\\')) installLocation = 'program_files';
      else if (pathLower.includes('\\appdata\\')) installLocation = 'appdata';
      else if (pathLower.includes('\\temp\\')) installLocation = 'temp';
      else if (pathLower.includes('\\users\\')) installLocation = 'user_profile';
      else if (pathLower.includes('\\windows\\')) installLocation = 'system';

      return {
        path: exe.path,
        name: exe.name,
        hash: '', // Not computed by backend yet
        signed: false,
        signer: exe.signer || null,
        publisher: exe.signer || null,
        fileSize: exe.size || 0,
        installLocation,
        firstSeen: toTimestamp(exe.lastModified),
        reputationScore: 20, // Low reputation for unsigned
        knownGood: false,
        knownBad: false,
      };
    });

    // Extract unique publishers from processes
    const publisherMap = new Map<string, { signed: boolean; certificateValid: boolean }>();
    for (const proc of processes) {
      // We don't have publisher info from the process list, but
      // we can flag processes running from unsigned paths
      if (isSuspiciousPath(proc.exe || '')) {
        const key = proc.name;
        if (!publisherMap.has(key)) {
          publisherMap.set(key, { signed: false, certificateValid: false });
        }
      }
    }

    const publishers = Array.from(publisherMap.entries()).map(([name, info]) => ({
      name,
      signed: info.signed,
      certificateValid: info.certificateValid,
      certificateChain: [],
      knownVendor: false,
      reputationScore: 30,
    }));

    return { files, publishers };
  },

  // ── Network behavior analysis ────────────────────────────────

  transformNetworkBehavior(
    netData: { connections: BackendNetworkConnection[]; listeningPorts: BackendListeningPort[] } | undefined,
  ): NetworkBehaviorInput {
    const connections: NetworkConnectionDetail[] = [];
    const listeningPorts: ListeningPortDetail[] = [];

    if (netData?.connections) {
      for (const conn of netData.connections) {
        connections.push({
          processName: conn.processName,
          pid: conn.pid,
          localAddress: conn.localAddress,
          remoteAddress: conn.remoteAddress,
          remotePort: conn.remotePort,
          protocol: conn.protocol,
          state: conn.state,
          timestamp: conn.timestamp,
          beaconLike: false, // Determined by provider via pattern analysis
          beaconInterval: null,
        });
      }
    }

    if (netData?.listeningPorts) {
      for (const port of netData.listeningPorts) {
        listeningPorts.push({
          processName: port.processName,
          pid: port.pid,
          port: port.port,
          protocol: port.protocol,
          address: port.address,
          unexpected: SUSPICIOUS_PORTS.includes(port.port),
        });
      }
    }

    return {
      connections,
      listeningPorts,
      dnsQueries: [], // DNS queries not collected by backend yet
    };
  },

  // ── Script detection from process command lines ─────────────

  transformScripts(
    processes: Array<{ name: string; exe: string; cmdline: string; pid: number }>,
  ): ScriptDetail[] {
    const scripts: ScriptDetail[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const cmd = proc.cmdline || '';
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = cmd.toLowerCase();

      // PowerShell scripts
      if (nameLower.includes('powershell') || (nameLower === 'pwsh.exe')) {
        const suspicious: string[] = [];
        if (/-enc[a-z]*\s+[A-Za-z0-9+/=]{50,}/i.test(cmd)) suspicious.push('encoded_command');
        if (/downloadstring|downloadfile|invoke-expression/i.test(cmd)) suspicious.push('remote_download');
        if (/\/c\s+powershell/i.test(cmd)) suspicious.push('powershell_via_cmd');
        if (/bypass|-nop|-w\s+hidden/i.test(cmd)) suspicious.push('execution_policy_bypass');

        scripts.push({
          path: proc.exe || '',
          type: 'powershell',
          content: cmd,
          commandLine: cmd,
          executionPolicy: null,
          encoded: /-enc[a-z]*\s/i.test(cmd),
          obfuscated: suspicious.includes('encoded_command'),
          suspiciousCommands: suspicious,
          timestamp: now,
        });
      }

      // Batch scripts
      if (nameLower === 'cmd.exe' && cmdLower.includes('/c')) {
        const suspicious: string[] = [];
        if (/powershell/i.test(cmd)) suspicious.push('powershell_invocation');
        if (/reg\s+add/i.test(cmd)) suspicious.push('registry_modification');
        if (/schtasks\s+\/create/i.test(cmd)) suspicious.push('task_creation');
        if (/vssadmin\s+delete/i.test(cmd)) suspicious.push('shadow_copy_deletion');

        if (suspicious.length > 0) {
          scripts.push({
            path: proc.exe || '',
            type: 'batch',
            content: cmd,
            commandLine: cmd,
            executionPolicy: null,
            encoded: false,
            obfuscated: false,
            suspiciousCommands: suspicious,
            timestamp: now,
          });
        }
      }

      // WMI/cscript (VBScript/JScript)
      if (nameLower === 'wscript.exe' || nameLower === 'cscript.exe') {
        scripts.push({
          path: proc.exe || '',
          type: nameLower.includes('cscript') ? 'javascript' : 'vbscript',
          content: cmd,
          commandLine: cmd,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: now,
        });
      }
    }

    return scripts;
  },

  // ── Ransomware indicators ────────────────────────────────────

  transformRansomware(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string }>,
  ): RansomwareIndicator[] {
    const indicators: RansomwareIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: RansomwareSignal[] = [];
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = (proc.cmdline || '').toLowerCase();

      // Known ransomware process name
      if (matchPatterns(nameLower, RANSOMWARE_PROCESS_NAMES)) {
        signals.push({ type: 'known_ransomware_name', description: `Process name matches known ransomware: ${proc.name}`, value: proc.name, timestamp: now });
      }

      // Shadow copy deletion
      for (const cmd of SHADOW_DELETE_CMDS) {
        if (cmdLower.includes(cmd)) {
          signals.push({ type: 'shadow_copy_deletion', description: `Shadow copy deletion command: ${cmd}`, value: cmd, timestamp: now });
          break;
        }
      }

      // Recovery disable
      for (const cmd of RECOVERY_DISABLE_CMDS) {
        if (cmdLower.includes(cmd)) {
          signals.push({ type: 'recovery_disabled', description: `Recovery disabled: ${cmd}`, value: cmd, timestamp: now });
          break;
        }
      }

      // Backup deletion
      for (const cmd of BACKUP_DELETE_CMDS) {
        if (cmdLower.includes(cmd)) {
          signals.push({ type: 'backup_deletion', description: `Backup deletion command: ${cmd}`, value: cmd, timestamp: now });
          break;
        }
      }

      // Ransom note creation patterns in command line
      for (const pattern of RANSOM_NOTE_PATTERNS) {
        if (cmdLower.includes(pattern)) {
          signals.push({ type: 'ransom_note', description: `Ransom note pattern in command line: ${pattern}`, value: pattern, timestamp: now });
          break;
        }
      }

      // Disk encryption commands
      if (cmdLower.includes('cipher /w') || cmdLower.includes('manage-bde -on') || cmdLower.includes('bitlocker')) {
        signals.push({ type: 'disk_encryption_command', description: `Disk encryption command detected: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Volume shadow enumeration
      if (cmdLower.includes('vssadmin list shadows') || cmdLower.includes('wmic shadowcopy list')) {
        signals.push({ type: 'volume_shadow_enumeration', description: `Volume shadow enumeration: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Mass encryption: process accessing many file extensions rapidly (heuristic from command line)
      if (cmdLower.includes('*.doc') || cmdLower.includes('*.xls') || cmdLower.includes('*.pdf') || cmdLower.includes('*.jpg')) {
        if (isSuspiciousPath(proc.exe || '') || cmdLower.includes('encrypt') || cmdLower.includes('cipher')) {
          signals.push({ type: 'mass_encryption', description: `Mass file access pattern with encryption indicators: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
        }
      }

      if (signals.length >= 2) {
        indicators.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          indicators: signals,
        });
      }
    }

    return indicators;
  },

  // ── Trojan indicators ────────────────────────────────────────

  transformTrojans(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string; username: string }>,
  ): TrojanIndicator[] {
    const indicators: TrojanIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: TrojanSignal[] = [];
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = (proc.cmdline || '').toLowerCase();
      const exeLower = (proc.exe || '').toLowerCase();

      // Known trojan process name
      if (matchPatterns(nameLower, TROJAN_PROCESS_NAMES)) {
        signals.push({ type: 'known_trojan_name', description: `Process name matches known trojan: ${proc.name}`, value: proc.name, timestamp: now });
      }

      // System process impersonation: running from non-system path with system process name
      if (SYSTEM_PROCESS_NAMES.includes(nameLower) && !exeLower.includes('\\windows\\') && !exeLower.includes('\\system32\\')) {
        signals.push({ type: 'system_process_impersonation', description: `System process name running from non-system path: ${proc.exe}`, value: proc.exe, timestamp: now });
      }

      // Dropper behavior: downloading and executing
      if ((cmdLower.includes('downloadstring') || cmdLower.includes('downloadfile') || cmdLower.includes('urldownloadtofile'))
        && (cmdLower.includes('exec') || cmdLower.includes('invoke') || cmdLower.includes('start-process') || cmdLower.includes('cmd /c'))) {
        signals.push({ type: 'dropper_behavior', description: `Dropper behavior: download and execute in command line`, value: proc.cmdline, timestamp: now });
      }

      // Suspicious network from system process
      if (SYSTEM_PROCESS_NAMES.includes(nameLower) && (cmdLower.includes('net.webclient') || cmdLower.includes('invoke-webrequest') || cmdLower.includes('curl') || cmdLower.includes('wget'))) {
        signals.push({ type: 'suspicious_network_from_system', description: `System process making network requests: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Hidden window from system process
      if (SYSTEM_PROCESS_NAMES.includes(nameLower) && (cmdLower.includes('-w hidden') || cmdLower.includes('windowstyle hidden'))) {
        signals.push({ type: 'hidden_window_system', description: `System process with hidden window: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Registry persistence from suspicious process
      if ((cmdLower.includes('reg add') && (cmdLower.includes('run') || cmdLower.includes('runonce')))
        && isSuspiciousPath(proc.exe || '')) {
        signals.push({ type: 'registry_persistence_trojan', description: `Registry persistence from suspicious path: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // DLL injection indicators
      if (cmdLower.includes('createremotethread') || cmdLower.includes('writeprocessmemory') || cmdLower.includes('virtualallocex')) {
        signals.push({ type: 'dll_injection', description: `DLL injection APIs in command line: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Process hollowing indicators
      if (cmdLower.includes('createprocess') && cmdLower.includes('suspend') && (cmdLower.includes('ntunmapviewofsection') || cmdLower.includes('zwunmapviewofsection'))) {
        signals.push({ type: 'process_hollowing', description: `Process hollowing indicators: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      if (signals.length >= 2) {
        indicators.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          indicators: signals,
        });
      }
    }

    return indicators;
  },

  // ── Keylogger indicators ─────────────────────────────────────

  transformKeyloggers(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string }>,
  ): KeyloggerIndicator[] {
    const indicators: KeyloggerIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: KeyloggerSignal[] = [];
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = (proc.cmdline || '').toLowerCase();

      // Known keylogger process name
      if (matchPatterns(nameLower, KEYLOGGER_PROCESS_NAMES)) {
        signals.push({ type: 'known_keylogger_name', description: `Process name matches known keylogger: ${proc.name}`, value: proc.name, timestamp: now });
      }

      // Keyboard hook APIs
      for (const api of KEYLOGGER_API_PATTERNS) {
        if (cmdLower.includes(api)) {
          signals.push({ type: 'keyboard_hook', description: `Keyboard hook API detected: ${api}`, value: api, timestamp: now });
          break;
        }
      }

      // Clipboard monitoring
      if (cmdLower.includes('clipboard') || cmdLower.includes('getclipboarddata') || cmdLower.includes('openclipboard')) {
        signals.push({ type: 'clipboard_monitoring', description: `Clipboard monitoring detected: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Log file creation in suspicious locations
      if (isSuspiciousPath(proc.exe || '') && (cmdLower.includes('.log') || cmdLower.includes('.txt') || cmdLower.includes('.dat'))) {
        signals.push({ type: 'log_file_creation', description: `Log file creation from suspicious location: ${proc.exe}`, value: proc.exe, timestamp: now });
      }

      // Input capture API (GetAsyncKeyState in non-system process)
      if (cmdLower.includes('getasynckeystate') && !nameLower.includes('windows') && !nameLower.includes('microsoft')) {
        signals.push({ type: 'input_capture_api', description: `Input capture API in non-system process: ${proc.name}`, value: proc.name, timestamp: now });
      }

      // Suspicious DLL injection into input processes
      if ((nameLower.includes('explorer') || nameLower.includes('winlogon')) && cmdLower.includes('loadlibrary')) {
        signals.push({ type: 'suspicious_dll_injection_input', description: `DLL injection into input-handling process: ${proc.name}`, value: proc.cmdline, timestamp: now });
      }

      if (signals.length >= 2) {
        indicators.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          indicators: signals,
        });
      }
    }

    return indicators;
  },

  // ── Rootkit indicators ───────────────────────────────────────

  transformRootkits(
    processes: Array<{ pid: number; name: string; exe: string; cmdline: string }>,
    services: Array<{ name: string; displayName: string; pathName: string; startMode: string; serviceType: string }>,
  ): RootkitIndicator[] {
    const indicators: RootkitIndicator[] = [];
    const now = Date.now();

    for (const proc of processes) {
      const signals: RootkitSignal[] = [];
      const nameLower = (proc.name || '').toLowerCase();
      const cmdLower = (proc.cmdline || '').toLowerCase();
      const exeLower = (proc.exe || '').toLowerCase();

      // Known rootkit process name
      if (matchPatterns(nameLower, ROOTKIT_PROCESS_NAMES)) {
        signals.push({ type: 'known_rootkit_name', description: `Process name matches known rootkit: ${proc.name}`, value: proc.name, timestamp: now });
      }

      // Suspicious driver load from non-system path
      if ((exeLower.endsWith('.sys') || cmdLower.includes('driver') || cmdLower.includes('ntloaddriver'))
        && isSuspiciousPath(proc.exe || '')) {
        signals.push({ type: 'suspicious_driver_load', description: `Driver loaded from suspicious path: ${proc.exe}`, value: proc.exe, timestamp: now });
      }

      // SSDT hook indicators
      if (cmdLower.includes('ntsetsysteminformation') || cmdLower.includes('keaddsystemserviceTable') || cmdLower.includes('ssdt')) {
        signals.push({ type: 'ssdt_hook', description: `SSDT hooking indicators: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // IRP hook indicators
      if (cmdLower.includes('iocalldriver') && cmdLower.includes('majorfunction')) {
        signals.push({ type: 'irp_hook', description: `IRP hooking indicators: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      // Hidden process: process with no visible window from suspicious path
      if (isSuspiciousPath(proc.exe || '') && cmdLower.includes('-w hidden') && !nameLower.includes('powershell')) {
        signals.push({ type: 'hidden_process', description: `Hidden process from suspicious path: ${proc.exe}`, value: proc.exe, timestamp: now });
      }

      // Registry concealment
      if (cmdLower.includes('reg add') && (cmdLower.includes('hidden') || cmdLower.includes('conceal') || cmdLower.includes('services\\') && cmdLower.includes('description'))) {
        signals.push({ type: 'registry_concealment', description: `Registry concealment activity: ${proc.cmdline}`, value: proc.cmdline, timestamp: now });
      }

      if (signals.length >= 2) {
        indicators.push({
          processName: proc.name,
          pid: proc.pid,
          path: proc.exe || '',
          indicators: signals,
        });
      }
    }

    // Check services for rootkit indicators
    for (const svc of services) {
      const signals: RootkitSignal[] = [];
      const svcNameLower = (svc.name || '').toLowerCase();
      const svcPathLower = (svc.pathName || '').toLowerCase();
      const svcTypeLower = (svc.serviceType || '').toLowerCase();

      // Kernel driver service from suspicious path
      if (svcTypeLower.includes('kernel') && isSuspiciousPath(svc.pathName || '')) {
        signals.push({ type: 'suspicious_driver_load', description: `Kernel driver service from suspicious path: ${svc.pathName}`, value: svc.pathName, timestamp: now });
      }

      // Known rootkit service name
      if (matchPatterns(svcNameLower, ROOTKIT_PROCESS_NAMES)) {
        signals.push({ type: 'known_rootkit_name', description: `Service name matches known rootkit: ${svc.name}`, value: svc.name, timestamp: now });
      }

      // Hidden service: service with no description from suspicious path
      if (isSuspiciousPath(svcPathLower) && svcTypeLower.includes('kernel') && !svc.displayName) {
        signals.push({ type: 'hidden_service', description: `Hidden kernel driver service: ${svc.name}`, value: svc.name, timestamp: now });
      }

      if (signals.length >= 2) {
        indicators.push({
          processName: svc.name,
          pid: 0,
          path: svc.pathName || '',
          indicators: signals,
        });
      }
    }

    return indicators;
  },
};
