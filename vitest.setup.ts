// Register @testing-library/jest-dom custom matchers (toBeInTheDocument,
// toHaveTextContent, toBeDisabled, etc.) so component tests can use them
// without each test file needing its own import.
import '@testing-library/jest-dom/vitest';

// Auto-cleanup DOM between tests. With `globals: false` in vitest.config.ts,
// @testing-library/react's built-in auto-cleanup (which relies on a global
// afterEach) does not run, so we register it explicitly here.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(() => {
  cleanup();
});

// Tell React that we are in a test environment that supports act().
// Without this, React 18 emits "The current testing environment is not
// configured to support act(...)" warnings on every render.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
