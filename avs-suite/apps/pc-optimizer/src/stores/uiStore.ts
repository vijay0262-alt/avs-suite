/**
 * Global UI store — Zustand.
 *
 * Only cross-cutting UI state lives here (sidebar collapsed, active
 * toasts, current locale). Feature-local state stays inside its
 * ViewModel (see `@avs/core/mvvm`).
 */
import { create } from 'zustand';
import type { LocaleCode } from '@avs/shared/i18n';

interface UiState {
  sidebarCollapsed: boolean;
  locale: LocaleCode;
  setSidebarCollapsed: (v: boolean) => void;
  setLocale: (l: LocaleCode) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  locale: 'en',
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
  setLocale: (l) => set({ locale: l }),
}));
