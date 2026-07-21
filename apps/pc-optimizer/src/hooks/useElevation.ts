import { useCallback, useEffect, useState } from 'react';

interface AvsWindow {
  avs?: {
    app?: {
      isAdmin?: () => Promise<boolean>;
      relaunchAsAdmin?: () => Promise<{ success: boolean }>;
    };
  };
}

export interface ElevationState {
  isAdmin: boolean;
  checking: boolean;
  error: string | null;
}

export function useElevation() {
  const [state, setState] = useState<ElevationState>({
    isAdmin: false,
    checking: true,
    error: null,
  });

  const checkAdmin = useCallback(async () => {
    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const w = window as unknown as AvsWindow;
      const isAdmin = w.avs?.app?.isAdmin ? await w.avs.app.isAdmin() : false;
      setState({ isAdmin, checking: false, error: null });
    } catch (err) {
      setState({ isAdmin: false, checking: false, error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    void checkAdmin();
  }, [checkAdmin]);

  const relaunchAsAdmin = useCallback(async () => {
    const w = window as unknown as AvsWindow;
    if (!w.avs?.app?.relaunchAsAdmin) {
      setState((s) => ({ ...s, error: 'Elevation not available in this environment' }));
      return;
    }
    try {
      await w.avs.app.relaunchAsAdmin();
    } catch (err) {
      setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  return {
    ...state,
    checkAdmin,
    relaunchAsAdmin,
  };
}
