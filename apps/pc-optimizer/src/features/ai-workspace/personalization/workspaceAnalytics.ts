/**
 * AI Workspace Personalization Platform — Workspace Analytics
 *
 * EPIC 5 PHASE A PART 7
 *
 * Aggregates workspace usage analytics. No personal data.
 * Tracks sessions, suggestions, profile distribution, tool usage.
 */
import type {
  WorkspaceAnalyticsData,
  BehaviorEvent,
  PersonalizationSuggestion,
  WorkspaceProfileType,
} from './types';

export class WorkspaceAnalytics {
  private _totalSessions: number = 0;
  private _totalBehaviorEvents: number = 0;
  private _totalSuggestionsGenerated: number = 0;
  private _totalSuggestionsAccepted: number = 0;
  private _totalSuggestionsDismissed: number = 0;
  private _profileDistribution: Map<string, number> = new Map();
  private _toolUsage: Map<string, number> = new Map();
  private _reportUsage: Map<string, number> = new Map();
  private _sessionDurations: number[] = [];
  private _personalizationEnabled: boolean = true;

  recordSession(durationMs?: number): void {
    this._totalSessions++;
    if (durationMs !== undefined) {
      this._sessionDurations.push(durationMs);
      if (this._sessionDurations.length > 1000) this._sessionDurations.shift();
    }
  }

  recordBehaviorEvent(event: BehaviorEvent): void {
    this._totalBehaviorEvents++;
    if (event.type === 'tool_used' && event.targetId) {
      this._toolUsage.set(event.targetId, (this._toolUsage.get(event.targetId) ?? 0) + 1);
    }
    if (event.type === 'report_viewed' && event.targetId) {
      this._reportUsage.set(event.targetId, (this._reportUsage.get(event.targetId) ?? 0) + 1);
    }
  }

  recordSuggestionGenerated(): void {
    this._totalSuggestionsGenerated++;
  }

  recordSuggestionAccepted(): void {
    this._totalSuggestionsAccepted++;
  }

  recordSuggestionDismissed(): void {
    this._totalSuggestionsDismissed++;
  }

  recordProfileUsage(profileType: WorkspaceProfileType): void {
    this._profileDistribution.set(profileType, (this._profileDistribution.get(profileType) ?? 0) + 1);
  }

  setPersonalizationEnabled(enabled: boolean): void {
    this._personalizationEnabled = enabled;
  }

  getAnalytics(): WorkspaceAnalyticsData {
    const avgDuration = this._sessionDurations.length > 0
      ? this._sessionDurations.reduce((a, b) => a + b, 0) / this._sessionDurations.length
      : 0;

    const totalSuggestions = this._totalSuggestionsAccepted + this._totalSuggestionsDismissed;
    const acceptanceRate = totalSuggestions > 0
      ? this._totalSuggestionsAccepted / totalSuggestions
      : 0;

    const topTools = Array.from(this._toolUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([toolId, count]) => ({ toolId, count }));

    const topReports = Array.from(this._reportUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reportId, count]) => ({ reportId, count }));

    return {
      totalSessions: this._totalSessions,
      totalBehaviorEvents: this._totalBehaviorEvents,
      totalSuggestionsGenerated: this._totalSuggestionsGenerated,
      totalSuggestionsAccepted: this._totalSuggestionsAccepted,
      totalSuggestionsDismissed: this._totalSuggestionsDismissed,
      averageAcceptanceRate: acceptanceRate,
      profileDistribution: Object.fromEntries(this._profileDistribution),
      topTools,
      topReports,
      averageSessionDuration: avgDuration,
      personalizationEnabled: this._personalizationEnabled,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  reset(): void {
    this._totalSessions = 0;
    this._totalBehaviorEvents = 0;
    this._totalSuggestionsGenerated = 0;
    this._totalSuggestionsAccepted = 0;
    this._totalSuggestionsDismissed = 0;
    this._profileDistribution.clear();
    this._toolUsage.clear();
    this._reportUsage.clear();
    this._sessionDurations = [];
    this._personalizationEnabled = true;
  }
}
