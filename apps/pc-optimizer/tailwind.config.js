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
          elevated: 'var(--avs-surface-elevated)',
        },
        bg: 'var(--avs-bg)',
        border: {
          DEFAULT: 'var(--avs-border)',
          hover: 'var(--avs-border-hover)',
        },
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
        '2xl': 'var(--avs-radius-2xl)',
      },
      boxShadow: {
        sm: 'var(--avs-shadow-sm)',
        md: 'var(--avs-shadow-md)',
        lg: 'var(--avs-shadow-lg)',
        glow: 'var(--avs-shadow-glow)',
      },
      backgroundImage: {
        'gradient-brand': 'var(--avs-gradient-brand)',
        'gradient-surface': 'var(--avs-gradient-surface)',
        'gradient-glow': 'var(--avs-gradient-glow)',
      },
      transitionTimingFunction: {
        bounce: 'var(--avs-easing-bounce)',
      },
      transitionDuration: {
        slow: 'var(--avs-duration-slow)',
      },
    },
  },
  plugins: [],
};
