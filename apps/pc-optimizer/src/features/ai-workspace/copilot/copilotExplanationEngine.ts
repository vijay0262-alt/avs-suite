/**
 * AI Copilot Platform — Explanation Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Generates evidence-based explanations for system behavior.
 * Every explanation includes why, evidence, confidence, and next best action.
 */
import type {
  CopilotContext,
  CopilotExplanation,
  ExplanationSubject,
  CopilotEvidence,
  RecommendationSummary,
  PredictionSummary,
  GoalSummary,
  TimelineEventSummary,
} from './types';
import { clampConfidence } from './types';

export class CopilotExplanationEngine {
  explainRecommendation(
    recommendation: RecommendationSummary,
    context: CopilotContext,
  ): CopilotExplanation {
    const evidence: CopilotEvidence[] = [
      this._createEvidence('recommendation', 'id', recommendation.id, 'Recommendation identifier'),
      this._createEvidence('recommendation', 'category', recommendation.category, 'Recommendation category'),
      this._createEvidence('recommendation', 'priority', recommendation.priority, 'Recommendation priority'),
      this._createEvidence('recommendation', 'confidence', recommendation.confidence, 'Recommendation confidence'),
    ];

    if (context.healthScore !== null) {
      evidence.push(this._createEvidence('health_score', 'score', context.healthScore, 'Current health score'));
    }

    return {
      subject: 'recommendation',
      subjectId: recommendation.id,
      title: `Explanation: ${recommendation.title}`,
      why: `This recommendation was generated because your system analysis identified an opportunity in the "${recommendation.category}" category. The confidence level is ${(recommendation.confidence * 100).toFixed(0)}%, which ${recommendation.confidence >= 0.75 ? 'indicates high certainty' : recommendation.confidence >= 0.5 ? 'indicates moderate certainty' : 'indicates low certainty — proceed with caution'}.`,
      evidence,
      confidence: clampConfidence(recommendation.confidence),
      relatedContext: context.sources.map((s) => s.type),
      alternativeView: recommendation.confidence < 0.5
        ? 'This recommendation has low confidence. Consider waiting for more data or exploring alternative approaches.'
        : 'No significant alternatives identified at this confidence level.',
      nextBestAction: `Review the recommendation details and ${recommendation.priority === 'critical' || recommendation.priority === 'high' ? 'consider acting on it soon' : 'act on it when convenient'}.`,
      futureMetadata: {},
    };
  }

  explainHealthScore(
    healthScore: number,
    context: CopilotContext,
  ): CopilotExplanation {
    const evidence: CopilotEvidence[] = [
      this._createEvidence('health_score', 'score', healthScore, 'Current health score'),
    ];

    if (context.activeRecommendations.length > 0) {
      evidence.push(this._createEvidence('recommendations', 'count', context.activeRecommendations.length, 'Active recommendations affecting score'));
    }
    if (context.activePredictions.length > 0) {
      evidence.push(this._createEvidence('predictions', 'count', context.activePredictions.length, 'Active predictions affecting score'));
    }
    if (context.deviceProfile) {
      evidence.push(this._createEvidence('device_profile', 'profileType', context.deviceProfile.profileType, 'Device profile context'));
    }

    const level = healthScore >= 80 ? 'good' : healthScore >= 60 ? 'fair' : healthScore >= 40 ? 'poor' : 'critical';
    const trend = context.recentTimelineEvents.length > 0
      ? `Based on ${context.recentTimelineEvents.length} recent events`
      : 'No recent timeline events to determine trend';

    return {
      subject: 'health_score',
      subjectId: null,
      title: `Health Score Explanation: ${healthScore}`,
      why: `Your health score of ${healthScore} is considered "${level}". ${trend}. The score is calculated from multiple system metrics including performance, storage, privacy, and security indicators.`,
      evidence,
      confidence: clampConfidence(0.8 + (context.sources.length > 3 ? 0.1 : 0)),
      relatedContext: context.sources.map((s) => s.type),
      alternativeView: healthScore < 60
        ? 'Your system health is below optimal. Consider addressing high-priority recommendations to improve it.'
        : 'Your system health is in good shape. Continue regular maintenance to maintain this level.',
      nextBestAction: healthScore < 60
        ? 'Address the highest priority recommendations to improve your health score.'
        : 'Continue regular maintenance and monitoring.',
      futureMetadata: {},
    };
  }

