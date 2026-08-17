/**
 * dashboardOptimizationSerializer — converts Dashboard Optimize preview
 * actions into the plain-object format expected by the
 * scan_core.dashboard_optimization.plan RPC (SC-8C13 Phase 2 backend).
 *
 * Privacy: Only the minimum fields required by the backend adapter are
 * serialized. No canonical_path, asset_id, backup_location, registry keys,
 * browser profile paths, raw evidence, executable commands, PowerShell,
 * shell commands, or internal target payloads are sent.
 *
 * The dashboard.optimize.preview RPC returns actions with a human-readable
 * `name` field (e.g. "Temporary Files"). The scan_core.dashboard_optimization.plan
 * RPC expects a `type` field (e.g. "clean_temp_files"). This serializer
 * performs that mapping and strips all sensitive fields.
 */
import type { OptimizeAction } from './dashboard.types';

/**
 * Mapping from Dashboard Optimize preview action names to the backend
 * action type strings expected by DashboardOptimizationAdapter.
 *
 * Supported operations (6):
 * - clean_temp_files → DELETE_FILE via FilesystemExecutor
 * - empty_recycle_bin → DELETE_DIRECTORY via FilesystemExecutor
 * - clean_browser_cache → CLEAR_BROWSER_CACHE via BrowserExecutor
 * - clean_thumbnail_cache → CLEAR_CACHE via BrowserExecutor
 * - clean_prefetch → DELETE_FILE via FilesystemExecutor
 * - clean_windows_update_cache → DELETE_FILE via FilesystemExecutor
 *
 * Unsupported operations (2) — classified as NOT_FIXABLE by the backend:
 * - flush_dns → ActionType.NONE (OUT_OF_SCOPE)
 * - trim_memory → ActionType.NONE (OUT_OF_SCOPE)
 *
 * Unknown names map to undefined, which causes the backend adapter to
 * classify the action as unsupported/NOT_FIXABLE.
 */
const PREVIEW_NAME_TO_TYPE: Record<string, string> = {
  'Temporary Files': 'clean_temp_files',
  'Recycle Bin': 'empty_recycle_bin',
  'Browser Cache': 'clean_browser_cache',
  'Thumbnail Cache': 'clean_thumbnail_cache',
  'Prefetch Files': 'clean_prefetch',
  'Windows Update Cache': 'clean_windows_update_cache',
  'Flush DNS': 'flush_dns',
  'Memory Trim': 'trim_memory',
};

/**
 * Convert a Dashboard Optimize preview action into the plain-object format
 * expected by scan_core.dashboard_optimization.plan RPC.
 *
 * Only safe, non-sensitive fields are included:
 * - id: generated stable ID from the action type
 * - type: the backend action type string (e.g. "clean_temp_files")
 * - title: the human-readable action name
 * - description: the action description
 * - size: estimated bytes recoverable
 * - rollbackAvailable: false (Dashboard Optimize actions are not reversible
 *   through the canonical rollback system)
 *
 * Sensitive fields that are NEVER included:
 * - canonical_path
 * - asset_id
 * - backup_location
 * - registry keys
 * - browser profile paths
 * - raw evidence
 * - executable commands
 * - PowerShell/shell commands
 * - internal target payloads
 */
export function dashboardPreviewActionToRpcPayload(
  action: OptimizeAction,
  index: number,
): Record<string, unknown> {
  const actionType = PREVIEW_NAME_TO_TYPE[action.name] ?? 'unknown';
  return {
    id: `dashboard_opt_${actionType}_${index}`,
    type: actionType,
    title: action.name,
    description: action.description,
    size: action.size,
    rollbackAvailable: false,
  };
}

/**
 * Convert an array of Dashboard Optimize preview actions into the RPC
 * payload format. Each action is sanitized individually.
 */
export function dashboardPreviewToRpcPayload(
  actions: OptimizeAction[],
): Record<string, unknown>[] {
  return actions.map((action, index) => dashboardPreviewActionToRpcPayload(action, index));
}

/**
 * Get the backend action type for a preview action name.
 * Returns undefined for unknown names.
 */
export function getDashboardActionType(previewName: string): string | undefined {
  return PREVIEW_NAME_TO_TYPE[previewName];
}
