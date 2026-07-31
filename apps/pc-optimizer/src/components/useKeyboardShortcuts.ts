/**
 * useKeyboardShortcuts — global keyboard shortcut registry.
 *
 * Registers app-wide shortcuts:
 *   Ctrl+K      — Focus global search (handled in GlobalSearch)
 *   Alt+Left    — Navigate back
 *   Alt+Right   — Navigate forward
 *   Escape      — Close modals / overlays (delegated to individual components)
 *   Ctrl+,      — Go to Settings
 *   Ctrl+D      — Go to Dashboard
 *
 * Usage:
 *   useKeyboardShortcuts();
 *   // Called once in AppLayout
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useKeyboardShortcuts(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Alt+Left — navigate back
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigate(-1);
        return;
      }

      // Alt+Right — navigate forward
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigate(1);
        return;
      }

      // Ctrl+, — go to settings (common pattern in IDEs and electron apps)
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        navigate('/settings');
        return;
      }

      // Ctrl+D — go to dashboard
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        navigate('/dashboard');
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}

/**
 * Keyboard shortcut definitions for display in help / settings.
 */
export const KEYBOARD_SHORTCUTS: readonly { keys: string; description: string }[] = [
  { keys: 'Ctrl+K', description: 'Open global search' },
  { keys: 'Alt+Left', description: 'Navigate back' },
  { keys: 'Alt+Right', description: 'Navigate forward' },
  { keys: 'Ctrl+D', description: 'Go to Dashboard' },
  { keys: 'Ctrl+,', description: 'Go to Settings' },
  { keys: 'Escape', description: 'Close dialogs and overlays' },
];
