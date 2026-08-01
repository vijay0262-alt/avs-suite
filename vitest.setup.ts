// Tell React that we are in a test environment that supports act().
// Without this, React 18 emits "The current testing environment is not
// configured to support act(...)" warnings on every render.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
