/**
 * JunkCleanerViewModel — MVVM state machine for the Junk Cleaner page.
 *
 * Responsibilities:
 *   - Load the catalog of cleaners once on construction.
 *   - Start / cancel / restart scans via the injected service.
 *   - Poll ``cleaner.scan.status`` while a scan is running (~4 Hz).
 *   - Lazy-load result pages when the user opens the details table.
 *   - Track per-cleaner "selected" checkboxes (for the future cleaning
 *     phase; scan-only for now).
 *
 * The class is deliberately React-free. React binding lives in
 * ``JunkCleanerPage.tsx`` via ``useViewModel`` from ``@avs/core``.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type {
  CleanerInfo,
  CleanerSummary,
  ScanItem,
  ScanStatusSnapshot,
} from './junkCleaner.types';
import type { JunkCleanerService } from './junkCleaner.service';

export interface JunkCleanerState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  catalog: CleanerInfo[];
  selected: Set<string>;
  activeTaskId: string | null;
  snapshot: ScanStatusSnapshot;
  detailsCleanerId: string | null;
  detailsItems: ScanItem[];
  detailsLoading: boolean;
  detailsError: string | null;
  lastScanError: string | null;
}

const POLL_INTERVAL_MS = 250;
const DETAILS_PAGE_SIZE = 500;

export class JunkCleanerViewModel extends ViewModel<JunkCleanerState> {
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly service: JunkCleanerService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      catalog: [],
      selected: new Set<string>(),
      activeTaskId: null,
      snapshot: { present: false },
      detailsCleanerId: null,
      detailsItems: [],
      detailsLoading: false,
      detailsError: null,
      lastScanError: null,
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------
  async bootstrap(): Promise<void> {
    if (this.state.bootstrap === 'loading' || this.state.bootstrap === 'ready') return;
    this.setState({ bootstrap: 'loading', bootstrapError: null });
    try {
      const catalog = await this.service.list();
      this.setState({
        bootstrap: 'ready',
        catalog,
        // Pre-select every cleaner by default (parity with commercial tools).
        selected: new Set(catalog.map((c) => c.id)),
      });
    } catch (err) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  override dispose(): void {
    this.stopPolling();
    super.dispose();
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  toggleSelection(cleanerId: string): void {
    const next = new Set(this.state.selected);
    if (next.has(cleanerId)) next.delete(cleanerId);
    else next.add(cleanerId);
    this.setState({ selected: next });
  }

  setAllSelected(value: boolean): void {
    this.setState({
      selected: value ? new Set(this.state.catalog.map((c) => c.id)) : new Set(),
    });
  }

  async startScan(): Promise<void> {
    if (this.isRunning()) return;
    const only = Array.from(this.state.selected);
    if (only.length === 0) {
      this.setState({ lastScanError: 'Select at least one category to scan.' });
      return;
    }
    this.setState({
      lastScanError: null,
      snapshot: { present: false },
      detailsCleanerId: null,
      detailsItems: [],
    });
    try {
      const { taskId } = await this.service.startScan(only);
      this.setState({ activeTaskId: taskId });
      this.startPolling();
    } catch (err) {
      this.setState({ lastScanError: err instanceof Error ? err.message : String(err) });
    }
  }

  async cancelScan(): Promise<void> {
    const taskId = this.state.activeTaskId;
    if (!taskId) return;
    try {
      await this.service.cancel(taskId);
    } catch (err) {
      this.setState({ lastScanError: err instanceof Error ? err.message : String(err) });
    }
  }

  async rescan(): Promise<void> {
    await this.startScan();
  }

  async openDetails(cleanerId: string): Promise<void> {
    const taskId = this.state.activeTaskId;
    if (!taskId) return;
    this.setState({
      detailsCleanerId: cleanerId,
      detailsItems: [],
      detailsLoading: true,
      detailsError: null,
    });
    try {
      const collected: ScanItem[] = [];
      let offset = 0;
      // Chunk-load so opening details on a huge cleaner doesn't lock.
      for (;;) {
        const page = await this.service.getResults(taskId, cleanerId, offset, DETAILS_PAGE_SIZE);
        collected.push(...page.items);
        if (page.items.length < DETAILS_PAGE_SIZE) break;
        offset += page.items.length;
        // Yield to the event loop so state updates paint incrementally.
        this.setState({ detailsItems: [...collected] });
        await new Promise((r) => setTimeout(r, 0));
      }
      this.setState({ detailsItems: collected, detailsLoading: false });
    } catch (err) {
      this.setState({
        detailsLoading: false,
        detailsError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  closeDetails(): void {
    this.setState({ detailsCleanerId: null, detailsItems: [], detailsError: null });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  isRunning(): boolean {
    return this.state.snapshot.status === 'running';
  }

  currentCleanerSummary(cleanerId: string): CleanerSummary | undefined {
    return this.state.snapshot.cleaners?.find((c) => c.id === cleanerId);
  }

  // ------------------------------------------------------------------
  // Polling
  // ------------------------------------------------------------------
  private startPolling(): void {
    this.stopPolling();
    // Fire immediately so the UI reflects the just-started scan.
    void this.pollOnce();
    this.pollTimer = setInterval(() => void this.pollOnce(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    const taskId = this.state.activeTaskId;
    if (!taskId) return this.stopPolling();
    try {
      const snap = await this.service.getStatus(taskId);
      this.setState({ snapshot: snap });
      if (snap.status && snap.status !== 'running') {
        this.stopPolling();
      }
    } catch (err) {
      this.setState({ lastScanError: err instanceof Error ? err.message : String(err) });
      this.stopPolling();
    }
  }
}
