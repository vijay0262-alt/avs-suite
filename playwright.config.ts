/**
 * Root Playwright config. Individual apps may extend this.
 *
 * The default target for e2e is the packaged Electron binary; we invoke
 * `electron` with `--test` flag so the app enters a deterministic mode
 * (deferred until e2e specs are added).
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
