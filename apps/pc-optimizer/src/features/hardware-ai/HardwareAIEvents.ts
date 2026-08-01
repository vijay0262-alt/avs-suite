/**
 * HardwareAIEvents — event bus for AI engine lifecycle events.
 *
 * Uses a simple pub/sub pattern matching the hardware-center event bus.
 */
import type { HardwareAIEvent, HardwareAIEventTypeName } from './types';

type AIEventListener = (event: HardwareAIEvent) => void;

class HardwareAIEventBus {
  private listeners = new Set<AIEventListener>();

  subscribe(listener: AIEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: HardwareAIEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitAnalysisStarted(snapshotId: string): void {
    this.emit({
      type: 'ai_analysis_started',
      timestamp: Date.now(),
      data: { snapshotId },
    });
  }

  emitAnalysisCompleted(reportId: string, snapshotId: string): void {
    this.emit({
      type: 'ai_analysis_completed',
      timestamp: Date.now(),
      data: { reportId, snapshotId },
    });
  }

  emitInsightGenerated(insightId: string, category: string): void {
    this.emit({
      type: 'ai_insight_generated',
      timestamp: Date.now(),
      category: category as never,
      data: { insightId },
    });
  }

  emitRiskDetected(riskLevel: string, category: string): void {
    this.emit({
      type: 'ai_risk_detected',
      timestamp: Date.now(),
      category: category as never,
      data: { riskLevel: riskLevel as never },
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const hardwareAIEventBus = new HardwareAIEventBus();
