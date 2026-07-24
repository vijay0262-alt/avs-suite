/**
 * Future Telemetry Readiness (Part 14) — Production Readiness Framework.
 *
 * Prepares the architecture for optional future telemetry.
 *
 * IMPORTANT: This does NOT implement telemetry collection.
 * It only designs interfaces so anonymous diagnostic reporting
 * could be added later if desired, while respecting user privacy
 * and explicit consent.
 *
 * Key principles:
 *   - Telemetry is opt-in only (explicit user consent required)
 *   - No personally identifiable information (PII) is collected
 *   - Users can view what would be sent before consenting
 *   - Users can revoke consent at any time
 *   - All telemetry is anonymous and aggregated
 */

// ── Consent Types ───────────────────────────────────────────────────

export type TelemetryConsentStatus = 'not_asked' | 'granted' | 'declined' | 'revoked';

export interface TelemetryConsent {
  status: TelemetryConsentStatus;
  grantedAt: string | null;
  revokedAt: string | null;
  /** Version of the privacy policy the user consented to. */
  policyVersion: string;
}

// ── Telemetry Event Types ───────────────────────────────────────────

export interface TelemetryEvent {
  /** Anonymous event type (e.g., 'module.scan.completed'). */
  type: string;
  /** Anonymous category (e.g., 'performance', 'stability'). */
  category: 'performance' | 'stability' | 'usage' | 'error';
  /** Anonymous, aggregated data — no PII. */
  data: Record<string, number | string | boolean>;
  /** Timestamp of the event. */
  timestamp: string;
  /** Application version for context. */
  appVersion: string;
}

// ── Telemetry Configuration ─────────────────────────────────────────

export interface TelemetryConfig {
  /** Whether telemetry is enabled (requires explicit consent). */
  enabled: boolean;
  /** Endpoint URL for telemetry submission (if implemented). */
  endpoint: string | null;
  /** Interval for batch submission (ms). */
  batchIntervalMs: number;
  /** Maximum events per batch. */
  maxBatchSize: number;
  /** Whether to include performance metrics. */
  includePerformance: boolean;
  /** Whether to include error summaries. */
  includeErrors: boolean;
  /** Whether to include usage statistics. */
  includeUsage: boolean;
}

// ── Telemetry Provider Interface ────────────────────────────────────

/**
 * Interface for a telemetry provider.
 * A concrete implementation would be created if telemetry is ever
 * enabled. This interface ensures the rest of the application can
 * be designed to work with telemetry without coupling to any
 * specific implementation.
 *
 * NO IMPLEMENTATION IS PROVIDED — this is interface-only.
 */
export interface ITelemetryProvider {
  /**
   * Check if telemetry is currently enabled (consent granted + config enabled).
   */
  isEnabled(): boolean;

  /**
   * Get the current consent status.
   */
  getConsent(): TelemetryConsent;

  /**
   * Request consent from the user.
   * In a real implementation, this would show a dialog.
   */
  requestConsent(): Promise<TelemetryConsent>;

  /**
   * Grant consent explicitly.
   */
  grantConsent(): void;

  /**
   * Revoke consent explicitly. All pending data is discarded.
   */
  revokeConsent(): void;

  /**
   * Track an anonymous telemetry event.
   * No-op if telemetry is not enabled.
   */
  track(event: TelemetryEvent): void;

  /**
   * Get a preview of what telemetry would be sent.
   * Allows users to review data before consenting.
   */
  previewData(): TelemetryEvent[];

  /**
   * Flush pending events (for shutdown).
   */
  flush(): Promise<void>;

  /**
   * Get the current telemetry configuration.
   */
  getConfig(): TelemetryConfig;

  /**
   * Update the telemetry configuration.
   */
  updateConfig(config: Partial<TelemetryConfig>): void;
}

// ── No-Op Telemetry Provider ────────────────────────────────────────

/**
 * Default no-op telemetry provider.
 * Does nothing — telemetry is not active.
 * This satisfies the interface so the application can be designed
 * for telemetry without actually implementing it.
 */
class NoOpTelemetryProvider implements ITelemetryProvider {
  private consent: TelemetryConsent = {
    status: 'not_asked',
    grantedAt: null,
    revokedAt: null,
    policyVersion: '1.0.0',
  };

  private config: TelemetryConfig = {
    enabled: false,
    endpoint: null,
    batchIntervalMs: 60_000,
    maxBatchSize: 50,
    includePerformance: true,
    includeErrors: true,
    includeUsage: false,
  };

  isEnabled(): boolean {
    return this.config.enabled && this.consent.status === 'granted';
  }

  getConsent(): TelemetryConsent {
    return { ...this.consent };
  }

  async requestConsent(): Promise<TelemetryConsent> {
    // No-op: in a real implementation, this would show a consent dialog
    return this.getConsent();
  }

  grantConsent(): void {
    this.consent = {
      status: 'granted',
      grantedAt: new Date().toISOString(),
      revokedAt: null,
      policyVersion: this.consent.policyVersion,
    };
  }

  revokeConsent(): void {
    this.consent = {
      status: 'revoked',
      grantedAt: this.consent.grantedAt,
      revokedAt: new Date().toISOString(),
      policyVersion: this.consent.policyVersion,
    };
  }

  track(_event: TelemetryEvent): void {
    // No-op: telemetry is not active
  }

  previewData(): TelemetryEvent[] {
    return [];
  }

  async flush(): Promise<void> {
    // No-op
  }

  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * The active telemetry provider.
 * Defaults to NoOp — telemetry is not active.
 * A real provider can be injected if telemetry is ever enabled.
 */
export const telemetryProvider: ITelemetryProvider = new NoOpTelemetryProvider();
