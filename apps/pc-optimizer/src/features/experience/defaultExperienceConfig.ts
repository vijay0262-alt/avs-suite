/**
 * Default Experience Configuration.
 *
 * All messages, upgrade reasons, feature mappings, plan mappings,
 * visibility rules, and recommendation rules are data-driven.
 * No hardcoded strings in the engine logic.
 */
import type { ExperienceConfig } from './types';

export const DEFAULT_EXPERIENCE_CONFIG: ExperienceConfig = {
  planLabels: {
    FREE: 'Free',
    PRO: 'Pro',
    ULTIMATE: 'Ultimate',
    LIFETIME: 'Lifetime',
    BETA: 'Beta',
    ENTERPRISE: 'Enterprise',
    FAMILY: 'Family',
  },

  messages: {
    quotaExceeded: 'You have reached your daily limit for this feature.',
    featureLocked: 'This feature is available with a higher plan.',
    trialAvailable: 'Start your free trial to unlock all Pro features.',
    trialExpired: 'Your trial has ended. Upgrade to continue using Pro features.',
    upgradeAvailable: 'Upgrade to unlock unlimited access.',
  },

  trialConfig: {
    defaultDurationDays: 14,
    trialPlan: 'PRO',
    maxTrials: 1,
    enabled: true,
    featureTrials: [
      { featureId: 'feature_ai_assistant', durationDays: 7 },
      { featureId: 'feature_smart_optimize', durationDays: 7 },
    ],
  },

  visibilityRules: [
    {
      featureId: 'feature_ai_assistant',
      defaultVisibility: 'visible',
      planVisibility: {},
      badgeText: { FREE: '5/day', PRO: 'Unlimited' },
      displayMessage: { FREE: '5 conversations per day', PRO: 'Unlimited conversations' },
    },
    {
      featureId: 'feature_smart_optimize',
      defaultVisibility: 'visible',
      planVisibility: {},
      badgeText: { FREE: '3/day', PRO: 'Unlimited' },
      displayMessage: { FREE: '3 optimizations per day', PRO: 'Unlimited optimizations' },
    },
    {
      featureId: 'feature_startup_optimizer',
      defaultVisibility: 'visible',
      planVisibility: { FREE: 'limited' },
      badgeText: { FREE: 'Pro', PRO: '' },
      displayMessage: { FREE: 'Upgrade to Pro to manage startup applications' },
    },
    {
      featureId: 'feature_browser_health',
      defaultVisibility: 'visible',
      planVisibility: {},
      badgeText: { FREE: 'Basic', PRO: 'Deep' },
      displayMessage: { FREE: 'Basic browser cleanup', PRO: 'Deep browser cleanup' },
    },
    {
      featureId: 'feature_duplicate_engine',
      defaultVisibility: 'visible',
      planVisibility: { FREE: 'limited' },
      badgeText: { FREE: 'Pro', PRO: '' },
      displayMessage: { FREE: 'Upgrade to Pro to find and remove duplicates' },
    },
    {
      featureId: 'feature_report_export',
      defaultVisibility: 'visible',
      planVisibility: {},
      badgeText: { FREE: 'Text', PRO: 'PDF/CSV' },
      displayMessage: { FREE: 'Text export only', PRO: 'PDF and CSV export' },
    },
    {
      featureId: 'feature_scheduler',
      defaultVisibility: 'visible',
      planVisibility: { FREE: 'limited' },
      badgeText: { FREE: 'Pro', PRO: '' },
      displayMessage: { FREE: 'Upgrade to Pro to schedule automatic maintenance' },
    },
    {
      featureId: 'feature_background_monitoring',
      defaultVisibility: 'visible',
      planVisibility: { FREE: 'limited', PRO: 'limited' },
      badgeText: { FREE: 'Ultimate', PRO: 'Ultimate' },
      displayMessage: { FREE: 'Upgrade to Ultimate for real-time monitoring', PRO: 'Upgrade to Ultimate for real-time monitoring' },
    },
    {
      featureId: 'feature_cloud_sync',
      defaultVisibility: 'visible',
      planVisibility: { FREE: 'limited' },
      badgeText: { FREE: 'Pro', PRO: '' },
      displayMessage: { FREE: 'Upgrade to Pro to sync settings across devices' },
    },
    {
      featureId: 'feature_trend_history',
      defaultVisibility: 'visible',
      planVisibility: { FREE: 'limited' },
      badgeText: { FREE: '7 days', PRO: 'Unlimited' },
      displayMessage: { FREE: '7-day history on Free', PRO: 'Unlimited history on Pro' },
    },
  ],

  recommendationRules: [
    {
      featureId: 'feature_ai_assistant',
      triggerQuotaId: 'ai_conversations',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You are using AI Assistant frequently. Upgrade for unlimited conversations.',
      benefits: [
        { what: 'Unlimited AI conversations', detail: 'Ask as many questions as you want, anytime' },
        { what: 'Deeper insights', detail: 'Access to advanced analysis and recommendations' },
      ],
      urgency: 'medium',
      contextHint: 'ai_usage',
    },
    {
      featureId: 'feature_smart_optimize',
      triggerQuotaId: 'smart_optimize_runs',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You have reached your Smart Optimize limit. Upgrade for unlimited optimizations.',
      benefits: [
        { what: 'Unlimited optimizations', detail: 'Optimize as often as you need' },
        { what: 'Scheduled optimization', detail: 'Set up automatic optimization on your schedule' },
      ],
      urgency: 'high',
      contextHint: 'optimize_limit',
    },
    {
      featureId: 'feature_startup_optimizer',
      triggerQuotaId: 'startup_changes',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You are managing startup applications. Upgrade to Pro for full control.',
      benefits: [
        { what: 'Full startup management', detail: 'Enable, disable, and delay startup applications' },
        { what: 'Impact analysis', detail: 'See how each app affects your boot time' },
      ],
      urgency: 'low',
      contextHint: 'startup_access',
    },
    {
      featureId: 'feature_duplicate_engine',
      triggerQuotaId: 'duplicate_removals',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You are cleaning duplicate files. Upgrade to Pro for unlimited duplicate removal.',
      benefits: [
        { what: 'Unlimited duplicate removal', detail: 'Remove as many duplicates as you find' },
        { what: 'SHA-256 verification', detail: 'Ensure every duplicate is a true match' },
      ],
      urgency: 'medium',
      contextHint: 'duplicate_limit',
    },
    {
      featureId: 'feature_scheduler',
      triggerQuotaId: 'automation_executions',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You are using automation. Upgrade to Pro for unlimited scheduled maintenance.',
      benefits: [
        { what: 'Unlimited scheduled tasks', detail: 'Create as many schedules as you need' },
        { what: 'Automatic maintenance', detail: 'Keep your PC optimized without lifting a finger' },
      ],
      urgency: 'medium',
      contextHint: 'scheduler_access',
    },
    {
      featureId: 'feature_trend_history',
      triggerQuotaId: 'trend_history_access',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You check trends frequently. Upgrade for unlimited history access.',
      benefits: [
        { what: 'Unlimited history', detail: 'View trends from any time period' },
        { what: 'Long-term analysis', detail: 'Track your PC health over months and years' },
      ],
      urgency: 'low',
      contextHint: 'trend_access',
    },
    {
      featureId: 'feature_report_export',
      triggerQuotaId: 'pdf_exports',
      triggerThreshold: 0,
      recommendedPlan: 'PRO',
      reason: 'You export reports often. Upgrade for unlimited PDF and CSV exports.',
      benefits: [
        { what: 'Unlimited exports', detail: 'Export as many reports as you need' },
        { what: 'PDF and CSV formats', detail: 'Choose the format that works for you' },
      ],
      urgency: 'low',
      contextHint: 'export_usage',
    },
    {
      featureId: 'feature_background_monitoring',
      triggerQuotaId: 'cloud_syncs',
      triggerThreshold: 0,
      recommendedPlan: 'ULTIMATE',
      reason: 'You want proactive protection. Upgrade to Ultimate for real-time monitoring.',
      benefits: [
        { what: 'Real-time monitoring', detail: 'Get alerts before problems affect your PC' },
        { what: 'Background automation', detail: 'Automatic optimization without interruptions' },
        { what: 'Cloud sync', detail: 'Sync your settings across all your devices' },
      ],
      urgency: 'low',
      contextHint: 'monitoring_access',
    },
  ],
};
