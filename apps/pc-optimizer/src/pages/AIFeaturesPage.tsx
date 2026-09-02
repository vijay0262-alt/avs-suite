import { lazy, Suspense } from 'react';
import { ModuleLoadingState } from '../components/ModuleStates';

const AIFeaturesPage = lazy(() => import('../features/ai-features/AIFeaturesPage'));

export default function AIFeaturesPageWrapper() {
  return (
    <Suspense fallback={<ModuleLoadingState />}>
      <AIFeaturesPage />
    </Suspense>
  );
}
