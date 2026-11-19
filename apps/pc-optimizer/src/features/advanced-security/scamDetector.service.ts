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
};
