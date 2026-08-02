/**
 * ProtectionStateMachine — manages protection state transitions.
 *
 * States:
 *   stopped → starting → running → paused → stopping → stopped
 *   running → error → restarting → running (or stopped)
 */
import type { ProtectionState, ProtectionMode } from './types';

interface StateTransition {
  from: ProtectionState;
  to: ProtectionState;
  guard?: () => boolean;
}

const VALID_TRANSITIONS: StateTransition[] = [
  { from: 'stopped', to: 'starting' },
  { from: 'starting', to: 'running' },
  { from: 'starting', to: 'error' },
  { from: 'starting', to: 'stopped' },
  { from: 'running', to: 'paused' },
  { from: 'running', to: 'stopping' },
  { from: 'running', to: 'error' },
  { from: 'paused', to: 'running' },
  { from: 'paused', to: 'stopping' },
  { from: 'stopping', to: 'stopped' },
  { from: 'error', to: 'restarting' },
  { from: 'error', to: 'stopped' },
  { from: 'restarting', to: 'starting' },
  { from: 'restarting', to: 'stopped' },
];

export class ProtectionStateMachine {
  private state: ProtectionState = 'stopped';
  private mode: ProtectionMode = 'passive';
  private lastTransition: number = 0;
  private transitionHistory: { from: ProtectionState; to: ProtectionState; timestamp: number }[] = [];
  private restartAttempts = 0;

  getState(): ProtectionState {
    return this.state;
  }

  getMode(): ProtectionMode {
    return this.mode;
  }

  setMode(mode: ProtectionMode): void {
    this.mode = mode;
  }

  canTransition(to: ProtectionState): boolean {
    return VALID_TRANSITIONS.some((t) => t.from === this.state && t.to === to && (!t.guard || t.guard()));
  }

  transition(to: ProtectionState): boolean {
    if (!this.canTransition(to)) return false;

    const from = this.state;
    this.state = to;
    this.lastTransition = Date.now();
    this.transitionHistory.push({ from, to, timestamp: this.lastTransition });

    if (to === 'restarting') {
      this.restartAttempts++;
    }

    return true;
  }

  start(): boolean {
    return this.transition('starting');
  }

  completeStart(): boolean {
    return this.transition('running');
  }

  pause(): boolean {
    return this.transition('paused');
  }

  resume(): boolean {
    return this.transition('running');
  }

  stop(): boolean {
    if (this.state === 'running' || this.state === 'paused') {
      this.transition('stopping');
    }
    return this.transition('stopped');
  }

  fail(error?: string): boolean {
    void error;
    return this.transition('error');
  }

  restart(): boolean {
    return this.transition('restarting');
  }

  isRunning(): boolean {
    return this.state === 'running';
  }

  isPaused(): boolean {
    return this.state === 'paused';
  }

  isStopped(): boolean {
    return this.state === 'stopped';
  }

  isError(): boolean {
    return this.state === 'error';
  }

  getRestartAttempts(): number {
    return this.restartAttempts;
  }

  resetRestartAttempts(): void {
    this.restartAttempts = 0;
  }

  getLastTransition(): number {
    return this.lastTransition;
  }

  getTransitionHistory(): { from: ProtectionState; to: ProtectionState; timestamp: number }[] {
    return [...this.transitionHistory];
  }

  reset(): void {
    this.state = 'stopped';
    this.lastTransition = 0;
    this.transitionHistory = [];
    this.restartAttempts = 0;
  }
}
