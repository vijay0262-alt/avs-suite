/**
 * Multimodal AI Interaction Platform — Voice Processor
 *
 * EPIC 5 PHASE A PART 6
 *
 * Processes voice inputs: speech-to-text, text-to-speech, streaming,
 * interruption, session context. Uses provider/plugin architecture.
 */
import type {
  VoiceSession,
  VoiceSessionStatus,
  VoiceProcessingResult,
  VoiceProvider,
  VoiceOperation,
  MultimodalConfiguration,
} from './types';
import { generateVoiceSessionId } from './types';

export class VoiceProcessor {
  private _config: MultimodalConfiguration;
  private _provider: VoiceProvider | null;
  private _sessions: Map<string, VoiceSession> = new Map();

  constructor(config: MultimodalConfiguration, provider?: VoiceProvider) {
    this._config = config;
    this._provider = provider ?? null;
  }

  updateConfig(config: MultimodalConfiguration): void {
    this._config = config;
  }

  setProvider(provider: VoiceProvider): void {
    this._provider = provider;
  }

  isAvailable(): boolean {
    return this._config.featureFlags.enableVoice && this._provider !== null && this._provider.available;
  }

  async speechToText(audio: unknown): Promise<VoiceProcessingResult> {
    if (!this.isAvailable()) {
      return {
        sessionId: 'none',
        operation: 'speech_to_text',
        text: null,
        audioData: audio,
        confidence: 0,
        durationMs: 0,
        futureMetadata: { error: 'Voice processing not available' },
      };
    }
    return this._provider!.speechToText(audio);
  }

  async textToSpeech(text: string): Promise<VoiceProcessingResult> {
    if (!this.isAvailable()) {
      return {
        sessionId: 'none',
        operation: 'text_to_speech',
        text,
        audioData: null,
        confidence: 0,
        durationMs: 0,
        futureMetadata: { error: 'Voice processing not available' },
      };
    }
    return this._provider!.textToSpeech(text);
  }

  async startStream(): Promise<VoiceSession> {
    if (!this.isAvailable() || !this._config.featureFlags.enableStreaming) {
      throw new Error('Voice streaming not available');
    }
    const session = await this._provider!.startStream();
    this._sessions.set(session.id, session);
    return session;
  }

  async stopStream(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) return;
    if (this._provider) {
      await this._provider.stopStream(sessionId);
    }
    session.status = 'ended';
    session.endedAt = new Date().toISOString();
  }

  async interrupt(sessionId: string): Promise<void> {
    const session = this._sessions.get(sessionId);
    if (!session) return;
    if (this._provider && this._config.featureFlags.enableInterruption) {
      await this._provider.interrupt(sessionId);
    }
    session.status = 'interrupted';
  }

  getSession(sessionId: string): VoiceSession | null {
    return this._sessions.get(sessionId) ?? null;
  }

  getActiveSessions(): VoiceSession[] {
    return Array.from(this._sessions.values()).filter(
      (s) => s.status === 'listening' || s.status === 'processing' || s.status === 'speaking',
    );
  }

  createLocalSession(language: string = 'en', sampleRate: number = 16000): VoiceSession {
    const session: VoiceSession = {
      id: generateVoiceSessionId(),
      status: 'idle',
      language,
      sampleRate,
      startedAt: new Date().toISOString(),
      endedAt: null,
      futureMetadata: {},
    };
    this._sessions.set(session.id, session);
    return session;
  }

  updateSessionStatus(sessionId: string, status: VoiceSessionStatus): boolean {
    const session = this._sessions.get(sessionId);
    if (!session) return false;
    session.status = status;
    if (status === 'ended') {
      session.endedAt = new Date().toISOString();
    }
    return true;
  }

  endSession(sessionId: string): boolean {
    return this.updateSessionStatus(sessionId, 'ended');
  }

  clearSessions(): void {
    this._sessions.clear();
  }

  getSessionCount(): number {
    return this._sessions.size;
  }
}
