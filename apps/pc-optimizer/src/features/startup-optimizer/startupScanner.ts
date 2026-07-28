/**
 * Startup Scanner — discovers startup entries from the system
 * via the existing RPC bridge.
 *
 * Sources scanned:
 *   • Windows Startup Folder (Current User)
 *   • Windows Startup Folder (All Users)
 *   • HKCU\Software\Microsoft\Windows\CurrentVersion\Run
 *   • HKLM\Software\Microsoft\Windows\CurrentVersion\Run
 *   • Task Scheduler (startup-triggered tasks)
 *   • Startup Services (read-only)
 *
 * The scanner uses the existing `startupService` for RPC calls
 * and does NOT modify it.
 */
import type { StartupEntry, StartupSource, UserScope, SignatureStatus } from './types';
import { generateEntryId, isProtectedApp } from './types';
import { startupService } from '../startup/startup.service';
import type { StartupEntry as RawStartupEntry } from '../startup/startup.types';
import { startupEvents } from './startupEvents';

/**
 * Map raw source strings from the RPC service to our typed source.
 */
function mapSource(raw: string): StartupSource {
  switch (raw) {
    case 'registry':
      return 'registry_hkcu_run'; // Default to HKCU; the RPC doesn't distinguish
    case 'folder':
      return 'startup_folder_user';
    case 'task':
      return 'task_scheduler';
    default:
      return 'registry_hkcu_run';
  }
}

/**
 * Map raw impact strings from the RPC service to our typed impact.
 */
function mapImpactLevel(raw: string): 'low' | 'medium' | 'high' | 'none' {
  switch (raw) {
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'none';
  }
}

/**
 * Map signature status string to typed status.
 */
function mapSignatureStatus(raw: string | undefined): SignatureStatus {
  if (!raw) return 'unknown';
  const lower = raw.toLowerCase();
  if (lower.includes('microsoft')) return 'microsoft';
  if (lower.includes('avs')) return 'avs';
  if (lower.includes('signed')) return 'signed';
  if (lower.includes('unsigned')) return 'unsigned';
  return 'unknown';
}

/**
 * Determine user scope from the source.
 */
function scopeFromSource(source: StartupSource): UserScope {
  switch (source) {
    case 'registry_hklm_run':
    case 'startup_folder_all':
    case 'startup_services':
      return 'all_users';
    case 'task_scheduler':
      return 'system';
    default:
      return 'current_user';
  }
}

/**
 * Determine launch type from source.
 */
function launchTypeFromSource(source: StartupSource): 'registry' | 'folder' | 'task' | 'service' {
  switch (source) {
    case 'registry_hkcu_run':
    case 'registry_hklm_run':
      return 'registry';
    case 'startup_folder_user':
    case 'startup_folder_all':
      return 'folder';
    case 'task_scheduler':
      return 'task';
    case 'startup_services':
      return 'service';
  }
}

/**
 * Extract executable path from a command line string.
 */
function extractExecutablePath(commandLine: string): string {
  if (!commandLine) return '';
  // Handle quoted paths: "C:\Program Files\app\app.exe" --args
  if (commandLine.startsWith('"')) {
    const endQuote = commandLine.indexOf('"', 1);
    if (endQuote > 0) return commandLine.substring(1, endQuote);
  }
  // Handle unquoted paths: C:\path\app.exe --args
  const spaceIndex = commandLine.indexOf(' ');
  if (spaceIndex > 0) return commandLine.substring(0, spaceIndex);
  return commandLine;
}

export class StartupScanner {
  private _lastScanEntries: StartupEntry[] = [];
  private _lastScanAt: string | null = null;

  /**
   * Scan the system for startup entries.
   * Uses the existing startupService RPC calls.
   */
  async scan(): Promise<StartupEntry[]> {
    startupEvents.emit('startup_scan_started', { timestamp: new Date().toISOString() });

    try {
      const rawEntries = await startupService.listEntries();
      const entries = rawEntries.map((raw) => this._convertEntry(raw));

      this._lastScanEntries = entries;
      this._lastScanAt = new Date().toISOString();

      startupEvents.emit('startup_scan_completed', {
        entries,
        timestamp: this._lastScanAt,
      });

      return entries;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[StartupScanner] Scan failed:', errorMsg);
      throw err;
    }
  }

  /**
   * Get the last scan results (without re-scanning).
   */
  getLastScanResults(): StartupEntry[] {
    return this._lastScanEntries;
  }

  /**
   * Get the timestamp of the last scan.
   */
  getLastScanAt(): string | null {
    return this._lastScanAt;
  }

  /**
   * Convert a raw RPC startup entry to our enriched type.
   */
  private _convertEntry(raw: RawStartupEntry): StartupEntry {
    const source = mapSource(raw.source);
    const executablePath = extractExecutablePath(raw.command);
    const protected_ = isProtectedApp(raw.name);

    return {
      id: generateEntryId(source, raw.name, raw.command),
      name: raw.name,
      publisher: raw.publisher,
      executablePath,
      commandLine: raw.command,
      source,
      enabled: raw.enabled,
      launchType: launchTypeFromSource(source),
      userScope: scopeFromSource(source),
      signatureStatus: mapSignatureStatus(raw.signatureStatus),
      impactLevel: mapImpactLevel(raw.impact),
      estimatedBootDelayMs: raw.bootImpactMs ?? 0,
      estimatedCpuUsage: 0,
      estimatedMemoryBytes: 0,
      estimatedDiskActivity: 0,
      impactConfidence: 0.5,
      isProtected: protected_,
      protectedReason: protected_ ? 'Critical system or security application' : null,
      executableExists: true, // Will be refined by analyzer
      metadata: {
        location: raw.location,
        lastLaunch: raw.lastLaunch,
      },
    };
  }
}

/**
 * Default singleton instance.
 */
export const startupScanner = new StartupScanner();
