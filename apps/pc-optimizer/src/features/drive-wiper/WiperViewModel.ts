/**
 * WiperViewModel — MVVM state for Drive Wiper / File Shredder.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { IWiperService } from './wiper.service';
import type { WiperState } from './wiper.types';

export class WiperViewModel extends ViewModel<WiperState> {
  constructor(private readonly service: IWiperService) {
    super({
      drives: [],
      paths: [],
      passes: 3,
      zeros: false,
      selectedDrive: '',
      loading: false,
      busy: false,
      message: null,
      error: null,
      lastResults: null,
      lastWipe: null,
    });
  }

  async bootstrap(): Promise<void> {
    this.setState({ loading: true, error: null });
    try {
      const { drives } = await this.service.drives();
      this.setState({
        drives,
        selectedDrive: drives.length > 0 ? drives[0]?.letter ?? '' : '',
        loading: false,
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  setPaths(paths: string[]) {
    this.setState({ paths });
  }

  setPasses(passes: number) {
    this.setState({ passes });
  }

  setZeros(zeros: boolean) {
    this.setState({ zeros });
  }

  setSelectedDrive(drive: string) {
    this.setState({ selectedDrive: drive });
  }

  async shred(paths?: string[]): Promise<void> {
    const targets = paths ?? this.state.paths;
    if (!targets.length) {
      this.setState({ error: 'Select files or folders to shred.' });
      return;
    }
    this.setState({ busy: true, error: null, message: null, lastResults: null });
    try {
      const result = await this.service.shred(targets, this.state.passes, this.state.zeros);
      this.setState({
        busy: false,
        message: result.success ? 'Shred completed' : 'Shred completed with errors',
        error: result.success ? null : result.message,
        lastResults: result.results,
      });
    } catch (err) {
      this.setState({
        busy: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async wipeFreeSpace(): Promise<void> {
    if (!this.state.selectedDrive) {
      this.setState({ error: 'Select a drive to wipe.' });
      return;
    }
    this.setState({ busy: true, error: null, message: null, lastWipe: null });
    try {
      const result = await this.service.wipeFreeSpace(
        this.state.selectedDrive,
        1,
        this.state.zeros
      );
      this.setState({
        busy: false,
        message: result.success ? result.message : null,
        error: result.success ? null : result.message,
        lastWipe: result,
      });
    } catch (err) {
      this.setState({
        busy: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
  }
}
