/**
 * useModuleRegistry — React hook that subscribes to the Module Registry
 * and re-renders when module statuses change.
 *
 * The Dashboard uses this to dynamically display module cards without
 * knowing about individual modules.
 */

import { useState, useEffect, useMemo } from 'react';
import { moduleRegistry } from './ModuleRegistry';
import type { ModuleRegistryEntry } from './moduleRegistry.types';

export function useModuleRegistry(): ModuleRegistryEntry[] {
  const [entries, setEntries] = useState<ModuleRegistryEntry[]>(
    () => moduleRegistry.getRegistryEntries(),
  );

  useEffect(() => {
    const unsubscribe = moduleRegistry.subscribe((updated) => {
      setEntries(updated);
    });
    // Sync immediately in case modules were registered after initial render
    setEntries(moduleRegistry.getRegistryEntries());
    return unsubscribe;
  }, []);

  return entries;
}

export function useAvailableModules(): ModuleRegistryEntry[] {
  const entries = useModuleRegistry();
  return useMemo(() => entries.filter((e) => e.available), [entries]);
}

export function useModuleByPath(path: string): ModuleRegistryEntry | undefined {
  const entries = useModuleRegistry();
  return useMemo(() => entries.find((e) => e.metadata.routePath === path), [entries, path]);
}
