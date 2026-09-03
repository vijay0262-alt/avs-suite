/**
 * BackgroundProtectionService — keeps the protection engine running
 * even when the main window is hidden.
 *
 * Responsibilities:
 *   - Start/stop real-time monitoring via the Python backend
 *   - Poll protection status at a low frequency (every 30s)
 *   - Auto-restart monitors if they fail
 *   - Emit status changes to the TrayManager and NotificationManager
 *   - Handle pause/resume with timed expiry
 *
 * Resource usage targets:
 *   - CPU < 1% when idle
 *   - Memory < 150 MB
 *   - No UI polling — only backend status polling at 30s intervals
 */
import type { Logger } from '../ipc/registerAllHandlers';
import type { RpcClient } from '../ipc/pythonBridge';
import type { ProtectionState } from '../tray/traySettings';
import { isProtectionPaused, getPauseRemainingMs, updateTraySettings } from '../tray/traySettings';
import { showNotification, Notifications } from '../notifications/NotificationManager';

const STATUS_POLL_INTERVAL_MS = 30_000;  // 30 seconds
const PAUSE_CHECK_INTERVAL_MS = 60_000;  // Check pause expiry every minute

export class BackgroundProtectionService {
  private logger: Logger;
  private rpc: RpcClient | null;
  private statusTimer: NodeJS.Timeout | null = null;
  private pauseTimer: NodeJS.Timeout | null = null;
  private currentState: ProtectionState = 'protected';
  private onStateChange: (state: ProtectionState) => void;
  private monitoringActive = false;

  constructor(
    logger: Logger,
    rpc: RpcClient | null,
    onStateChange: (state: ProtectionState) => void,
  ) {
    this.logger = logger;
    this.rpc = rpc;
    this.onStateChange = onStateChange;
  }

  /**
   * Start the background protection service.
   * Called after the app is ready and the backend is up.
   */
  async start(): Promise<void> {
    this.logger.info('[bg-protection] Starting background protection service');

    // Start real-time monitoring via backend
    await this.startMonitoring();

    // Start status polling
    this.statusTimer = setInterval(() => this.pollStatus(), STATUS_POLL_INTERVAL_MS);

    // Start pause expiry checker
    this.pauseTimer = setInterval(() => this.checkPauseExpiry(), PAUSE_CHECK_INTERVAL_MS);

    this.setState('protected');
  }

  /**
   * Start real-time monitoring via the Python backend.
   */
  private async startMonitoring(): Promise<void> {
    if (!this.rpc) {
      this.logger.warn('[bg-protection] No RPC client — monitoring disabled');
      return;
    }

    try {
      await this.rpc.call('security.startRealtimeMonitoring');
      this.monitoringActive = true;
      this.logger.info('[bg-protection] Real-time monitoring started');
    } catch (err) {
      // The method might not exist yet — that's OK, we'll retry
      this.logger.warn('[bg-protection] Could not start real-time monitoring (backend may not support it yet)', err);
      this.monitoringActive = false;
    }
  }

  /**
   * Stop real-time monitoring.
   */
  async stopMonitoring(): Promise<void> {
    if (!this.rpc || !this.monitoringActive) return;

    try {
      await this.rpc.call('security.stopRealtimeMonitoring');
      this.monitoringActive = false;
      this.logger.info('[bg-protection] Real-time monitoring stopped');
    } catch (err) {
      this.logger.warn('[bg-protection] Could not stop real-time monitoring', err);
    }
  }

  /**
   * Poll the backend for protection status.
   * If monitoring has failed, attempt to restart it.
   */
  private async pollStatus(): Promise<void> {
    if (isProtectionPaused()) {
      this.setState('paused');
      return;
    }

    if (!this.rpc) return;

    try {
      const status = await this.rpc.call<{
        monitoring: boolean;
        threatsActive: number;
        lastEvent?: string;
      }>('security.getProtectionStatus');

      if (!status.monitoring && this.monitoringActive) {
        // Monitoring has stopped unexpectedly — restart it
        this.logger.warn('[bg-protection] Monitoring stopped unexpectedly — restarting');
        showNotification({
          title: 'Protection Restarted',
          body: 'AVS AI Shield detected that real-time monitoring was interrupted and has restarted it.',
          category: 'predictionAlert',
        });
        await this.startMonitoring();
      }

      if (status.threatsActive > 0) {
        this.setState('threat');
      } else if (status.monitoring) {
        this.setState('protected');
      } else {
        this.setState('warning');
      }
    } catch (err) {
      // Backend unreachable — set warning state
      this.logger.warn('[bg-protection] Status poll failed', err);
      this.setState('warning');
    }
  }

  /**
   * Check if a pause has expired and auto-resume.
   */
  private checkPauseExpiry(): void {
    if (getPauseRemainingMs() === 0 && this.currentState === 'paused') {
      this.logger.info('[bg-protection] Pause expired — resuming protection');
      this.setState('protected');
    }
  }

  /**
   * Pause protection for a specified duration.
   */
  pauseProtection(durationMs: number): void {
    updateTraySettings({ pauseUntil: Date.now() + durationMs });
    this.setState('paused');
    this.logger.info(`[bg-protection] Protection paused for ${durationMs / 60_000} minutes`);
  }

  /**
   * Resume protection immediately.
   */
  resumeProtection(): void {
    updateTraySettings({ pauseUntil: null });
    this.setState('protected');
    this.logger.info('[bg-protection] Protection resumed');
  }

  /**
   * Set the current protection state and notify listeners.
   */
  private setState(state: ProtectionState): void {
    if (state === this.currentState) return;
    const oldState = this.currentState;
    this.currentState = state;
    this.logger.info(`[bg-protection] State: ${oldState} → ${state}`);
    this.onStateChange(state);
  }

  /**
   * Get the current protection state.
   */
  getState(): ProtectionState {
    return this.currentState;
  }

  /**
   * Update the RPC client (e.g. after backend reconnection).
   */
  setRpcClient(rpc: RpcClient | null): void {
    this.rpc = rpc;
  }

  /**
   * Notify that a scan has started.
   */
  notifyScanStarted(): void {
    this.setState('scanning');
  }

  /**
   * Notify that a scan has completed.
   */
  notifyScanCompleted(threatsFound: number, score: number): void {
    Notifications.scanComplete(threatsFound, score);
    this.setState(threatsFound > 0 ? 'threat' : 'protected');
  }

  /**
   * Shutdown the background protection service.
   */
  async shutdown(): Promise<void> {
    this.logger.info('[bg-protection] Shutting down');
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.pauseTimer) {
      clearInterval(this.pauseTimer);
      this.pauseTimer = null;
    }
    await this.stopMonitoring();
  }
}
