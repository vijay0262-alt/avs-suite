/**
 * UninstallerViewModel — MVVM state for the Uninstaller.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { IUninstallerService } from './uninstaller.service';
import type { Program } from './uninstaller.types';

export type SortKey = 'name' | 'size' | 'date';

export interface UninstallerState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;

  programs: Program[];
  total: number;
  totalSizeBytes: number;

  search: string;
  sortBy: SortKey;

  busyId: string | null;
  actionMessage: string | null;
  actionError: string | null;
}

export class UninstallerViewModel extends ViewModel<UninstallerState> {
  constructor(private readonly service: IUninstallerService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      programs: [],
      total: 0,
      totalSizeBytes: 0,
      search: '',
      sortBy: 'name',
      busyId: null,
      actionMessage: null,
      actionError: null,
    });
  }

  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'loading' || this.state.bootstrap === 'ready') return;
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    await this.load();
  }

  async load(): Promise<void> {
    try {
      const result = await this.service.list(false);
      this.setState({
        programs: result.programs,
        total: result.total,
        totalSizeBytes: result.totalSizeBytes,
        bootstrap: 'ready',
      });
    } catch (err) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  setSearch(search: string): void {
    this.setState({ search });
  }

  setSortBy(sortBy: SortKey): void {
    this.setState({ sortBy });
  }

  get visiblePrograms(): Program[] {
    const q = this.state.search.trim().toLowerCase();
    let list = this.state.programs;
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) || p.publisher.toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    switch (this.state.sortBy) {
      case 'size':
        sorted.sort((a, b) => b.sizeBytes - a.sizeBytes);
        break;
      case 'date':
        sorted.sort((a, b) => (b.installDate || '').localeCompare(a.installDate || ''));
        break;
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }

  async uninstall(program: Program): Promise<void> {
    this.setState({ busyId: program.id, actionMessage: null, actionError: null });
    try {
      const result = await this.service.uninstall(program);
      this.setState({
        busyId: null,
        actionMessage: result.success
          ? `${program.name}: ${result.message}`
          : null,
        actionError: result.success ? null : result.message,
      });
    } catch (err) {
      this.setState({
        busyId: null,
        actionError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
