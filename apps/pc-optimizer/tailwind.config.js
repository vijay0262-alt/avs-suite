/**
 * Tailwind is configured to consume the AVS design tokens as CSS
 * variables. Do NOT add hex colours here — extend by referencing a
 * `--avs-*` variable so light/dark switch remains a single source.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--avs-brand-primary)',
          secondary: 'var(--avs-brand-secondary)',
          accent: 'var(--avs-brand-accent)',
        },
        surface: {
          DEFAULT: 'var(--avs-surface)',
          muted: 'var(--avs-surface-muted)',
        },
        bg: 'var(--avs-bg)',
        border: 'var(--avs-border)',
        text: {
          primary: 'var(--avs-text-primary)',
          secondary: 'var(--avs-text-secondary)',
          muted: 'var(--avs-text-muted)',
        },
        semantic: {
          success: 'var(--avs-success)',
          warning: 'var(--avs-warning)',
          danger: 'var(--avs-danger)',
          info: 'var(--avs-info)',
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'Inter',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--avs-radius-sm)',
        md: 'var(--avs-radius-md)',
        lg: 'var(--avs-radius-lg)',
        xl: 'var(--avs-radius-xl)',
      },
    },
  },
  plugins: [],
};
