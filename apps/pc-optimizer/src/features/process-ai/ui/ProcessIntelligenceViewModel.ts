import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { ProcessAIEngine } from '../ProcessAIEngine';
import { ProcessManager } from '../ProcessManager';
import type { ProcessProvider } from '../ProcessScanner';
import type { ProcessAIReport } from '../types';
import { DEFAULT_PROCESS_CONFIG } from '../types';
import { RpcProcessProvider } from '../RpcProcessProvider';

export interface ProcessIntelligenceState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  report: ProcessAIReport | null;
  isScanning: boolean;
  lastScanAt: number | null;
}

export class ProcessIntelligenceViewModel extends ViewModel<ProcessIntelligenceState> {
  private engine: ProcessAIEngine;
  private manager: ProcessManager;
  private provider: ProcessProvider;

  constructor() {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      report: null,
      isScanning: false,
      lastScanAt: null,
    });

    this.manager = new ProcessManager(DEFAULT_PROCESS_CONFIG);
    this.provider = new RpcProcessProvider();
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
    this.setState({ isScanning: true, bootstrapError: null });
    try {
      const snapshot = await this.manager.scan();
      const report = this.engine.analyze(snapshot);
      this.setState({
        report,
        isScanning: false,
        lastScanAt: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Scan failed';
      this.setState({
        isScanning: false,
        bootstrapError: msg,
      });
      // Re-throw so bootstrap() can set the error state. The UI's
      // scan button handler catches the rejection to avoid unhandled
      // promise warnings — the error is already stored in state.
      throw e;
    }
  }

  override dispose(): void {
    this.engine.dispose();
    super.dispose();
  }
}
