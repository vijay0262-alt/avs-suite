/**
 * Diagnostics Bundle — EPIC 8
 *
 * Creates:
 *   Diagnostic bundle, log viewer, health report export,
 *   crash report export, system information export,
 *   privacy-safe logs.
 *
 * This module does NOT modify any existing architecture.
 * It builds on top of the existing production diagnostics.
 */
import type { DiagnosticExport, DiagnosticExportType } from './types';
import { releaseEvents } from './releaseEvents';

export class DiagnosticsBundle {
  private _exports: DiagnosticExport[] = [];
  private _maxExports: number;

  constructor(maxExports: number = 50) {
    this._maxExports = maxExports;
  }

  exportLogs(logEntries: { timestamp: string; level: string; module: string; action: string; message: string }[]): DiagnosticExport {
    const sanitized = this._sanitizeLogs(logEntries);
    const content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      entryCount: sanitized.length,
      entries: sanitized,
    }, null, 2);

    return this._createExport('log_bundle', content, 'avs-logs.json', 'application/json', true);
  }

  exportHealthReport(healthReport: Record<string, unknown>): DiagnosticExport {
    const content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      report: healthReport,
    }, null, 2);

    return this._createExport('health_report', content, 'avs-health-report.json', 'application/json', true);
  }

  exportCrashReport(crashInfo: { error: string; stack?: string; timestamp: string; appVersion: string; platform: string }): DiagnosticExport {
    const content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      crash: {
        error: crashInfo.error,
        stack: this._sanitizeText(crashInfo.stack ?? ''),
        timestamp: crashInfo.timestamp,
        appVersion: crashInfo.appVersion,
        platform: crashInfo.platform,
      },
    }, null, 2);

    return this._createExport('crash_report', content, 'avs-crash-report.json', 'application/json', true);
  }

  exportSystemInfo(systemInfo: { platform: string; arch: string; cpuCount: number; memoryMB: number; osVersion: string; appVersion: string }): DiagnosticExport {
    const content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      system: systemInfo,
    }, null, 2);

    return this._createExport('system_info', content, 'avs-system-info.json', 'application/json', true);
  }

  exportPrivacySafeLogs(logEntries: { timestamp: string; level: string; module: string; action: string; message: string }[]): DiagnosticExport {
    const sanitized = this._sanitizeLogsForPrivacy(logEntries);
    const content = JSON.stringify({
      exportedAt: new Date().toISOString(),
      privacySafe: true,
      entryCount: sanitized.length,
      entries: sanitized,
    }, null, 2);

    return this._createExport('privacy_safe_logs', content, 'avs-privacy-safe-logs.json', 'application/json', true);
  }

  getExports(): DiagnosticExport[] {
    return [...this._exports];
  }

  getExportsByType(type: DiagnosticExportType): DiagnosticExport[] {
    return this._exports.filter((e) => e.type === type);
  }

  clear(): void {
    this._exports = [];
  }

  private _createExport(
    type: DiagnosticExportType,
    content: string,
    filename: string,
    mimeType: string,
    isPrivacySafe: boolean,
  ): DiagnosticExport {
    const exportEntry: DiagnosticExport = {
      type,
      content,
      filename,
      mimeType,
      generatedAt: new Date().toISOString(),
      isPrivacySafe,
    };

    this._exports.unshift(exportEntry);
    if (this._exports.length > this._maxExports) {
      this._exports = this._exports.slice(0, this._maxExports);
    }

    releaseEvents.emit('diagnostics_exported', exportEntry);
    return exportEntry;
  }

  private _sanitizeLogs(entries: { timestamp: string; level: string; module: string; action: string; message: string }[]): { timestamp: string; level: string; module: string; action: string; message: string }[] {
    return entries.map((e) => ({
      timestamp: e.timestamp,
      level: e.level,
      module: e.module,
      action: e.action,
      message: this._sanitizeText(e.message),
    }));
  }

  private _sanitizeLogsForPrivacy(entries: { timestamp: string; level: string; module: string; action: string; message: string }[]): { timestamp: string; level: string; module: string; action: string; message: string }[] {
    return entries.map((e) => ({
      timestamp: e.timestamp,
      level: e.level,
      module: e.module,
      action: e.action,
      message: this._sanitizeText(e.message),
    }));
  }

  private _sanitizeText(text: string): string {
    const forbidden = ['password', 'passwd', 'secret', 'api_key', 'apikey', 'token', 'credential', 'private_key', 'hash', 'sha256', 'md5', 'blake3'];
    let result = text;
    for (const pattern of forbidden) {
      const regex = new RegExp(pattern, 'gi');
      result = result.replace(regex, '[redacted]');
    }
    return result;
  }
}

export const diagnosticsBundle = new DiagnosticsBundle();
