/**
 * UnifiedOptimizeFlow — deprecated SC-8C9 Phase 2.
 *
 * The legacy dashboard health scan flow is no longer rendered. Users start
 * scans from the authoritative ScanView in the relevant module pages.
 */
import type { DashboardViewModel } from '../DashboardViewModel';

export interface UnifiedOptimizeFlowProps {
  vm: DashboardViewModel;
  isPro?: boolean;
  onClose: () => void;
}

export function UnifiedOptimizeFlow(_props: UnifiedOptimizeFlowProps): null {
  return null;
}
