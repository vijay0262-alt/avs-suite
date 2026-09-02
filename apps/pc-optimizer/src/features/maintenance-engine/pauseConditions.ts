/**
 * Pause Conditions — extension points for deferring maintenance execution.
 *
 * Built-in conditions query the backend for real system state:
 *   • Gaming Mode    — pause when Game/Movie Mode is active or fullscreen detected
 *   • Battery Saver  — pause when on battery with low charge
 *   • Full Screen    — pause when a fullscreen application is detected
 *   • CPU Busy       — pause when CPU usage is high
 *   • User Active    — pause when the user is actively using the PC (low idle time)
 *
 * Each condition is a PauseConditionChecker. Register custom checkers
 * via registerPauseCondition(). The engine queries all registered
 * checkers before starting a job.
 */
import type { PauseConditionChecker, PauseConditionResult } from './types';

// ── Helpers ────────────────────────────────────────────────────────

const allow: PauseConditionResult = { shouldPause: false, reason: '' };

function pause(reason: string): PauseConditionResult {
  return { shouldPause: true, reason };
}

interface DashboardMetrics {
  cpu?: { usage?: number };
}
interface BatteryStatus {
  present?: boolean;
  percent?: number;
  powerPlugged?: boolean;
  supported?: boolean;
}
interface AutoCareStatus {
  currentIdleSeconds?: number;
  supported?: boolean;
}
interface GameModeStatus {
  active?: boolean;
  fullscreen_detected?: boolean;
}

async function rpcCall<T>(method: string, params?: Record<string, unknown>): Promise<T | null> {
  if (typeof window === 'undefined' || !window.avs) {
    return null;
  }
  try {
    return await window.avs.rpc.call<T>(method, params);
  } catch {
    return null;
  }
}

// ── Registry ──────────────────────────────────────────────────────

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
  return allow;
}

// ── Built-in conditions ───────────────────────────────────────────

/** Pause when Game/Movie Mode is active or a fullscreen app is detected. */
export const GamingModePauseCondition: PauseConditionChecker = {
  id: 'gaming_mode',
  displayName: 'Gaming Mode',
  async shouldPause(): Promise<PauseConditionResult> {
    const res = await rpcCall<{ status?: GameModeStatus }>('ai_features.gameMode.status');
    const status = res?.status;
    if (status?.active) {
      return pause('Game/Movie Mode is active');
    }
    if (status?.fullscreen_detected) {
      return pause('Fullscreen application detected');
    }
    return allow;
  },
};

/** Pause when running on battery with low charge (below 20%). */
export const BatterySaverPauseCondition: PauseConditionChecker = {
  id: 'battery_saver',
  displayName: 'Battery Saver',
  async shouldPause(): Promise<PauseConditionResult> {
    const res = await rpcCall<BatteryStatus>('hardware.battery');
    if (!res?.supported || !res?.present) {
      return allow;
    }
    if (!res.powerPlugged && (res.percent ?? 100) < 20) {
      return pause(`Low battery: ${Math.round(res.percent ?? 0)}% — on battery power`);
    }
    return allow;
  },
};

/** Pause when a fullscreen application is detected. */
export const FullScreenPauseCondition: PauseConditionChecker = {
  id: 'full_screen',
  displayName: 'Full Screen Active',
  async shouldPause(): Promise<PauseConditionResult> {
    const res = await rpcCall<{ status?: GameModeStatus }>('ai_features.gameMode.status');
    if (res?.status?.fullscreen_detected) {
      return pause('Fullscreen application is running');
    }
    return allow;
  },
};

/** Pause when CPU usage is above 80%. */
export const CpuBusyPauseCondition: PauseConditionChecker = {
  id: 'cpu_busy',
  displayName: 'CPU Busy',
  async shouldPause(): Promise<PauseConditionResult> {
    const res = await rpcCall<DashboardMetrics>('dashboard.metrics');
    const usage = res?.cpu?.usage;
    if (typeof usage === 'number' && usage > 80) {
      return pause(`CPU usage is high: ${Math.round(usage)}%`);
    }
    return allow;
  },
};

/** Pause when the user is actively using the PC (idle time < 2 minutes). */
export const UserActivePauseCondition: PauseConditionChecker = {
  id: 'user_active',
  displayName: 'User Active',
  async shouldPause(): Promise<PauseConditionResult> {
    const res = await rpcCall<AutoCareStatus>('auto_care.status');
    if (!res?.supported) {
      return allow;
    }
    const idle = res.currentIdleSeconds ?? 0;
    if (idle < 120) {
      return pause('User is actively using the PC');
    }
    return allow;
  },
};
