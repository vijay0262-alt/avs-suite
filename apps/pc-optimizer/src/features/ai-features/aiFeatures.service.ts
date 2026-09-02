/**
 * AI Features service — wraps the backend `ai_features.*` RPC methods.
 *
 * Tier 4 AI-powered features:
 * - AI Threat Explanation
 * - AI Optimization Recommendations
 * - One-Click Security Audit
 * - Threat Timeline Visualization
 * - Community Threat Intelligence
 * - Privacy Score
 * - Game/Movie Mode
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

// ── Types ───────────────────────────────────────────────────────

export interface ThreatExplanation {
  explanation: string;
  category: string;
  what_it_does: string;
  how_it_spreads: string;
  damage_potential: string;
  recommended_actions: string[];
  risk_level: string;
  confidence: number;
}

export interface OptimizationRecommendation {
  id: string;
  category: 'disk' | 'memory' | 'startup' | 'processes' | 'registry' | 'security' | 'network';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expected_impact: string;
  action: string;
  action_params: Record<string, unknown>;
  estimated_time: string;
}

export interface OptimizationResult {
  recommendations: OptimizationRecommendation[];
  system_score: number;
  potential_gain: string;
  summary: string;
}

export interface SecurityAuditCheck {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  message: string;
  weight: number;
  recommendation: string;
}

export interface SecurityAuditResult {
  score: number;
  grade: string;
  checks: SecurityAuditCheck[];
  summary: string;
  recommendations: string[];
}

export interface TimelineEvent {
  id: number;
  timestamp: string;
  type: string;
  severity: string;
  source: string;
  description: string;
  file_path?: string;
  action_taken?: string;
}

export interface TimelineSummary {
  total_events: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  by_source: Record<string, number>;
  last_24h: number;
  last_7d: number;
  last_30d: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface PrivacyCheck {
  id: string;
  name: string;
  status: 'good' | 'warning' | 'bad' | 'unknown';
  message: string;
  weight: number;
  recommendation: string;
}

export interface PrivacyResult {
  score: number;
  grade: string;
  checks: PrivacyCheck[];
  recommendations: string[];
  summary: string;
}

export interface GameModeStatus {
  active: boolean;
  auto_detect: boolean;
  activated_at: string | null;
  deactivated_at: string | null;
  settings: {
    pause_realtime: boolean;
    pause_ml: boolean;
    pause_scheduled_scans: boolean;
    suppress_notifications: boolean;
  };
  sessions_count: number;
  fullscreen_detected: boolean;
}

export interface CommunityStatus {
  opt_in: boolean;
  submissions_count: number;
  last_sync: string | null;
  server_reachable: boolean;
}

// ── Service ─────────────────────────────────────────────────────

export const aiFeaturesService = {
  // Overall status
  async getStatus(): Promise<{ success: boolean; status: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_FEATURES_STATUS);
  },

  // Threat Explanation
  async explainThreat(threat: Record<string, unknown>): Promise<{ success: boolean; result: ThreatExplanation }> {
    return client().call(RPC_METHODS.AI_THREAT_EXPLAIN, { threat });
  },
  async explainThreats(threats: Record<string, unknown>[]): Promise<{ success: boolean; results: ThreatExplanation[] }> {
    return client().call(RPC_METHODS.AI_THREAT_EXPLAIN_BATCH, { threats });
  },

  // Optimization
  async analyzeOptimizations(): Promise<{ success: boolean; result: OptimizationResult }> {
    return client().call(RPC_METHODS.AI_OPTIMIZATION_ANALYZE);
  },
  async getOptimizationRecommendations(): Promise<{ success: boolean; recommendations: OptimizationRecommendation[] }> {
    return client().call(RPC_METHODS.AI_OPTIMIZATION_RECOMMENDATIONS);
  },
  async getOptimizationStatus(): Promise<{ success: boolean; status: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_OPTIMIZATION_STATUS);
  },

  // Security Audit
  async runSecurityAudit(): Promise<{ success: boolean; result: SecurityAuditResult }> {
    return client().call(RPC_METHODS.AI_SECURITY_AUDIT);
  },
  async getSecurityAuditStatus(): Promise<{ success: boolean; status: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_SECURITY_STATUS);
  },
  async getSecurityAuditHistory(): Promise<{ success: boolean; history: Record<string, unknown>[] }> {
    return client().call(RPC_METHODS.AI_SECURITY_HISTORY);
  },

  // Timeline
  async recordTimelineEvent(event: Record<string, unknown>): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_TIMELINE_RECORD, { event });
  },
  async getTimeline(start_time?: string, end_time?: string, limit: number = 100): Promise<{ success: boolean; events: TimelineEvent[]; total: number; summary: TimelineSummary }> {
    return client().call(RPC_METHODS.AI_TIMELINE_GET, { start_time, end_time, limit });
  },
  async getTimelineSummary(): Promise<{ success: boolean; summary: TimelineSummary }> {
    return client().call(RPC_METHODS.AI_TIMELINE_SUMMARY);
  },
  async getTimelineStatus(): Promise<{ success: boolean; status: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_TIMELINE_STATUS);
  },
  async clearTimeline(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_TIMELINE_CLEAR);
  },
  async exportTimeline(format: string = 'json'): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_TIMELINE_EXPORT, { format });
  },

  // Community Intelligence
  async submitToCommunity(threat: Record<string, unknown>): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_SUBMIT, { threat });
  },
  async getCommunitySubmissions(limit: number = 50): Promise<{ success: boolean; submissions: Record<string, unknown>[] }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_SUBMISSIONS, { limit });
  },
  async getCommunityStatus(): Promise<{ success: boolean; status: CommunityStatus }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_STATUS);
  },
  async configureCommunity(config: Record<string, unknown>): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_CONFIGURE, config);
  },
  async previewCommunitySubmission(threat: Record<string, unknown>): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_PREVIEW, { threat });
  },
  async syncCommunity(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_SYNC);
  },
  async getCommunityStats(): Promise<{ success: boolean; stats: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_COMMUNITY_STATS);
  },

  // Privacy Score
  async calculatePrivacyScore(): Promise<{ success: boolean; result: PrivacyResult }> {
    return client().call(RPC_METHODS.AI_PRIVACY_CALCULATE);
  },
  async getPrivacyStatus(): Promise<{ success: boolean; status: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_PRIVACY_STATUS);
  },
  async getPrivacyHistory(): Promise<{ success: boolean; history: Record<string, unknown>[] }> {
    return client().call(RPC_METHODS.AI_PRIVACY_HISTORY);
  },

  // Game/Movie Mode
  async activateGameMode(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_GAME_MODE_ACTIVATE);
  },
  async deactivateGameMode(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_GAME_MODE_DEACTIVATE);
  },
  async toggleGameMode(): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_GAME_MODE_TOGGLE);
  },
  async getGameModeStatus(): Promise<{ success: boolean; status: GameModeStatus }> {
    return client().call(RPC_METHODS.AI_GAME_MODE_STATUS);
  },
  async configureGameMode(config: Record<string, unknown>): Promise<{ success: boolean; result: Record<string, unknown> }> {
    return client().call(RPC_METHODS.AI_GAME_MODE_CONFIGURE, config);
  },
  async getGameModeSessions(): Promise<{ success: boolean; sessions: Record<string, unknown>[] }> {
    return client().call(RPC_METHODS.AI_GAME_MODE_SESSIONS);
  },
};
