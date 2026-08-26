/**
 * WindowManager — central registry for the main BrowserWindow.
 *
 * Decouples tray and notification code from main/index.ts so they
 * can show/focus the window without circular imports.
 */
import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Show and focus the main window.  If it was hidden (minimized to tray),
 * restore it.  If minimized, un-minimize it.
 */
export function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/**
 * Hide the main window (minimize to tray).  The window stays alive
 * so the renderer state (page, scroll, filters) is preserved.
 */
export function hideMainWindow(): void {
  if (!mainWindow) return;
  mainWindow.hide();
}

/**
 * Check if the main window is currently visible.
 */
export function isMainWindowVisible(): boolean {
  return mainWindow?.isVisible() ?? false;
}

// ── Quit state ─────────────────────────────────────────────────
// Tracks whether the user explicitly chose "Exit AVS Shield" from
// the tray menu.  When true, the window close handler lets the
// window close instead of hiding to tray.

let _isQuitting = false;

export function setIsQuitting(value: boolean): void {
  _isQuitting = value;
}

export function getIsQuitting(): boolean {
  return _isQuitting;
}
