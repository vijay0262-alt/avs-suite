import { lazy, Suspense } from 'react';
import { ModuleLoadingState } from '../components/ModuleStates';

const AdvancedSecurityPage = lazy(() => import('../features/advanced-security/AdvancedSecurityPage'));

export default function AdvancedSecurityPageWrapper() {
  return (
    <Suspense fallback={<ModuleLoadingState />}>
      <AdvancedSecurityPage />
    </Suspense>
  );
}
