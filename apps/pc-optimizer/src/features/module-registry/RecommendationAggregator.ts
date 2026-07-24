/**
 * Recommendation Aggregator (Part 8) — aggregates recommendations from
 * all registered modules and prioritizes them.
 *
 * The Dashboard calls `getAggregatedRecommendations()` to display a unified,
 * prioritized list. Modules provide their own recommendations via
 * `getRecommendations()` — the Dashboard doesn't need to know about
 * individual modules.
 */

import type { Recommendation } from '../dashboard/dashboard.types';
import { moduleRegistry } from './ModuleRegistry';

type RecommendationListener = (recommendations: Recommendation[]) => void;

const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 0,
  high: 1,
  warning: 2,
  info: 3,
};

class RecommendationAggregatorImpl {
  private listeners = new Set<RecommendationListener>();
  private cached: Recommendation[] = [];

  /**
   * Collect recommendations from all registered, available modules
   * and sort by severity (critical first, info last).
   */
  getAggregatedRecommendations(): Recommendation[] {
    const entries = moduleRegistry.getAvailableModules();
    const all: Recommendation[] = [];

    for (const entry of entries) {
      const module = moduleRegistry.getModule(entry.metadata.moduleId);
      if (!module) continue;
      try {
        const recs = module.getRecommendations();
        all.push(...recs);
      } catch {
        // skip modules that fail to provide recommendations
      }
    }

    // Sort by severity priority, then by module category
    all.sort((a, b) => {
      const pa = SEVERITY_PRIORITY[a.severity] ?? 99;
      const pb = SEVERITY_PRIORITY[b.severity] ?? 99;
      if (pa !== pb) return pa - pb;
      return 0;
    });

    this.cached = all;
    return all;
  }

  getCachedRecommendations(): Recommendation[] {
    return this.cached;
  }

  /** Refresh and notify subscribers. */
  refresh(): Recommendation[] {
    const recs = this.getAggregatedRecommendations();
    for (const listener of this.listeners) {
      try {
        listener(recs);
      } catch (err) {
        console.error('[RecommendationAggregator] listener error:', err);
      }
    }
    return recs;
  }

  subscribe(listener: RecommendationListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  clear(): void {
    this.listeners.clear();
    this.cached = [];
  }
}

export const recommendationAggregator = new RecommendationAggregatorImpl();
