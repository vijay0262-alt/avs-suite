/**
 * Module Registry Types — central definitions for the Modular Plugin Architecture.
 *
 * Every module (existing and future) exposes metadata and implements the
 * standard OptimizerModule interface. The Dashboard, Health Engine,
 * FeatureGate, and Recommendations all consume from the registry
 * rather than hardcoded module lists.
 */

import type { ModuleId, HealthContribution } from '../health/HealthContribution';
import type { ManagedFeature } from '@avs/licensing';
import type { Recommendation } from '../dashboard/dashboard.types';

// ── Module Lifecycle States (Part 2) ────────────────────────────────

export type ModuleLifecycleState =
  | 'not_installed'
  | 'ready'
  | 'scanning'
  | 'cleaning'
  | 'optimizing'
  | 'completed'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'locked'
  | 'updating';

export interface ModuleLifecycleStateConfig {
  label: string;
  colorClass: string;
  bgClass: string;
  icon?: string;
}

export const MODULE_LIFECYCLE_CONFIG: Record<ModuleLifecycleState, ModuleLifecycleStateConfig> = {
  not_installed: { label: 'Not Installed',  colorClass: 'text-text-muted',        bgClass: 'bg-surface-muted' },
  ready:         { label: 'Ready',          colorClass: 'text-semantic-success',  bgClass: 'bg-semantic-success/10' },
  scanning:      { label: 'Scanning',       colorClass: 'text-brand-primary',     bgClass: 'bg-brand-primary/10' },
  cleaning:      { label: 'Cleaning',       colorClass: 'text-brand-primary',     bgClass: 'bg-brand-primary/10' },
  optimizing:    { label: 'Optimizing',     colorClass: 'text-brand-primary',     bgClass: 'bg-brand-primary/10' },
  completed:     { label: 'Completed',      colorClass: 'text-semantic-success',  bgClass: 'bg-semantic-success/10' },
  warning:       { label: 'Warning',        colorClass: 'text-semantic-warning',  bgClass: 'bg-semantic-warning/10' },
  error:         { label: 'Error',          colorClass: 'text-semantic-danger',   bgClass: 'bg-semantic-danger/10' },
  disabled:      { label: 'Disabled',       colorClass: 'text-text-muted',        bgClass: 'bg-surface-muted' },
  locked:        { label: 'Locked',         colorClass: 'text-text-muted',        bgClass: 'bg-surface-muted' },
  updating:      { label: 'Updating',       colorClass: 'text-brand-primary',     bgClass: 'bg-brand-primary/10' },
};

// ── Module Category ─────────────────────────────────────────────────

export type ModuleCategory =
  | 'cleanup'
  | 'optimization'
  | 'security'
  | 'privacy'
  | 'system'
  | 'future';

// ── Module Capabilities ─────────────────────────────────────────────

export interface ModuleCapabilities {
  canScan: boolean;
  canClean: boolean;
  canOptimize: boolean;
  canRunInBackground: boolean;
}

// ── Module Metadata (Part 1) ────────────────────────────────────────

export interface ModuleMetadata {
  moduleId: ModuleId;
  displayName: string;
  description: string;
  category: ModuleCategory;
  icon: string;
  version: string;
  routePath: string;
  capabilities: ModuleCapabilities;
  /** Feature permissions required for scan/clean/optimize/background. */
  featurePermissions: {
    scan?: ManagedFeature;
    clean?: ManagedFeature;
    optimize?: ManagedFeature;
    background?: ManagedFeature;
  };
  /** Health Engine max penalty (0–100). */
  maxHealthPenalty: number;
  /** Supported operating systems. Empty array = all. */
  supportedOS: string[];
}

// ── Module Statistics ───────────────────────────────────────────────

export interface ModuleStatistics {
  lastScanAt: string | null;
  lastCleanAt: string | null;
  totalScans: number;
  totalCleans: number;
  totalSpaceRecovered: number;
  totalIssuesFixed: number;
}

// ── Standard Module Interface (Part 3) ──────────────────────────────

export interface OptimizerModule {
  readonly metadata: ModuleMetadata;

  // Lifecycle
  initialize(): Promise<void>;
  dispose(): void;

  // Operations
  scan(): Promise<unknown>;
  clean(): Promise<unknown>;
  optimize(): Promise<unknown>;
  cancel(): void;
  refresh(): Promise<void>;

  // Queries
  getStatus(): ModuleLifecycleState;
  getHealthContribution(): Promise<HealthContribution>;
  getRecommendations(): Recommendation[];
  getStatistics(): ModuleStatistics;
}

// ── Registry Entry ──────────────────────────────────────────────────

export interface ModuleRegistryEntry {
  metadata: ModuleMetadata;
  status: ModuleLifecycleState;
  statistics: ModuleStatistics;
  available: boolean;
  locked: boolean;
}
