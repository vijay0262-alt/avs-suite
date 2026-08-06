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
      fontSize: {
        'page-title': ['var(--avs-text-page-title)', { lineHeight: 'var(--avs-text-page-title-lh)', fontWeight: 'var(--avs-font-bold)', letterSpacing: 'var(--avs-tracking-tight)' }],
        'section-title': ['var(--avs-text-section-title)', { lineHeight: 'var(--avs-text-section-title-lh)', fontWeight: 'var(--avs-font-semibold)' }],
        'card-title': ['var(--avs-text-card-title)', { lineHeight: 'var(--avs-text-card-title-lh)', fontWeight: 'var(--avs-font-semibold)' }],
        'body': ['var(--avs-text-body)', { lineHeight: 'var(--avs-text-body-lh)' }],
        'small': ['var(--avs-text-small)', { lineHeight: 'var(--avs-text-small-lh)' }],
        'caption': ['var(--avs-text-caption)', { lineHeight: 'var(--avs-text-caption-lh)' }],
        'micro': ['var(--avs-text-micro)', { lineHeight: 'var(--avs-text-micro-lh)' }],
        'statistic': ['var(--avs-text-statistic)', { lineHeight: 'var(--avs-text-statistic-lh)', fontWeight: 'var(--avs-font-bold)' }],
        'statistic-sm': ['var(--avs-text-statistic-sm)', { lineHeight: 'var(--avs-text-statistic-sm-lh)', fontWeight: 'var(--avs-font-bold)' }],
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
        focus: 'var(--avs-focus-ring)',
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
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--avs-duration-normal) var(--avs-easing)',
        'slide-up': 'slide-up var(--avs-duration-normal) var(--avs-easing)',
        'slide-down': 'slide-down var(--avs-duration-normal) var(--avs-easing)',
        'scale-in': 'scale-in var(--avs-duration-normal) var(--avs-easing)',
        'shimmer': 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