  explainPrediction(
    prediction: PredictionSummary,
    context: CopilotContext,
  ): CopilotExplanation {
    const evidence: CopilotEvidence[] = [
      this._createEvidence('prediction', 'id', prediction.id, 'Prediction identifier'),
      this._createEvidence('prediction', 'category', prediction.category, 'Prediction category'),
      this._createEvidence('prediction', 'riskLevel', prediction.riskLevel, 'Predicted risk level'),
      this._createEvidence('prediction', 'confidence', prediction.confidence, 'Prediction confidence'),
    ];

    if (context.healthScore !== null) {
      evidence.push(this._createEvidence('health_score', 'score', context.healthScore, 'Current health score'));
    }

    return {
      subject: 'prediction',
      subjectId: prediction.id,
      title: `Prediction Explanation: ${prediction.title}`,
      why: `This prediction indicates a "${prediction.riskLevel}" risk in the "${prediction.category}" category with ${(prediction.confidence * 100).toFixed(0)}% confidence. ${prediction.confidence >= 0.75 ? 'This prediction is highly reliable.' : prediction.confidence >= 0.5 ? 'This prediction is moderately reliable.' : 'This prediction has low confidence and may not materialize.'}`,
      evidence,
      confidence: clampConfidence(prediction.confidence),
      relatedContext: context.sources.map((s) => s.type),
      alternativeView: prediction.confidence < 0.5
        ? 'This prediction has low confidence. Monitor the situation but do not take drastic action yet.'
        : 'This prediction is reliable. Consider proactive measures to mitigate the predicted risk.',
      nextBestAction: prediction.riskLevel === 'critical' || prediction.riskLevel === 'high'
        ? 'Take proactive measures to mitigate this predicted risk.'
        : 'Monitor the situation and address if conditions worsen.',
      futureMetadata: {},
    };
  }

  explainDeviceProfile(
    profileType: string,
    performanceTier: string,
    confidence: number,
    context: CopilotContext,
  ): CopilotExplanation {
    const evidence: CopilotEvidence[] = [
      this._createEvidence('device_profile', 'profileType', profileType, 'Detected profile type'),
      this._createEvidence('device_profile', 'performanceTier', performanceTier, 'Performance tier'),
      this._createEvidence('device_profile', 'confidence', confidence, 'Profile confidence'),
    ];

    if (context.healthScore !== null) {
      evidence.push(this._createEvidence('health_score', 'score', context.healthScore, 'Current health score'));
    }

    return {
      subject: 'device_profile',
      subjectId: null,
      title: `Device Profile Explanation: ${profileType}`,
      why: `Your device has been classified as "${profileType}" with a "${performanceTier}" performance tier. This classification is based on hardware analysis, software analysis, and usage patterns. The confidence level is ${(confidence * 100).toFixed(0)}%.`,
      evidence,
      confidence: clampConfidence(confidence),
      relatedContext: context.sources.map((s) => s.type),
      alternativeView: confidence < 0.5
        ? 'The device profile has low confidence. The classification may change as more data is collected.'
        : 'The device profile is stable and reliable.',
      nextBestAction: 'Optimizations are tailored to your device profile for maximum effectiveness.',
      futureMetadata: {},
    };
  }

  explainTimelineEvent(
    event: TimelineEventSummary,
    context: CopilotContext,
  ): CopilotExplanation {
    const evidence: CopilotEvidence[] = [
      this._createEvidence('timeline', 'id', event.id, 'Event identifier'),
      this._createEvidence('timeline', 'title', event.title, 'Event title'),
      this._createEvidence('timeline', 'category', event.category, 'Event category'),
      this._createEvidence('timeline', 'severity', event.severity, 'Event severity'),
      this._createEvidence('timeline', 'timestamp', event.timestamp, 'Event timestamp'),
    ];

    return {
      subject: 'timeline_event',
      subjectId: event.id,
      title: `Timeline Event: ${event.title}`,
      why: `This event occurred on ${event.timestamp} and is categorized as "${event.category}" with "${event.severity}" severity. ${event.severity === 'critical' || event.severity === 'high' ? 'This event may require attention.' : 'This event is informational.'}`,
      evidence,
      confidence: 0.9,
      relatedContext: context.sources.map((s) => s.type),
      alternativeView: 'Review the timeline for related events that may provide additional context.',
      nextBestAction: event.severity === 'critical' || event.severity === 'high'
        ? 'Investigate this event and consider taking corrective action.'
        : 'No immediate action required. Continue monitoring.',
      futureMetadata: {},
    };
  }

