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
};
