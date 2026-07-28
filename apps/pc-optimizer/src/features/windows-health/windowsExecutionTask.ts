/**
 * Windows Execution Task — implements the MaintenanceTask interface
 * for safe Windows maintenance actions.
 *
 * Initially allows ONLY:
 *   • Open Windows Update
 *   • Open Security Settings
 *   • Trigger Windows Update Scan
 *   • Clear Windows Update Cache (optional)
 *
 * NEVER:
 *   • Disable security features
 *   • Modify Defender configuration
 *   • Install drivers
 *   • Change BitLocker
 *   • Modify TPM
 *   • Modify Secure Boot
 *   • Registry editing
 *
 * This module does NOT modify the Execution Engine architecture.
 */
import { BaseMaintenanceTask, getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import type { ValidationResult, TaskResult } from '../maintenance-engine/types';
import { registerTask } from '../maintenance-engine/tasks/index';
import type {
  WindowsExecutionConfig,
  WindowsActionType,
  WindowsActionRecord,
} from './types';
import { windowsEvents } from './windowsEvents';

let _actionCounter = 0;

function generateActionId(): string {
  _actionCounter += 1;
  return `windows-action-${Date.now().toString(36)}-${_actionCounter}`;
}

const FORBIDDEN_ACTIONS: string[] = [
  'disable_defender',
  'disable_firewall',
  'disable_smart_screen',
  'disable_secure_boot',
  'modify_tpm',
  'modify_bitlocker',
  'install_driver',
  'registry_edit',
  'change_security_config',
];

export class WindowsExecutionTask extends BaseMaintenanceTask {
  readonly displayName = 'Windows System Health';
  readonly description = 'Performs safe Windows maintenance: open settings, trigger update scans, clear update cache.';

  private _config: WindowsExecutionConfig | null = null;
  private _actionRecords: WindowsActionRecord[] = [];

  constructor() {
    super('windows-health');
  }

  setConfig(config: WindowsExecutionConfig): void {
    this._config = config;
  }

  getActionRecords(): WindowsActionRecord[] {
    return [...this._actionRecords];
  }

  estimateDuration(): number {
    if (!this._config) return 0;
    let total = 0;
    for (const action of this._config.actions) {
      switch (action) {
        case 'open_windows_update':
        case 'open_security_settings':
          total += 2000;
          break;
        case 'trigger_update_scan':
          total += 30000;
          break;
        case 'clear_update_cache':
          total += 15000;
          break;
        default:
          total += 5000;
      }
    }
    return total;
  }

  async validate(): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
    }

    if (!this._config) {
      errors.push('No execution configuration set');
    } else if (this._config.actions.length === 0) {
      warnings.push('No actions configured');
    } else {
      for (const action of this._config.actions) {
        if (FORBIDDEN_ACTIONS.includes(action)) {
          errors.push(`Action ${action} is forbidden — this task never modifies security, drivers, or system configuration`);
        }
      }
    }

    return { canRun: errors.length === 0, warnings, errors };
  }

  async execute(): Promise<TaskResult> {
    return this.runSafely(async () => {
      const rpc = getRpcBridge();
      if (!rpc) {
        this._errors.push('RPC bridge unavailable');
        return;
      }

      if (!this._config) {
        this._errors.push('No configuration set');
        return;
      }

      this._actionRecords = [];
      windowsEvents.emit('windows_execution_started', { actions: this._config.actions });

      try {
        for (const action of this._config.actions) {
          await this._executeAction(rpc, action);
        }

        windowsEvents.emit('windows_execution_completed', { records: this._actionRecords });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        windowsEvents.emit('windows_execution_failed', { error: msg, partialRecords: this._actionRecords });
        this._errors.push(msg);
      }
    });
  }

  private async _executeAction(
    rpc: { call: (method: string, params?: unknown) => Promise<unknown> },
    action: WindowsActionType,
  ): Promise<void> {
    const startTime = Date.now();
    let success = true;
    let errorMessage: string | null = null;

    try {
      switch (action) {
        case 'open_windows_update':
          await rpc.call('windows.openUpdate');
          break;
        case 'open_security_settings':
          await rpc.call('windows.openSecurity');
          break;
        case 'trigger_update_scan':
          await rpc.call('windows.updateScan');
          break;
        case 'clear_update_cache':
          await rpc.call('windows.clearUpdateCache');
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (err) {
      success = false;
      errorMessage = err instanceof Error ? err.message : String(err);
      this._errors.push(`Action ${action} failed: ${errorMessage}`);
    }

    const record: WindowsActionRecord = {
      id: generateActionId(),
      actionType: action,
      timestamp: new Date().toISOString(),
      success,
      errorMessage,
      durationMs: Date.now() - startTime,
    };
    this._actionRecords.push(record);

    if (success) {
      this._filesCleaned += 1;
    }
  }
}

export const WINDOWS_TASK_ID = 'windows_health';

registerTask(WINDOWS_TASK_ID, () => new WindowsExecutionTask());
