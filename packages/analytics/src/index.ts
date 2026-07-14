/**
 * @avs/analytics — opt-in telemetry contracts.
 *
 * No implementation is bundled by default. The Electron main process
 * may bind a concrete transport (e.g. Segment, PostHog) at bootstrap
 * behind an explicit user opt-in.
 */

export interface IAnalyticsService {
  setOptIn(enabled: boolean): void;
  isOptedIn(): boolean;
  identify(userId: string, traits?: Record<string, unknown>): void;
  track(event: string, properties?: Record<string, unknown>): void;
  page(name: string, properties?: Record<string, unknown>): void;
}

/** Default no-op implementation. */
export class NullAnalyticsService implements IAnalyticsService {
  private optedIn = false;
  setOptIn(enabled: boolean): void {
    this.optedIn = enabled;
  }
  isOptedIn(): boolean {
    return this.optedIn;
  }
  identify(_userId: string, _traits?: Record<string, unknown>): void {}
  track(_event: string, _properties?: Record<string, unknown>): void {}
  page(_name: string, _properties?: Record<string, unknown>): void {}
}
