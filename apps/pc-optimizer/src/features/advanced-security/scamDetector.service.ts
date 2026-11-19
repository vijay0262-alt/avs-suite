/**
 * Scam Detector service — wraps the backend `scam_detector.*` RPC methods.
 *
 * On-device "Is this a scam?" analysis: pasted messages, screenshots
 * (Windows OCR), and phone numbers. Returns an explainable verdict with
 * the tactics that fired and safety advice.
 */
import { RPC_METHODS } from '@avs/shared/rpc';
import type { RiskLevel } from './advancedSecurity.service';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export type ScamVerdict =
  | 'scam'
  | 'suspicious'
  | 'likely_legitimate'
  | 'insufficient_content';

export type Sensitivity = 'high' | 'balanced' | 'low';

export interface ScamTactic {
  id: string;
  label: string;
  weight: number;
}

export interface ScamEntities {
  urls: string[];
  phones: string[];
  emails: string[];
  crypto: string[];
}

export interface UrlFinding {
  url: string;
  safe: boolean | null;
  risk_level?: string;
}

export interface ScamAnalysisResult {
  verdict: ScamVerdict;
  risk_level: RiskLevel;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  tactics: ScamTactic[];
  entities: ScamEntities;
  url_findings: UrlFinding[];
  reasons: string[];
  advice: string[];
  extracted_text?: string;
}

export interface PhoneCheckResult {
  phone: string;
  verdict: 'suspicious' | 'unknown' | 'invalid';
  signals: string[];
  advice: string;
}

export interface ScamStatus {
  analyses_run: number;
  ocr_available: boolean;
  classifier: string;
  sensitivities: Sensitivity[];
}

export const scamDetectorService = {
  async analyzeText(
    text: string,
    sensitivity: Sensitivity = 'balanced',
  ): Promise<{ success: boolean; result?: ScamAnalysisResult; error?: string }> {
    return client().call(RPC_METHODS.SCAM_ANALYZE_TEXT, { text, sensitivity });
  },

  async analyzeImage(
    path: string,
    sensitivity: Sensitivity = 'balanced',
  ): Promise<{ success: boolean; result?: ScamAnalysisResult; error?: string }> {
    return client().call(RPC_METHODS.SCAM_ANALYZE_IMAGE, { path, sensitivity });
  },

  async checkPhone(
    phone: string,
  ): Promise<{ success: boolean; result?: PhoneCheckResult; error?: string }> {
    return client().call(RPC_METHODS.SCAM_CHECK_PHONE, { phone });
  },

  async status(): Promise<{ success: boolean; result?: ScamStatus }> {
    return client().call(RPC_METHODS.SCAM_STATUS);
  },

  // ── Scam Guards (Phase 4) ──
  async guardsStart(): Promise<{ success: boolean; result?: GuardStatus }> {
    return client().call(RPC_METHODS.SCAM_GUARDS_START);
  },
  async guardsStop(): Promise<{ success: boolean; result?: GuardStatus }> {
    return client().call(RPC_METHODS.SCAM_GUARDS_STOP);
  },
  async guardsStatus(): Promise<{ success: boolean; result?: GuardStatus }> {
    return client().call(RPC_METHODS.SCAM_GUARDS_STATUS);
  },
  async guardsAlerts(limit = 25): Promise<{ success: boolean; result?: GuardAlert[] }> {
    return client().call(RPC_METHODS.SCAM_GUARDS_ALERTS, { limit });
  },
  async scamWaves(force = false): Promise<{ success: boolean; result?: ScamWaves }> {
    return client().call(RPC_METHODS.SCAM_GUARDS_WAVES, { force });
  },
  async uploadReports(): Promise<{ success: boolean; result?: { uploaded: number; queued: number } }> {
    return client().call(RPC_METHODS.SCAM_GUARDS_UPLOAD);
  },
};

export interface GuardStatus {
  running: boolean;
  poll_seconds: number;
  alerts_count: number;
  rat_tools_watched: number;
}

export interface GuardAlert {
  type: 'remote_access_tool' | 'clipboard_swap' | string;
  severity: 'medium' | 'high' | 'critical' | string;
  message: string;
  timestamp: string;
  process?: string;
  new_address?: string;
}

export interface ScamWave {
  type: 'host' | 'category';
  value: string;
  reports: number;
}

export interface ScamWaves {
  window_hours: number;
  generated_at: string;
  waves: ScamWave[];
  stale?: boolean;
  error?: string;
}
