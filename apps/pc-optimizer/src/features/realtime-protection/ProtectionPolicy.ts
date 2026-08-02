/**
 * ProtectionPolicy — enforces protection policies based on mode.
 *
 * Modes:
 *   - disabled: No monitoring
 *   - passive: Monitor and log, no user interaction
 *   - interactive: Monitor, notify, and prompt for actions
 *   - maximum: Monitor, notify, auto-quarantine, block threats
 *   - enterprise: Centralized policy-driven protection
 */
import type { ProtectionPolicy, ProtectionMode, EventSeverity, SystemEvent } from './types';
import { DEFAULT_PROTECTION_POLICY, meetsSeverityThreshold, modeAllowsAutoAction, modeAllowsBlocking, modeAllowsAutoQuarantine } from './types';

export class ProtectionPolicyManager {
  private policy: ProtectionPolicy;

  constructor(policy?: Partial<ProtectionPolicy>) {
    this.policy = { ...DEFAULT_PROTECTION_POLICY, ...policy };
  }

  get(): ProtectionPolicy {
    return { ...this.policy };
  }

  update(updates: Partial<ProtectionPolicy>): void {
    this.policy = { ...this.policy, ...updates };
  }

  setMode(mode: ProtectionMode): void {
    this.policy.mode = mode;
  }

  getMode(): ProtectionMode {
    return this.policy.mode;
  }

  shouldInvestigate(event: SystemEvent): boolean {
    if (this.policy.mode === 'disabled') return false;
    if (!this.policy.autoInvestigate) return false;
    return meetsSeverityThreshold(event.severity, this.policy.minSeverityForInvestigation);
  }

  shouldNotify(event: SystemEvent): boolean {
    if (this.policy.mode === 'disabled') return false;
    if (!this.policy.autoNotify) return false;
    return meetsSeverityThreshold(event.severity, this.policy.minSeverityForNotification);
  }

  shouldQuarantine(event: SystemEvent): boolean {
    if (this.policy.mode === 'disabled') return false;
    if (!this.policy.autoQuarantine) return false;
    if (!modeAllowsAutoQuarantine(this.policy.mode)) return false;
    return meetsSeverityThreshold(event.severity, this.policy.minSeverityForQuarantine);
  }

  shouldBlock(event: SystemEvent): boolean {
    if (this.policy.mode === 'disabled') return false;
    if (!modeAllowsBlocking(this.policy.mode)) return false;

    if (this.policy.blockUnsignedExecutables && event.target.signatureStatus === 'unsigned' && event.target.type === 'file') {
      return true;
    }

    if (this.policy.blockScriptsFromTemp && event.category === 'file_system' && event.target.path.includes('Temp')) {
      const scriptExtensions = ['.ps1', '.bat', '.cmd', '.vbs', '.js'];
      if (scriptExtensions.some((ext) => event.target.name.toLowerCase().endsWith(ext))) {
        return true;
      }
    }

    if (this.policy.blockUsbAutoRun && event.type === 'usb_inserted') {
      return true;
    }

    return false;
  }

  shouldMonitor(type: SystemEvent['category']): boolean {
    if (this.policy.mode === 'disabled') return false;

    switch (type) {
      case 'file_system': return true;
      case 'process': return true;
      case 'service': return this.policy.monitorServices;
      case 'scheduled_task': return this.policy.monitorScheduledTasks;
      case 'startup': return this.policy.monitorStartupChanges;
      case 'registry': return this.policy.monitorRegistryRunKeys;
      case 'browser': return this.policy.monitorBrowserChanges;
      case 'download': return this.policy.monitorDownloads;
      case 'usb': return true;
      case 'network': return this.policy.monitorNetworkProfiles;
      default: return true;
    }
  }

  allowsAutoAction(): boolean {
    return modeAllowsAutoAction(this.policy.mode);
  }

  allowsBlocking(): boolean {
    return modeAllowsBlocking(this.policy.mode);
  }

  isEnterpriseMode(): boolean {
    return this.policy.enterpriseMode;
  }

  isCentralManagement(): boolean {
    return this.policy.centralManagement;
  }

  getMinSeverityForNotification(): EventSeverity {
    return this.policy.minSeverityForNotification;
  }

  getMinSeverityForInvestigation(): EventSeverity {
    return this.policy.minSeverityForInvestigation;
  }

  getMinSeverityForQuarantine(): EventSeverity {
    return this.policy.minSeverityForQuarantine;
  }
}
