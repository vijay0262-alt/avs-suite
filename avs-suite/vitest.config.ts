import { defineConfig } from 'vitest/config';

/**
 * Root Vitest configuration — used for headless unit tests on `packages/*`
 * and the renderer of each app. Node-DOM environment enables tests that
 * render React components.
 */
export default defineConfig({
  test: {
    // Default to `node` — pure logic tests don't need a DOM. Component
    // tests may opt in per-file via `// @vitest-environment happy-dom`
    // (add `happy-dom` to devDependencies before doing so).
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
