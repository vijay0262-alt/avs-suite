/**
 * JunkCleanerViewModel — MVVM state machine for the Junk Cleaner page.
 *
 * Responsibilities:
 *   - Load the catalog of cleaners once on construction.
 *   - Start / cancel / restart scans via the injected service.
 *   - Poll ``cleaner.scan.status`` while a scan is running (~4 Hz).
 *   - Lazy-load result pages when the user opens the details table.
 *   - Track per-cleaner "selected" checkboxes.
 *   - Preview / execute / cancel a safe-clean pass (~3 Hz polling).
 *   - Load the searchable cleaning history log.
 *
 * The class is deliberately React-free. React binding lives in
 * ``JunkCleanerPage.tsx`` via ``useViewModel`` from ``@avs/core``.
 */
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type {
  CleanerInfo,
  CleanerSummary,
  CleaningLogEntry,
  CleaningPreview,
  CleaningStatusSnapshot,
  ScanItem,
  ScanStatusSnapshot,
} from './junkCleaner.types';
import type { JunkCleanerService } from './junkCleaner.service';

export type ConfirmStep = 'closed' | 'preview' | 'confirm' | 'running' | 'summary';

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

  // Cleaning flow
  cleaningStep: ConfirmStep;
  cleaningPreview: CleaningPreview | null;
  cleaningPreviewLoading: boolean;
  cleaningPreviewError: string | null;
  activeCleaningTaskId: string | null;
  cleaningSnapshot: CleaningStatusSnapshot;
  lastCleaningError: string | null;

  // History log
  historyEntries: CleaningLogEntry[];
  historyTotal: number;
  historyLoading: boolean;
  historyError: string | null;
  historyQuery: string;
  historyCategory: string | null;
  historyResultFilter: string | null;
}

const SCAN_POLL_INTERVAL_MS = 250;
const CLEAN_POLL_INTERVAL_MS = 300;
const DETAILS_PAGE_SIZE = 500;

export class JunkCleanerViewModel extends ViewModel<JunkCleanerState> {
  private scanPollTimer: ReturnType<typeof setInterval> | null = null;
  private cleanPollTimer: ReturnType<typeof setInterval> | null = null;

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

      cleaningStep: 'closed',
      cleaningPreview: null,
      cleaningPreviewLoading: false,
      cleaningPreviewError: null,
      activeCleaningTaskId: null,
      cleaningSnapshot: { present: false },
      lastCleaningError: null,

