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
import { optimizationEventBus, OptimizationEventType } from '../health';
import { currentEdition, canUse } from '../licensing/FeatureGate';
import { getEditionLimit } from '../licensing/editionLimits';
import { useSyncStore, planToEdition } from '../sync/syncStore';

const FREE_ISSUE_LIMIT = 20;

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
      const isFree = currentEdition() === 'free';
      const hasUnlimited = canUse('registry.fix');
      // In Free edition, pre-select only up to 20 issues
      const selectedIds = (isFree && !hasUnlimited)
        ? new Set(result.issues.slice(0, FREE_ISSUE_LIMIT).map((i) => i.id))
        : new Set(result.issues.map((i) => i.id));
      this.setState({
        issues: result.issues,
        breakdown: result.categoryBreakdown,
        selected: selectedIds,
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
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      // Enforce Free edition limit when selecting
      const isFree = currentEdition() === 'free';
      const hasUnlimited = canUse('registry.fix');
      if (isFree && !hasUnlimited && selected.size >= FREE_ISSUE_LIMIT) {
        return; // silently ignore — limit reached
      }
      selected.add(id);
    }
    this.setState({ selected });
  }

  /**
   * Returns the maximum number of issues that can be fixed in the current edition.
   * Returns null for unlimited (Professional).
   */
  getFixLimit(): number | null {
    return getEditionLimit('registryCleanerIssuesPerRun', currentEdition() === 'professional');
  }

  /**
   * Whether the current edition has unlimited repairs.
   */
  hasUnlimitedRepairs(): boolean {
    return currentEdition() === 'professional' || canUse('registry.fix');
  }

  selectAll(): void {
    const isFree = currentEdition() === 'free';
    const hasUnlimited = canUse('registry.fix');
    if (isFree && !hasUnlimited) {
      // Free edition: limit selection to 20 issues
      this.setState({ selected: new Set(this.state.issues.slice(0, FREE_ISSUE_LIMIT).map((i) => i.id)) });
    } else {
      this.setState({ selected: new Set(this.state.issues.map((i) => i.id)) });
    }
  }

  selectNone(): void {
    this.setState({ selected: new Set<string>() });
  }

  async clean(): Promise<void> {
    const toFix = this.state.issues.filter((i) => this.state.selected.has(i.id));
    if (toFix.length === 0) return;

    // Enforce Free edition limit: max 20 issues per scan
    // Read edition directly from sync store to avoid stale FeatureGate state
    let isFree = currentEdition() === 'free';
    let hasUnlimited = canUse('registry.fix');
    try {
      const syncData = useSyncStore.getState().data;
      if (syncData) {
        isFree = planToEdition(syncData.subscription.plan, syncData.license?.edition) !== 'PROFESSIONAL';
        hasUnlimited = !isFree; // Pro users have unlimited repairs
      }
    } catch {
      // sync store not available — fall back to FeatureGate
    }
    if (isFree && !hasUnlimited && toFix.length > FREE_ISSUE_LIMIT) {
      this.setState({
        cleanError: `Free edition repairs up to ${FREE_ISSUE_LIMIT} issues per scan. Upgrade to Professional for unlimited repairs.`,
      });
      return;
    }

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
        type: OptimizationEventType.RegistryOptimized,
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
      const backups = await this.service.listBackups();
      this.setState({ backups: backups.backups, issues: [], selected: new Set<string>(), cleanResult: null });
      optimizationEventBus.emit({
        type: OptimizationEventType.RegistryOptimized,
        moduleId: 'registry',
        action: 'restore',
        itemsProcessed: 1,
        timestamp: Date.now(),
      });
    } catch (err) {
      this.setState({ cleanError: err instanceof Error ? err.message : String(err) });
    }
  }
}
