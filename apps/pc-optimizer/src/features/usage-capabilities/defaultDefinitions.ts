/**
 * Default Definitions — built-in capabilities, features, and subscriptions.
 *
 * These are the default definitions that ship with the framework.
 * They can be overridden by loading a custom configuration.
 *
 * Adding future plans or capabilities only requires updating
 * this file (or providing a new configuration).
 */
import type {
  CapabilityDefinition,
  FeatureDefinition,
  SubscriptionDefinition,
} from './types';
import { PLAN_TIER_ORDER } from './types';

// ── Default Capabilities ─────────────────────────────────────

export const DEFAULT_CAPABILITIES: CapabilityDefinition[] = [
  {
    id: 'ai_assistant',
    displayName: 'AI Assistant',
    description: 'Explainable AI assistant that answers questions about PC health',
    category: 'ai',
    minimumPlan: 'FREE',
    isVisible: true,
    canBeLimited: true,
    limitDescription: 'Limited to 5 questions per day on Free plan',
  },
  {
    id: 'smart_optimize',
    displayName: 'Smart Optimize',
    description: 'One-click optimization with automatic plan generation and execution',
    category: 'optimization',
    minimumPlan: 'FREE',
    isVisible: true,
    canBeLimited: true,
    limitDescription: 'Limited to 3 optimizations per day on Free plan',
  },
  {
    id: 'startup_cleanup',
    displayName: 'Startup Cleanup',
    description: 'Detect and manage startup applications that slow boot time',
    category: 'optimization',
    minimumPlan: 'PRO',
    isVisible: true,
    canBeLimited: false,
  },
  {
    id: 'browser_cleanup',
    displayName: 'Browser Cleanup',
    description: 'Clean browser cache, cookies, history, and tracking data',
    category: 'privacy',
    minimumPlan: 'FREE',
    isVisible: true,
    canBeLimited: true,
    limitDescription: 'Basic cleanup on Free, deep cleanup on Pro+',
  },
  {
    id: 'duplicate_cleanup',
    displayName: 'Duplicate File Cleanup',
    description: 'Detect and remove duplicate files using SHA-256 hashing',
    category: 'storage',
    minimumPlan: 'PRO',
    isVisible: true,
    canBeLimited: false,
  },
  {
    id: 'report_export',
    displayName: 'Report Export',
    description: 'Export health reports, execution history, and diagnostics',
    category: 'reporting',
    minimumPlan: 'FREE',
    isVisible: true,
    canBeLimited: true,
    limitDescription: 'Text export on Free, PDF/CSV export on Pro+',
  },
  {
    id: 'scheduler',
    displayName: 'Scheduled Maintenance',
    description: 'Schedule automatic health scans and optimization tasks',
    category: 'automation',
    minimumPlan: 'PRO',
    isVisible: true,
    canBeLimited: false,
  },
  {
    id: 'background_monitoring',
    displayName: 'Background Monitoring',
    description: 'Real-time system health monitoring with proactive alerts',
    category: 'automation',
    minimumPlan: 'ULTIMATE',
    isVisible: true,
    canBeLimited: false,
  },
  {
    id: 'cloud_sync',
    displayName: 'Cloud Sync',
    description: 'Synchronize configuration and preferences across devices',
    category: 'cloud',
    minimumPlan: 'PRO',
    isVisible: true,
    canBeLimited: false,
  },
  {
    id: 'trend_history',
    displayName: 'Trend History',
    description: 'Historical health score trends and long-term analysis',
    category: 'analytics',
    minimumPlan: 'PRO',
    isVisible: true,
    canBeLimited: true,
    limitDescription: '7-day history on Free, unlimited on Pro+',
  },
];

// ── Default Features ─────────────────────────────────────────

