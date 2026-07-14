import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Root Vitest configuration.
 *
 * We mirror the Vite aliases from ``apps/pc-optimizer/vite.config.ts``
 * so ViewModel / util tests can import ``@avs/*`` packages by their
 * source paths, exactly as the renderer does at runtime.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@avs/ui': path.resolve(__dirname, 'packages/ui/src'),
      '@avs/core': path.resolve(__dirname, 'packages/core/src'),
      '@avs/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@avs/licensing': path.resolve(__dirname, 'packages/licensing/src'),
      '@avs/updater': path.resolve(__dirname, 'packages/updater/src'),
      '@avs/analytics': path.resolve(__dirname, 'packages/analytics/src'),
    },
  },
  test: {
    // Default env — node. Component-heavy tests opt in via
    // `// @vitest-environment happy-dom` at the top of the file.
    environment: 'node',
    globals: false,
    passWithNoTests: true,
    include: ['apps/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html', 'lcov'],
      include: ['apps/**/src/**', 'packages/**/src/**'],
    },
  },
});
