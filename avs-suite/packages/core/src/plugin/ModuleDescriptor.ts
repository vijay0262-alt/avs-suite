/**
 * Module (feature-plugin) descriptor. New products (Driver Updater, VPN)
 * and even in-app features register themselves via this descriptor so
 * the shell can render nav, routes, and permissions without knowing the
 * concrete implementations.
 */
import type { ComponentType } from 'react';
import type { FeatureKey } from '@avs/shared/featureFlags';
import type { NavItemId } from '@avs/shared/types';

export interface ModuleDescriptor {
  /** Stable id, kebab-case; must match a `NavItemId` for built-in nav. */
  id: NavItemId | string;
  /** Human-readable name shown in nav (i18n key preferred). */
  labelKey: string;
  /** Route path segment mounted below `/`. */
  routePath: string;
  /** Icon component (Heroicons or custom). */
  icon: ComponentType<{ className?: string }>;
  /** Lazy-loaded React page component. */
  page: () => Promise<{ default: ComponentType }>;
  /** Optional feature flag that must be enabled for this module. */
  requires?: FeatureKey;
  /** Sort order in the sidebar (ascending). */
  order: number;
}
