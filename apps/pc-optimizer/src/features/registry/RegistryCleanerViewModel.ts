/**
 * RegistryCleanerViewModel — MVVM state for the Registry Cleaner.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { IRegistryService } from './registry.service';
import type {
  RegistryIssue,
  RegistryCategory,
  RegistryBackup,
  RegistryCleanResult,
} from './registry.types';
import { optimizationEventBus } from '../health';

export interface RegistryState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;

  categories: RegistryCategory[];

  scanning: boolean;
  scanError: string | null;
  issues: RegistryIssue[];
  breakdown: Record<string, number>;
  selected: Set<string>;

  cleaning: boolean;
  cleanResult: RegistryCleanResult | null;
  cleanError: string | null;

  backups: RegistryBackup[];
}

export class RegistryCleanerViewModel extends ViewModel<RegistryState> {
  constructor(private readonly service: IRegistryService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      categories: [],
      scanning: false,
      scanError: null,
      issues: [],
      breakdown: {},
      selected: new Set<string>(),
      cleaning: false,
      cleanResult: null,
      cleanError: null,
      backups: [],
    });
  }

  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'loading' || this.state.bootstrap === 'ready') return;
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      const [cats, backups] = await Promise.all([
        this.service.listCategories(),
        this.service.listBackups(),
      ]);
      this.setState({
        categories: cats.categories,
        backups: backups.backups,
        bootstrap: 'ready',
      });
    } catch (err) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async scan(categories?: string[]): Promise<void> {
    this.setState({ scanning: true, scanError: null, cleanResult: null });
    try {
      const result = await this.service.scan(categories);
      this.setState({
        issues: result.issues,
        breakdown: result.categoryBreakdown,
        // Pre-select all discovered issues by default.
        selected: new Set(result.issues.map((i) => i.id)),
        scanning: false,
      });
    } catch (err) {
      this.setState({
        scanning: false,
        scanError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  toggleIssue(id: string): void {
    const selected = new Set(this.state.selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    this.setState({ selected });
  }

  selectAll(): void {
    this.setState({ selected: new Set(this.state.issues.map((i) => i.id)) });
  }

  selectNone(): void {
    this.setState({ selected: new Set<string>() });
  }

  async clean(): Promise<void> {
    const toFix = this.state.issues.filter((i) => this.state.selected.has(i.id));
    if (toFix.length === 0) return;
    this.setState({ cleaning: true, cleanError: null });
    try {
      const result = await this.service.clean(toFix);
      // Remove fixed issues from the list and refresh backups.
      const fixedIds = new Set(toFix.map((i) => i.id));
      const remaining = this.state.issues.filter((i) => !fixedIds.has(i.id));
      const backups = await this.service.listBackups();
      this.setState({
        cleaning: false,
        cleanResult: result,
        issues: remaining,
        selected: new Set<string>(),
        backups: backups.backups,
      });
      // Emit optimization event so Dashboard refreshes health score
      optimizationEventBus.emit({
        moduleId: 'registry',
        action: 'clean',
        itemsProcessed: result.fixed,
        timestamp: Date.now(),
      });
    } catch (err) {
      this.setState({
        cleaning: false,
        cleanError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async restore(backupId: string): Promise<void> {
    try {
      await this.service.restore(backupId);
    } catch (err) {
      this.setState({ cleanError: err instanceof Error ? err.message : String(err) });
    }
  }
}
