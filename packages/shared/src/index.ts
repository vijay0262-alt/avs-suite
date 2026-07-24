/**
 * @avs/shared — root barrel.
 *
 * Cross-cutting primitives that every app and package can depend on:
 *   - Design tokens (colors, spacing, typography, radii, shadows, motion)
 *   - Feature flags & edition gating
 *   - i18n keys + locale registry
 *   - Environment resolution (dev / staging / prod)
 *   - JSON-RPC schema shared with the Python backend
 *   - Common constants, types and pure utilities
 */
export * as tokens from './tokens';
export * as i18n from './i18n';
export * as featureFlags from './featureFlags';
export * as productRegistry from './productRegistry';
export * as env from './env';
export * as rpc from './rpc';
export * as constants from './constants';
export * as types from './types';
export * as utils from './utils';
