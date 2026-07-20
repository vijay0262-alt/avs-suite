/**
 * UpdaterViewModel — MVVM state for the Software Updater.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { IUpdaterService } from './updater.service';
import type { Upgrade } from './updater.types';

export interface UpdaterState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;

  available: boolean;
  reason: string | null;

  loading: boolean;
  upgrades: Upgrade[];
  busyIds: Set<string>;
  actionMessage: string | null;
  actionError: string | null;
}

export class UpdaterViewModel extends ViewModel<UpdaterState> {
  constructor(private readonly service: IUpdaterService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      available: false,
      reason: null,
      loading: false,
      upgrades: [],
      busyIds: new Set<string>(),
      actionMessage: null,
      actionError: null,
    });
  }

  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'loading' || this.state.bootstrap === 'ready') return;
    this.setState({ bootstrap: 'loading' });
    try {
      const { available } = await this.service.available();
      this.setState({
        available,
        bootstrap: 'ready',
        reason: available ? null : 'Windows Package Manager (winget) is not installed',
      });
      if (available) {
        await this.refresh();
      }
    } catch (err) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async refresh(): Promise<void> {
    this.setState({ loading: true, actionError: null, actionMessage: null });
    try {
      const result = await this.service.list();
      this.setState({
        available: result.available,
        reason: result.reason,
        upgrades: result.upgrades,
        loading: false,
      });
    } catch (err) {
      this.setState({
        loading: false,
        actionError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async upgrade(packageId: string): Promise<void> {
    const busy = new Set(this.state.busyIds);
    busy.add(packageId);
    this.setState({ busyIds: busy });
    try {
      const result = await this.service.upgrade(packageId);
      this.setState({
        actionMessage: result.success ? result.message : null,
        actionError: result.success ? null : result.message,
      });
    } catch (err) {
      this.setState({ actionError: err instanceof Error ? err.message : String(err) });
    } finally {
      const next = new Set(this.state.busyIds);
      next.delete(packageId);
      this.setState({ busyIds: next });
    }
  }

  async upgradeAll(): Promise<void> {
    this.setState({ loading: true, actionError: null, actionMessage: null });
    try {
      const result = await this.service.upgradeAll();
      this.setState({
        loading: false,
        actionMessage: result.success ? result.message : null,
        actionError: result.success ? null : result.message,
      });
    } catch (err) {
      this.setState({
        loading: false,
        actionError: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
