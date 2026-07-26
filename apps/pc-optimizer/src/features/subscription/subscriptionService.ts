/**
 * Subscription service — fetches subscription data from the backend.
 *
 * The backend is the single source of truth for plan, status, features.
 * The desktop app never infers plans locally.
 */
import { apiClient } from '../auth/apiClient';

export interface SubscriptionResponse {
  plan: 'FREE' | 'PROFESSIONAL' | string;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  features: string[];
}

export interface HealthResponse {
  status: string;
  database_connected: boolean;
  migration_version: string | null;
  version: string;
}

export async function fetchSubscription(): Promise<SubscriptionResponse> {
  return apiClient.get<SubscriptionResponse>('/api/customer/subscription');
}

export async function fetchServerHealth(): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>('/health', { noAuth: true });
}
