/**
 * Multimodal AI Interaction Platform — Session Synchronizer
 *
 * EPIC 5 PHASE A PART 6
 *
 * Manages multimodal sessions, tracking active modalities, input counts,
 * and session state across different interaction modes.
 */
import type {
  MultimodalSession,
  SessionStatus,
  InputModality,
  MultimodalInput,
  MultimodalConfiguration,
} from './types';
import { generateSessionId } from './types';

export class SessionSynchronizer {
  private _config: MultimodalConfiguration;
  private _sessions: Map<string, MultimodalSession> = new Map();
  private _inputHistory: Map<string, MultimodalInput[]> = new Map();
  private _maxHistoryPerSession: number = 100;

  constructor(config: MultimodalConfiguration) {
    this._config = config;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  createSession(): MultimodalSession {
    const session: MultimodalSession = {
      id: generateSessionId(),
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      inputCount: 0,
      activeModalities: [],
      status: 'active',
      futureMetadata: {},
    };
    this._sessions.set(session.id, session);
    this._inputHistory.set(session.id, []);
    return session;
  }

  getSession(sessionId: string): MultimodalSession | null {
    return this._sessions.get(sessionId) ?? null;
  }

  recordInput(sessionId: string, input: MultimodalInput): boolean {
    const session = this._sessions.get(sessionId);
    if (!session) return false;

    session.inputCount++;
    session.lastActivityAt = new Date().toISOString();
    session.status = 'active';

    if (!session.activeModalities.includes(input.modality)) {
      session.activeModalities.push(input.modality);
    }

    const history = this._inputHistory.get(sessionId) ?? [];
    history.push(input);
    if (history.length > this._maxHistoryPerSession) {
      history.shift();
    }
    this._inputHistory.set(sessionId, history);

    return true;
  }

  getInputHistory(sessionId: string): MultimodalInput[] {
    return this._inputHistory.get(sessionId) ?? [];
  }

  getRecentInputs(sessionId: string, count: number = 10): MultimodalInput[] {
    const history = this._inputHistory.get(sessionId) ?? [];
    return history.slice(-count);
  }

  updateStatus(sessionId: string, status: SessionStatus): boolean {
    const session = this._sessions.get(sessionId);
    if (!session) return false;
    session.status = status;
    return true;
  }

  endSession(sessionId: string): boolean {
    return this.updateStatus(sessionId, 'ended');
  }

  getActiveSessions(): MultimodalSession[] {
    return Array.from(this._sessions.values()).filter((s) => s.status === 'active');
  }

  getIdleSessions(): MultimodalSession[] {
    return Array.from(this._sessions.values()).filter((s) => s.status === 'idle');
  }

  markIdle(idleThresholdMs: number = 300000): number {
    const now = Date.now();
    let count = 0;
    for (const session of this._sessions.values()) {
      if (session.status === 'active') {
        const lastActivity = new Date(session.lastActivityAt).getTime();
        if (now - lastActivity > idleThresholdMs) {
          session.status = 'idle';
          count++;
        }
      }
    }
    return count;
  }

  getActiveModalities(sessionId: string): InputModality[] {
    return this._sessions.get(sessionId)?.activeModalities ?? [];
  }

  count(): number {
    return this._sessions.size;
  }

  clear(): void {
    this._sessions.clear();
    this._inputHistory.clear();
  }

  clearSession(sessionId: string): boolean {
    const deleted = this._sessions.delete(sessionId);
    this._inputHistory.delete(sessionId);
    return deleted;
  }

  getAll(): MultimodalSession[] {
    return Array.from(this._sessions.values());
  }
}
