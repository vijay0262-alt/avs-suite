/**
 * Pause Conditions — extension points for deferring maintenance execution.
 *
 * Current: no-op (always allows execution).
 *
 * Future placeholders (implemented as extension points):
 *   • Gaming Mode    — pause when a game is detected
 *   • Battery Saver  — pause when on battery with low charge
 *   • Full Screen    — pause when an app is in full screen
 *   • CPU Busy       — pause when CPU usage is high
 *   • User Active    — pause when the user is actively using the PC
 *
 * Each condition is a PauseConditionChecker. Register custom checkers
 * via registerPauseCondition(). The engine queries all registered
 * checkers before starting a job.
 */
import type { PauseConditionChecker, PauseConditionResult } from './types';

// ── Built-in no-op condition ──────────────────────────────────

const alwaysAllow: PauseConditionResult = { shouldPause: false, reason: '' };

// ── Registry ──────────────────────────────────────────────────

const _conditions: PauseConditionChecker[] = [];

export function registerPauseCondition(checker: PauseConditionChecker): () => void {
  _conditions.push(checker);
  return () => {
    const idx = _conditions.indexOf(checker);
    if (idx >= 0) _conditions.splice(idx, 1);
  };
}

export function unregisterAllPauseConditions(): void {
  _conditions.length = 0;
}

export function getRegisteredPauseConditions(): readonly PauseConditionChecker[] {
  return _conditions;
}

/**
 * Evaluate all registered pause conditions.
 * Returns the first condition that says "pause", or "allow" if none do.
 */
export async function evaluatePauseConditions(): Promise<PauseConditionResult> {
  for (const checker of _conditions) {
    try {
      const result = await checker.shouldPause();
      if (result.shouldPause) {
        return result;
      }
    } catch {
      // A checker error should not block execution
    }
  }
  return alwaysAllow;
}

// ── Future placeholder conditions (not yet active) ────────────

export const GamingModePauseCondition: PauseConditionChecker = {
  id: 'gaming_mode',
  displayName: 'Gaming Mode',
  async shouldPause(): Promise<PauseConditionResult> {
    // TODO: Detect if a game is running
    return alwaysAllow;
  },
};

export const BatterySaverPauseCondition: PauseConditionChecker = {
  id: 'battery_saver',
  displayName: 'Battery Saver',
  async shouldPause(): Promise<PauseConditionResult> {
    // TODO: Check battery level and power state
    return alwaysAllow;
  },
};

export const FullScreenPauseCondition: PauseConditionChecker = {
  id: 'full_screen',
  displayName: 'Full Screen Active',
  async shouldPause(): Promise<PauseConditionResult> {
    // TODO: Detect full-screen application
    return alwaysAllow;
  },
};

export const CpuBusyPauseCondition: PauseConditionChecker = {
  id: 'cpu_busy',
  displayName: 'CPU Busy',
  async shouldPause(): Promise<PauseConditionResult> {
    // TODO: Check CPU usage threshold
    return alwaysAllow;
  },
};

export const UserActivePauseCondition: PauseConditionChecker = {
  id: 'user_active',
  displayName: 'User Active',
  async shouldPause(): Promise<PauseConditionResult> {
    // TODO: Check last input time
    return alwaysAllow;
  },
};