      historyEntries: [],
      historyTotal: 0,
      historyLoading: false,
      historyError: null,
      historyQuery: '',
      historyCategory: null,
      historyResultFilter: null,
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
    this.stopScanPolling();
    this.stopCleanPolling();
    super.dispose();
  }

  // ==================================================================
  // Selection / scan flow
  // ==================================================================
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
    if (this.isScanRunning()) return;
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
      this.startScanPolling();
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
      for (;;) {
        const page = await this.service.getResults(taskId, cleanerId, offset, DETAILS_PAGE_SIZE);
        collected.push(...page.items);
        if (page.items.length < DETAILS_PAGE_SIZE) break;
        offset += page.items.length;
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

  // ==================================================================
  // Safe cleaning flow — preview → confirm → execute → summary
  // ==================================================================
  async openPreview(): Promise<void> {
    const taskId = this.state.activeTaskId;
    if (!taskId) return;
    // Only preview categories the user has ticked *and* that had results.
    const eligible = Array.from(this.state.selected).filter((id) => {
      const s = this.currentCleanerSummary(id);
      return (s?.totalFiles ?? 0) > 0;
    });
    if (eligible.length === 0) {
      this.setState({ lastCleaningError: 'No categories with files to clean.' });
      return;
    }
    this.setState({
      cleaningStep: 'preview',
      cleaningPreview: null,
      cleaningPreviewLoading: true,
      cleaningPreviewError: null,
      lastCleaningError: null,
    });
    try {
      const preview = await this.service.previewClean(taskId, eligible);
      this.setState({ cleaningPreview: preview, cleaningPreviewLoading: false });
    } catch (err) {
      this.setState({
        cleaningPreviewLoading: false,
        cleaningPreviewError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  advanceToConfirm(): void {
    if (!this.state.cleaningPreview) return;
    if (this.state.cleaningPreview.totalFiles === 0) return;
    this.setState({ cleaningStep: 'confirm' });
  }

  cancelCleaningFlow(): void {
    this.setState({
      cleaningStep: 'closed',
      cleaningPreview: null,
      cleaningPreviewError: null,
    });
  }

  async confirmAndExecute(): Promise<void> {
    const taskId = this.state.activeTaskId;
    const preview = this.state.cleaningPreview;
    if (!taskId || !preview) return;
    const only = preview.cleaners.filter((c) => c.totalFiles > 0).map((c) => c.id);
    if (only.length === 0) return;

    this.setState({ cleaningStep: 'running', lastCleaningError: null });
    try {
      const { cleaningTaskId } = await this.service.executeClean(taskId, only);
      this.setState({
        activeCleaningTaskId: cleaningTaskId,
        cleaningSnapshot: { present: false },
      });
      this.startCleanPolling();
    } catch (err) {
      this.setState({
        cleaningStep: 'preview',
        lastCleaningError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async cancelCleaning(): Promise<void> {
    const cleaningId = this.state.activeCleaningTaskId;
    if (!cleaningId) return;
    try {
      await this.service.cancelClean(cleaningId);
    } catch (err) {
      this.setState({ lastCleaningError: err instanceof Error ? err.message : String(err) });
    }
  }

  closeCleaningSummary(): void {
    this.setState({
      cleaningStep: 'closed',
      cleaningSnapshot: { present: false },
      cleaningPreview: null,
      activeCleaningTaskId: null,
    });
  }

  // ==================================================================
  // Cleaning log / history
  // ==================================================================
  async loadHistory(reset = false): Promise<void> {
    if (reset) {
      this.setState({ historyEntries: [], historyTotal: 0 });
    }
    this.setState({ historyLoading: true, historyError: null });
    try {
      const page = await this.service.getLogs({
        query: this.state.historyQuery || undefined,
        category: this.state.historyCategory ?? undefined,
        result: this.state.historyResultFilter ?? undefined,
        offset: 0,
        limit: 200,
      });
      this.setState({
        historyEntries: page.entries,
        historyTotal: page.total,
        historyLoading: false,
      });
    } catch (err) {
      this.setState({
        historyLoading: false,
        historyError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  setHistoryQuery(q: string): void {
    this.setState({ historyQuery: q });
  }
  setHistoryCategory(c: string | null): void {
    this.setState({ historyCategory: c });
  }
  setHistoryResultFilter(r: string | null): void {
    this.setState({ historyResultFilter: r });
  }

  // ==================================================================
  // Helpers
  // ==================================================================
  isScanRunning(): boolean {
    return this.state.snapshot.status === 'running';
  }

  isCleaningRunning(): boolean {
    return this.state.cleaningSnapshot.status === 'running';
  }

  currentCleanerSummary(cleanerId: string): CleanerSummary | undefined {
    return this.state.snapshot.cleaners?.find((c) => c.id === cleanerId);
  }

  // ==================================================================
  // Polling — one timer per lifecycle
  // ==================================================================
  private startScanPolling(): void {
    this.stopScanPolling();
    void this.pollScanOnce();
    this.scanPollTimer = setInterval(() => void this.pollScanOnce(), SCAN_POLL_INTERVAL_MS);
  }

  private stopScanPolling(): void {
    if (this.scanPollTimer) {
      clearInterval(this.scanPollTimer);
      this.scanPollTimer = null;
    }
  }

  private async pollScanOnce(): Promise<void> {
    const taskId = this.state.activeTaskId;
    if (!taskId) return this.stopScanPolling();
    try {
      const snap = await this.service.getStatus(taskId);
      this.setState({ snapshot: snap });
      if (snap.status && snap.status !== 'running') this.stopScanPolling();
    } catch (err) {
      this.setState({ lastScanError: err instanceof Error ? err.message : String(err) });
      this.stopScanPolling();
    }
  }

  private startCleanPolling(): void {
    this.stopCleanPolling();
    void this.pollCleanOnce();
    this.cleanPollTimer = setInterval(() => void this.pollCleanOnce(), CLEAN_POLL_INTERVAL_MS);
  }

  private stopCleanPolling(): void {
    if (this.cleanPollTimer) {
      clearInterval(this.cleanPollTimer);
      this.cleanPollTimer = null;
    }
  }

  private async pollCleanOnce(): Promise<void> {
    const taskId = this.state.activeCleaningTaskId;
    if (!taskId) return this.stopCleanPolling();
    try {
      const snap = await this.service.getCleaningStatus(taskId);
      this.setState({ cleaningSnapshot: snap });
      if (snap.status && snap.status !== 'running') {
        this.stopCleanPolling();
        this.setState({ cleaningStep: 'summary' });
        // Auto-refresh history so the new run shows in the log immediately.
        void this.loadHistory(true);
      }
    } catch (err) {
      this.setState({ lastCleaningError: err instanceof Error ? err.message : String(err) });
      this.stopCleanPolling();
    }
  }
}
