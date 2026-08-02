/**
 * ProtectionSession — tracks the current protection session.
 */
import type { ProtectionSession as ProtectionSessionData, ProtectionMode, ProtectionState } from './types';

export class ProtectionSessionManager {
  private session: ProtectionSessionData | null = null;

  start(mode: ProtectionMode): ProtectionSessionData {
    this.session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startedAt: Date.now(),
      endedAt: null,
      mode,
      state: 'running',
      eventsProcessed: 0,
      threatsDetected: 0,
      threatsBlocked: 0,
      investigationsTriggered: 0,
      remediationsTriggered: 0,
      notificationsSent: 0,
      uptime: 0,
      lastEventAt: null,
    };
    return { ...this.session };
  }

  end(): ProtectionSessionData | null {
    if (!this.session) return null;
    this.session.endedAt = Date.now();
    this.session.state = 'stopped';
    this.session.uptime = this.session.endedAt - this.session.startedAt;
    return { ...this.session };
  }

  get(): ProtectionSessionData | null {
    if (!this.session) return null;
    return { ...this.session, uptime: this.session.endedAt ? this.session.endedAt - this.session.startedAt : Date.now() - this.session.startedAt };
  }

  isActive(): boolean {
    return this.session !== null && this.session.state === 'running';
  }

  recordEvent(): void {
    if (!this.session) return;
    this.session.eventsProcessed++;
    this.session.lastEventAt = Date.now();
  }

  recordThreatDetected(): void {
    if (!this.session) return;
    this.session.threatsDetected++;
  }

  recordThreatBlocked(): void {
    if (!this.session) return;
    this.session.threatsBlocked++;
  }

  recordInvestigation(): void {
    if (!this.session) return;
    this.session.investigationsTriggered++;
  }

  recordRemediation(): void {
    if (!this.session) return;
    this.session.remediationsTriggered++;
  }

  recordNotification(): void {
    if (!this.session) return;
    this.session.notificationsSent++;
  }

  setMode(mode: ProtectionMode): void {
    if (!this.session) return;
    this.session.mode = mode;
  }

  setState(state: ProtectionState): void {
    if (!this.session) return;
    this.session.state = state;
  }

  getUptime(): number {
    if (!this.session) return 0;
    return this.session.endedAt ? this.session.endedAt - this.session.startedAt : Date.now() - this.session.startedAt;
  }

  clear(): void {
    this.session = null;
  }
}
