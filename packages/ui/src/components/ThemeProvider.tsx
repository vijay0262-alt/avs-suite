import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemeMode } from '@avs/shared/types';

interface ThemeContextValue {
  mode: ThemeMode;
  effective: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveEffective(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * ThemeProvider — sets the `data-theme` attribute on <html> so the CSS
 * variables in `tokens.css` swap. Persists preference to localStorage.
 */
export function ThemeProvider({
  children,
  initial = 'system',
  storageKey = 'avs.theme',
}: {
  children: ReactNode;
  initial?: ThemeMode;
  storageKey?: string;
}) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return initial;
    return (window.localStorage.getItem(storageKey) as ThemeMode) ?? initial;
  });
  const [effective, setEffective] = useState<'light' | 'dark'>(() => resolveEffective(mode));

  useEffect(() => {
    const next = resolveEffective(mode);
    setEffective(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem(storageKey, mode);
  }, [mode, storageKey]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => setEffective(mql.matches ? 'dark' : 'light');
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, effective, setMode: setModeState }),
    [mode, effective],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within <ThemeProvider>');
  return ctx;
}