  explainGoal(
    goal: GoalSummary,
    context: CopilotContext,
  ): CopilotExplanation {
    const evidence: CopilotEvidence[] = [
      this._createEvidence('goal', 'id', goal.id, 'Goal identifier'),
      this._createEvidence('goal', 'name', goal.name, 'Goal name'),
      this._createEvidence('goal', 'status', goal.status, 'Goal status'),
      this._createEvidence('goal', 'priority', goal.priority, 'Goal priority'),
      this._createEvidence('goal', 'progress', goal.progress, 'Goal progress'),
    ];

    if (context.healthScore !== null) {
      evidence.push(this._createEvidence('health_score', 'score', context.healthScore, 'Current health score'));
    }

    return {
      subject: 'goal',
      subjectId: goal.id,
      title: `Goal Explanation: ${goal.name}`,
      why: `This goal is currently "${goal.status}" with ${(goal.progress * 100).toFixed(0)}% progress. Priority: ${goal.priority}. ${goal.status === 'in_progress' ? 'The AI is actively working on this goal.' : goal.status === 'blocked' ? 'This goal is blocked and requires attention.' : 'This goal is not actively being pursued.'}`,
      evidence,
      confidence: clampConfidence(0.7 + goal.progress * 0.3),
      relatedContext: context.sources.map((s) => s.type),
      alternativeView: goal.status === 'blocked'
        ? 'This goal is blocked. Consider resolving blocking issues or adjusting the goal parameters.'
        : 'The goal is progressing as expected.',
      nextBestAction: goal.status === 'blocked'
        ? 'Resolve blocking issues to resume progress on this goal.'
        : goal.progress < 0.5
          ? 'Continue with current optimization strategies to make progress on this goal.'
          : 'You\'re making good progress. Continue current strategies to complete this goal.',
      futureMetadata: {},
    };
  }

  explain(
    subject: ExplanationSubject,
    context: CopilotContext,
    entityId: string | null,
  ): CopilotExplanation {
    switch (subject) {
      case 'recommendation': {
        const rec = context.activeRecommendations.find((r) => r.id === entityId);
        if (rec) return this.explainRecommendation(rec, context);
        return this._fallbackExplanation('recommendation', entityId, 'Recommendation not found in active context.');
      }
      case 'health_score': {
        if (context.healthScore !== null) return this.explainHealthScore(context.healthScore, context);
        return this._fallbackExplanation('health_score', null, 'Health score not available.');
      }
      case 'prediction': {
        const pred = context.activePredictions.find((p) => p.id === entityId);
        if (pred) return this.explainPrediction(pred, context);
        return this._fallbackExplanation('prediction', entityId, 'Prediction not found in active context.');
      }
      case 'device_profile': {
        if (context.deviceProfile) {
          return this.explainDeviceProfile(
            context.deviceProfile.profileType,
            context.deviceProfile.performanceTier,
            context.deviceProfile.confidence,
            context,
          );
        }
        return this._fallbackExplanation('device_profile', null, 'Device profile not available.');
      }
      case 'timeline_event': {
        const event = context.recentTimelineEvents.find((e) => e.id === entityId);
        if (event) return this.explainTimelineEvent(event, context);
        return this._fallbackExplanation('timeline_event', entityId, 'Timeline event not found in recent events.');
      }
      case 'goal': {
        const goal = context.activeGoals.find((g) => g.id === entityId);
        if (goal) return this.explainGoal(goal, context);
        return this._fallbackExplanation('goal', entityId, 'Goal not found in active goals.');
      }
      default:
        return this._fallbackExplanation(subject, entityId, `Explanation for "${subject}" is not yet supported.`);
    }
  }

  private _fallbackExplanation(
    subject: ExplanationSubject,
    entityId: string | null,
    message: string,
  ): CopilotExplanation {
    return {
      subject,
      subjectId: entityId,
      title: `Explanation: ${subject}`,
      why: message,
      evidence: [],
      confidence: 0.3,
      relatedContext: [],
      alternativeView: 'No alternative view available.',
      nextBestAction: 'Try a different query or ensure the relevant data is available.',
      futureMetadata: {},
    };
  }

  private _createEvidence(
    source: string,
    metric: string,
    value: string | number | boolean,
    description: string,
  ): CopilotEvidence {
    return {
      source,
      metric,
      value,
      timestamp: new Date().toISOString(),
      description,
      confidence: 1.0,
      futureMetadata: {},
    };
  }
}
