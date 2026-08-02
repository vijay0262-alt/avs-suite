import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { ProcessAIEngine } from '../ProcessAIEngine';
import { ProcessManager } from '../ProcessManager';
import type { ProcessProvider } from '../ProcessScanner';
import type { ProcessAIReport, ProcessEntry, ProcessInfo, ProcessSensors } from '../types';
import { DEFAULT_PROCESS_CONFIG } from '../types';

export interface ProcessIntelligenceState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  report: ProcessAIReport | null;
  isScanning: boolean;
  lastScanAt: number | null;
}

class MockProcessProvider implements ProcessProvider {
  readonly id = 'mock-process-provider';
  readonly source = 'mock';

  async initialize(): Promise<void> {}
  dispose(): void {}
  isAvailable(): boolean { return true; }

  async scan(): Promise<ProcessEntry[]> {
    const now = Date.now();
    const entries: ProcessEntry[] = [
      {
        info: this.makeInfo(4, 'System', 'System', 0, '', 99, 'idle', 'system', 'critical_system', now - 600000),
        sensors: this.makeSensors(1.2, 8192, 0, 0, 0, 0, 0.5),
      },
      {
        info: this.makeInfo(104, 'explorer.exe', 'Windows Explorer', 4, 'System', 100, 'normal', 'windows', 'safe', now - 599000),
        sensors: this.makeSensors(3.5, 156, 0.1, 0.05, 0, 0, 1.2),
      },
      {
        info: this.makeInfo(512, 'chrome.exe', 'Google Chrome', 104, 'explorer.exe', 90, 'normal', 'browser', 'safe', now - 300000),
        sensors: this.makeSensors(28.4, 1024, 2.5, 1.8, 15, 350, 8.5),
      },
      {
        info: this.makeInfo(788, 'Code.exe', 'Visual Studio Code', 104, 'explorer.exe', 90, 'normal', 'development', 'safe', now - 600000),
        sensors: this.makeSensors(12.1, 512, 0.3, 0.2, 5, 120, 4.2),
      },
      {
        info: this.makeInfo(1232, 'svchost.exe', 'Windows Service Host', 4, 'System', 100, 'normal', 'system', 'critical_system', now - 600000),
        sensors: this.makeSensors(0.8, 64, 0, 0, 0, 0, 0.3),
      },
    ];

    return entries;
  }

  private makeInfo(
    pid: number, name: string, displayName: string, parentPid: number,
    parentName: string, priority: number, priorityClass: string,
    category: ProcessInfo['category'], safety: ProcessInfo['safetyLevel'],
    launchTime: number,
  ): ProcessInfo {
    return {
      pid, name, displayName, parentPid, parentName,
      publisher: category === 'system' || category === 'windows' ? 'Microsoft Corporation' : 'Unknown',
      description: displayName,
      executablePath: `C:\\Windows\\System32\\${name}`,
      signatureStatus: category === 'system' || category === 'windows' ? 'valid' : 'unknown',
      signatureIssuer: category === 'system' || category === 'windows' ? 'Microsoft Windows' : '',
      launchTime,
      priority: priorityClass as ProcessInfo['priority'],
      integrityLevel: category === 'system' ? 'system' : 'high',
      threadCount: Math.floor(Math.random() * 20) + 1,
      handleCount: Math.floor(Math.random() * 500) + 10,
      windowTitle: '',
      userAccount: 'CurrentUser',
      isService: category === 'system',
      serviceName: category === 'system' ? name.replace('.exe', '') : '',
      isStartupEntry: false,
      startupEntryName: '',
      category,
      safetyLevel: safety,
    };
  }

  private makeSensors(
    cpu: number, memMB: number, diskR: number, diskW: number,
    gpu: number, vram: number, power: number,
  ): ProcessSensors {
    return {
      cpuUsagePercent: cpu,
      perCoreUsage: [cpu, cpu * 0.8, cpu * 0.6, cpu * 0.4],
      memoryMB: memMB,
      privateMemoryMB: memMB * 0.7,
      workingSetMB: memMB,
      virtualMemoryMB: memMB * 2,
      diskReadMBps: diskR,
      diskWriteMBps: diskW,
      gpuUsagePercent: gpu,
      vramMB: vram,
      networkDownloadMbps: 0,
      networkUploadMbps: 0,
      powerDrawEstimateW: power,
    };
  }
}

export class ProcessIntelligenceViewModel extends ViewModel<ProcessIntelligenceState> {
  private engine: ProcessAIEngine;
  private manager: ProcessManager;
  private provider: MockProcessProvider;

  constructor() {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      report: null,
      isScanning: false,
      lastScanAt: null,
    });

    this.manager = new ProcessManager(DEFAULT_PROCESS_CONFIG);
    this.provider = new MockProcessProvider();
    this.manager.registerProvider(this.provider);
    this.engine = new ProcessAIEngine(DEFAULT_PROCESS_CONFIG, this.manager);
  }

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading' });
    try {
      await this.manager.initialize();
      await this.scan();
      this.setState({ bootstrap: 'ready' });
    } catch (e) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: e instanceof Error ? e.message : 'Failed to initialize process intelligence',
      });
    }
  }

  async scan(): Promise<void> {
    this.setState({ isScanning: true });
    try {
      const snapshot = await this.manager.scan();
      const report = this.engine.analyze(snapshot);
      this.setState({
        report,
        isScanning: false,
        lastScanAt: Date.now(),
      });
    } catch (e) {
      this.setState({
        isScanning: false,
        bootstrapError: e instanceof Error ? e.message : 'Scan failed',
      });
    }
  }

  override dispose(): void {
    this.engine.dispose();
    super.dispose();
  }
}
