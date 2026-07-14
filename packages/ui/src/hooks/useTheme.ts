import { useThemeContext } from '../components/ThemeProvider';

/** Convenience alias — most components only need the tuple form. */
export function useTheme() {
  const { mode, effective, setMode } = useThemeContext();
  return { mode, effective, setMode } as const;
}
