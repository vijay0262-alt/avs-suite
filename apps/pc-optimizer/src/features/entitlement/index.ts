/**
 * Entitlement feature — public exports.
 */
export { entitlementService, type EntitlementData, type ProvisionResponse, type EntitlementSyncError, type EntitlementErrorCode } from './entitlementService';
export { useEntitlementStore, useEntitlement, type EntitlementState, type SyncPhase } from './entitlementStore';
