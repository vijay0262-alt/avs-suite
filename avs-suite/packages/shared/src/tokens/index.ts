/**
 * Design tokens — single source of truth for visual language.
 *
 * These tokens are consumed by:
 *   - Tailwind (via `tailwind.config.js`) as theme extensions
 *   - Runtime CSS variables (see `packages/ui/src/styles/tokens.css`)
 *   - Chart theming (Recharts)
 *   - Native title-bar / window chrome
 *
 * IMPORTANT: never hard-code colours or spacing in components.
 * Always reference these tokens directly or through Tailwind classes.
 */

export const brand = {
  primary: '#0078D4',
  secondary: '#005A9E',
  accent: '#2B88D8',
} as const;

export const semantic = {
  success: '#107C10',
  warning: '#FFB900',
  danger: '#D13438',
  info: '#0078D4',
} as const;

export const neutralLight = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F6',
  border: '#D6DDE5',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
} as const;

export const neutralDark = {
  bg: '#0F172A',
  surface: '#111C36',
  surfaceMuted: '#17223F',
  border: '#22304F',
  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
} as const;

/** 4-pt base spacing scale (rem-friendly multiples of 0.25rem). */
export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

export const radius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

export const shadow = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
  md: '0 4px 12px rgba(15, 23, 42, 0.08)',
  lg: '0 12px 32px rgba(15, 23, 42, 0.12)',
  xl: '0 24px 48px rgba(15, 23, 42, 0.16)',
  focus: '0 0 0 3px rgba(0, 120, 212, 0.35)',
} as const;

export const typography = {
  fontFamilyBase:
    '"Segoe UI Variable", "Segoe UI", Inter, system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMono:
    '"Cascadia Code", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  sizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
    '4xl': '2.25rem',
    '5xl': '3rem',
  },
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeights: { tight: 1.2, normal: 1.5, relaxed: 1.7 },
} as const;

export const motion = {
  duration: {
    instant: '80ms',
    fast: '150ms',
    normal: '220ms',
    slow: '360ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0.1, 1)',
    decelerate: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
  },
} as const;

export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 500,
  modal: 700,
  toast: 900,
  tooltip: 1000,
} as const;

export type BrandTokens = typeof brand;
export type SemanticTokens = typeof semantic;