export const DEFAULT_FEATURES: FeatureDefinition[] = [
  {
    id: 'feature_ai_assistant',
    displayName: 'AI Assistant',
    description: 'Ask AVS AI assistant about your PC health',
    category: 'ai',
    isVisible: true,
    isEnabled: true,
    isLimited: true,
    requiresSubscription: false,
    minimumPlan: 'FREE',
    requiredCapabilities: ['ai_assistant'],
  },
  {
    id: 'feature_smart_optimize',
    displayName: 'Smart Optimize',
    description: 'One-click optimization with rollback support',
    category: 'optimization',
    isVisible: true,
    isEnabled: true,
    isLimited: true,
    requiresSubscription: false,
    minimumPlan: 'FREE',
    requiredCapabilities: ['smart_optimize'],
  },
  {
    id: 'feature_startup_optimizer',
    displayName: 'Startup Optimizer',
    description: 'Manage startup applications and improve boot time',
    category: 'optimization',
    isVisible: true,
    isEnabled: true,
    isLimited: false,
    requiresSubscription: true,
    minimumPlan: 'PRO',
    requiredCapabilities: ['startup_cleanup'],
  },
  {
    id: 'feature_browser_health',
    displayName: 'Browser Health',
    description: 'Clean browser data and protect privacy',
    category: 'privacy',
    isVisible: true,
    isEnabled: true,
    isLimited: true,
    requiresSubscription: false,
    minimumPlan: 'FREE',
    requiredCapabilities: ['browser_cleanup'],
  },
  {
    id: 'feature_duplicate_engine',
    displayName: 'Duplicate Engine',
    description: 'Find and remove duplicate files',
    category: 'storage',
    isVisible: true,
    isEnabled: true,
    isLimited: false,
    requiresSubscription: true,
    minimumPlan: 'PRO',
    requiredCapabilities: ['duplicate_cleanup'],
  },
  {
    id: 'feature_report_export',
    displayName: 'Report Export',
    description: 'Export health and maintenance reports',
    category: 'reporting',
    isVisible: true,
    isEnabled: true,
    isLimited: true,
    requiresSubscription: false,
    minimumPlan: 'FREE',
    requiredCapabilities: ['report_export'],
  },
  {
    id: 'feature_scheduler',
    displayName: 'Scheduled Maintenance',
    description: 'Automate scans and optimizations on a schedule',
    category: 'automation',
    isVisible: true,
    isEnabled: true,
    isLimited: false,
    requiresSubscription: true,
    minimumPlan: 'PRO',
    requiredCapabilities: ['scheduler'],
  },
  {
    id: 'feature_background_monitoring',
    displayName: 'Background Monitoring',
    description: 'Real-time monitoring with proactive alerts',
    category: 'automation',
    isVisible: true,
    isEnabled: true,
    isLimited: false,
    requiresSubscription: true,
    minimumPlan: 'ULTIMATE',
    requiredCapabilities: ['background_monitoring'],
  },
  {
    id: 'feature_cloud_sync',
    displayName: 'Cloud Sync',
    description: 'Sync settings across multiple devices',
    category: 'cloud',
    isVisible: true,
    isEnabled: true,
    isLimited: false,
    requiresSubscription: true,
    minimumPlan: 'PRO',
    requiredCapabilities: ['cloud_sync'],
  },
  {
    id: 'feature_trend_history',
    displayName: 'Trend History',
    description: 'View health score trends over time',
    category: 'analytics',
    isVisible: true,
    isEnabled: true,
    isLimited: true,
    requiresSubscription: true,
    minimumPlan: 'PRO',
    requiredCapabilities: ['trend_history'],
  },
];

// ── Default Subscriptions ────────────────────────────────────

function buildSubscription(
  plan: SubscriptionDefinition['plan'],
  label: string,
  description: string,
  isPaid: boolean,
  capabilities: string[],
  features: string[],
): SubscriptionDefinition {
  return {
    plan,
    label,
    description,
    isPaid,
    capabilities,
    features,
    tierIndex: PLAN_TIER_ORDER.indexOf(plan),
  };
}

export const DEFAULT_SUBSCRIPTIONS: SubscriptionDefinition[] = [
  buildSubscription(
    'FREE',
    'Free',
    'Basic PC health features at no cost',
    false,
    ['ai_assistant', 'smart_optimize', 'browser_cleanup', 'report_export'],
    ['feature_ai_assistant', 'feature_smart_optimize', 'feature_browser_health', 'feature_report_export'],
  ),
  buildSubscription(
    'BETA',
    'Beta',
    'Beta access with all Pro features for testing',
    false,
    ['ai_assistant', 'smart_optimize', 'startup_cleanup', 'browser_cleanup', 'duplicate_cleanup', 'report_export', 'scheduler', 'cloud_sync', 'trend_history'],
    ['feature_ai_assistant', 'feature_smart_optimize', 'feature_startup_optimizer', 'feature_browser_health', 'feature_duplicate_engine', 'feature_report_export', 'feature_scheduler', 'feature_cloud_sync', 'feature_trend_history'],
  ),
  buildSubscription(
    'PRO',
    'Pro',
    'Advanced optimization and privacy features',
    true,
    ['startup_cleanup', 'duplicate_cleanup', 'scheduler', 'cloud_sync', 'trend_history'],
    ['feature_startup_optimizer', 'feature_duplicate_engine', 'feature_scheduler', 'feature_cloud_sync', 'feature_trend_history'],
  ),
  buildSubscription(
    'FAMILY',
    'Family',
    'Pro features for up to 5 devices',
    true,
    ['startup_cleanup', 'duplicate_cleanup', 'scheduler', 'cloud_sync', 'trend_history'],
    ['feature_startup_optimizer', 'feature_duplicate_engine', 'feature_scheduler', 'feature_cloud_sync', 'feature_trend_history'],
  ),
  buildSubscription(
    'ULTIMATE',
    'Ultimate',
    'All features including background monitoring',
    true,
    ['background_monitoring'],
    ['feature_background_monitoring'],
  ),
  buildSubscription(
    'LIFETIME',
    'Lifetime',
    'All features for life, no recurring payments',
    true,
    ['background_monitoring'],
    ['feature_background_monitoring'],
  ),
  buildSubscription(
    'ENTERPRISE',
    'Enterprise',
    'All features with enterprise support and deployment',
    true,
    ['background_monitoring'],
    ['feature_background_monitoring'],
  ),
];

// ── Default Config ───────────────────────────────────────────

import type { CapabilityConfig } from './types';

export const DEFAULT_CONFIG: CapabilityConfig = {
  capabilities: DEFAULT_CAPABILITIES,
  features: DEFAULT_FEATURES,
  subscriptions: DEFAULT_SUBSCRIPTIONS,
};
