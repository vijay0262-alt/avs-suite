/**
 * Natural Language Action Engine — Action Analytics
 *
 * EPIC 5 PHASE A PART 4
 *
 * Aggregate analytics for action usage. No personal data.
 */
import type { ActionAnalyticsData as ActionAnalyticsData } from './types';

export class ActionAnalytics {
  private _totalRequests: number = 0;
  private _totalPlansGenerated: number = 0;
  private _totalApproved: number = 0;
  private _totalRejected: number = 0;
  private _totalExecuted: number = 0;
  private _byActionType: Map<string, number> = new Map();
  private _confidenceSum: number = 0;
  private _planningTimeSum: number = 0;

  recordRequest(): void {
    this._totalRequests++;
  }

  recordPlanGenerated(actionType: string, confidence: number, planningTimeMs: number): void {
    this._totalPlansGenerated++;
    this._byActionType.set(actionType, (this._byActionType.get(actionType) ?? 0) + 1);
    this._confidenceSum += confidence;
    this._planningTimeSum += planningTimeMs;
  }

  recordApproval(approved: boolean): void {
    if (approved) this._totalApproved++;
    else this._totalRejected++;
  }

  recordExecution(): void {
    this._totalExecuted++;
  }

  getAnalytics(): ActionAnalyticsData {
    const byActionType: Record<string, number> = {};
    for (const [key, val] of this._byActionType) byActionType[key] = val;

    return {
      totalRequests: this._totalRequests,
      totalPlansGenerated: this._totalPlansGenerated,
      totalApproved: this._totalApproved,
      totalRejected: this._totalRejected,
      totalExecuted: this._totalExecuted,
      byActionType,
      averageConfidence: this._totalPlansGenerated > 0 ? this._confidenceSum / this._totalPlansGenerated : 0,
      averagePlanningTimeMs: this._totalPlansGenerated > 0 ? this._planningTimeSum / this._totalPlansGenerated : 0,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  reset(): void {
    this._totalRequests = 0;
    this._totalPlansGenerated = 0;
    this._totalApproved = 0;
    this._totalRejected = 0;
    this._totalExecuted = 0;
    this._byActionType.clear();
    this._confidenceSum = 0;
    this._planningTimeSum = 0;
  }
}
