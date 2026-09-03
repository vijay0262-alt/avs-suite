/**
 * ReportExport — generates and downloads professional reports.
 *
 * Supports PDF (print), HTML, JSON, and CSV formats.
 * Reports include timestamp, scan summary, recommendations,
 * actions, and system information.
 */
import { useState, useCallback } from 'react';
import {
  DocumentArrowDownIcon,
  CodeBracketIcon,
  TableCellsIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@avs/ui';
import type {
  UnifiedResultsReport,
  ReportExportFormat,
  UnifiedRecommendation,
} from '../unifiedResultsTypes';
import {
  formatTimestamp,
  formatDuration,
  priorityLabel,
} from '../unifiedResultsTypes';

export interface ReportExportProps {
  report: UnifiedResultsReport;
}

export function ReportExport({ report }: ReportExportProps) {
  const [open, setOpen] = useState(false);

  const handleExport = useCallback((format: ReportExportFormat) => {
    switch (format) {
      case 'json':
        exportJSON(report);
        break;
      case 'csv':
        exportCSV(report);
        break;
      case 'html':
        exportHTML(report);
        break;
      case 'pdf':
        exportPDF(report);
        break;
    }
    setOpen(false);
  }, [report]);

  return (
    <div className="relative" data-testid="report-export">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        leftIcon={<DocumentArrowDownIcon className="h-4 w-4" />}
      >
        Export
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] shadow-lg py-1 min-w-[160px]">
            <ExportOption icon={<PrinterIcon className="h-4 w-4" />} label="PDF" onClick={() => handleExport('pdf')} />
            <ExportOption icon={<CodeBracketIcon className="h-4 w-4" />} label="HTML" onClick={() => handleExport('html')} />
            <ExportOption icon={<DocumentArrowDownIcon className="h-4 w-4" />} label="JSON" onClick={() => handleExport('json')} />
            <ExportOption icon={<TableCellsIcon className="h-4 w-4" />} label="CSV" onClick={() => handleExport('csv')} />
          </div>
        </>
      )}
    </div>
  );
}

function ExportOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-small text-text-secondary hover:bg-[var(--avs-surface-muted)] transition-colors"
    >
      <span className="text-text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ── Export implementations ──────────────────────────────────────

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function reportFilename(report: UnifiedResultsReport, ext: string): string {
  const date = new Date(report.timestamp).toISOString().slice(0, 10);
  return `AVS-Shield-${report.moduleId}-${date}-${report.reportId}.${ext}`;
}

function exportJSON(report: UnifiedResultsReport) {
  const data = {
    reportId: report.reportId,
    module: report.moduleName,
    timestamp: formatTimestamp(report.timestamp),
    duration: formatDuration(report.durationMs),
    itemsAnalyzed: report.itemsAnalyzed,
    issuesFound: report.issuesFound,
    threatsFound: report.threatsFound,
    aiConfidence: report.aiConfidence,
    primaryScore: report.primaryScore,
    secondaryScores: report.secondaryScores,
    aiVerdict: report.aiVerdict,
    issues: report.issues,
    impactEstimates: report.impactEstimates,
    resultCards: report.resultCards,
    recommendations: report.recommendations.map((r) => ({
      ...r,
      selected: undefined,
    })),
    systemInfo: report.systemInfo,
  };
  downloadBlob(JSON.stringify(data, null, 2), reportFilename(report, 'json'), 'application/json');
}

function exportCSV(report: UnifiedResultsReport) {
  const rows: string[] = [];
  rows.push('Field,Value');
  rows.push(`Report ID,${report.reportId}`);
  rows.push(`Module,${report.moduleName}`);
  rows.push(`Timestamp,${formatTimestamp(report.timestamp)}`);
  rows.push(`Duration,${formatDuration(report.durationMs)}`);
  rows.push(`Items Analyzed,${report.itemsAnalyzed}`);
  rows.push(`Issues Found,${report.issuesFound}`);
  if (report.threatsFound !== undefined) rows.push(`Threats Found,${report.threatsFound}`);
  rows.push(`AI Confidence,${Math.round(report.aiConfidence * 100)}%`);
  rows.push(`Primary Score,${report.primaryScore.label}: ${report.primaryScore.value}`);
  for (const s of report.secondaryScores) {
    rows.push(`Secondary Score,${s.label}: ${s.value}`);
  }
  rows.push('');
  rows.push('Issue ID,Title,Priority,Category,Confidence,Description');
  for (const issue of report.issues) {
    rows.push(`"${issue.id}","${escapeCSV(issue.title)}","${priorityLabel(issue.priority)}","${escapeCSV(issue.category)}","${Math.round(issue.confidence * 100)}%","${escapeCSV(issue.description)}"`);
  }
  rows.push('');
  rows.push('Recommendation ID,Title,Priority,Expected Benefit,Estimated Time,Risk Level,Rollback,AI Confidence');
  for (const rec of report.recommendations) {
    rows.push(`"${rec.id}","${escapeCSV(rec.title)}","${priorityLabel(rec.priority)}","${escapeCSV(rec.expectedBenefit)}","${escapeCSV(rec.estimatedTime)}","${rec.riskLevel}","${rec.rollbackAvailable ? 'Yes' : 'No'}","${Math.round(rec.aiConfidence * 100)}%"`);
  }

  downloadBlob(rows.join('\n'), reportFilename(report, 'csv'), 'text/csv');
}

function escapeCSV(value: string): string {
  return value.replace(/"/g, '""');
}

function exportHTML(report: UnifiedResultsReport) {
  const html = buildHTMLReport(report);
  downloadBlob(html, reportFilename(report, 'html'), 'text/html');
}

function exportPDF(report: UnifiedResultsReport) {
  const html = buildHTMLReport(report, true);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  }
}

function buildHTMLReport(report: UnifiedResultsReport, forPrint = false): string {
  const styles = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0F172A; color: #F1F5F9; padding: 40px; max-width: 900px; margin: 0 auto; }
    h1 { color: #3B82F6; font-size: 28px; margin-bottom: 8px; }
    h2 { color: #F1F5F9; font-size: 20px; margin-top: 32px; margin-bottom: 12px; border-bottom: 1px solid #1E293B; padding-bottom: 8px; }
    h3 { color: #94A3B8; font-size: 14px; margin-top: 20px; }
    .meta { color: #64748B; font-size: 13px; margin-bottom: 24px; }
    .score { display: inline-block; margin-right: 24px; text-align: center; }
    .score-value { font-size: 36px; font-weight: bold; }
    .score-label { font-size: 12px; color: #64748B; }
    .verdict { background: #1E293B; border-radius: 12px; padding: 16px; margin: 16px 0; }
    .issue { background: #1E293B; border-radius: 8px; padding: 12px; margin: 8px 0; }
    .rec { background: #1E293B; border-radius: 8px; padding: 12px; margin: 8px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
    .badge-critical { background: #EF444422; color: #EF4444; }
    .badge-high { background: #F59E0B22; color: #F59E0B; }
    .badge-medium { background: #3B82F622; color: #3B82F6; }
    .badge-low { background: #64748B22; color: #64748B; }
    .badge-informational { background: #64748B22; color: #64748B; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #1E293B; font-size: 13px; }
    th { color: #64748B; font-weight: 600; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #1E293B; color: #64748B; font-size: 12px; text-align: center; }
    ${forPrint ? '@media print { body { background: white; color: black; } h1 { color: #2563EB; } h2 { border-color: #ddd; } .verdict, .issue, .rec { background: #f8f8f8; } th, td { border-color: #ddd; } }' : ''}
  `;

  const issuesHTML = report.issues.map((issue) => `
    <div class="issue">
      <span class="badge badge-${issue.priority}">${priorityLabel(issue.priority)}</span>
      <strong>${issue.title}</strong>
      <p style="margin: 4px 0; font-size: 13px; color: #94A3B8;">${issue.description}</p>
      ${issue.location ? `<p style="font-size: 12px; color: #64748B; font-family: monospace;">${issue.location}</p>` : ''}
    </div>
  `).join('');

  const recsHTML = report.recommendations.map((rec: UnifiedRecommendation) => `
    <div class="rec">
      <span class="badge badge-${rec.priority}">${priorityLabel(rec.priority)}</span>
      <strong>${rec.title}</strong>
      <p style="margin: 4px 0; font-size: 13px; color: #94A3B8;">${rec.summary}</p>
      <table>
        <tr><th>Expected Benefit</th><td>${rec.expectedBenefit}</td></tr>
        <tr><th>Estimated Time</th><td>${rec.estimatedTime}</td></tr>
        <tr><th>Risk Level</th><td>${rec.riskLevel}</td></tr>
        <tr><th>Rollback</th><td>${rec.rollbackAvailable ? 'Available' : 'Not available'}</td></tr>
        <tr><th>AI Confidence</th><td>${Math.round(rec.aiConfidence * 100)}%</td></tr>
        <tr><th>Why It Matters</th><td>${rec.whyItMatters}</td></tr>
      </table>
    </div>
  `).join('');

  const scoresHTML = [
    `<div class="score"><div class="score-value" style="color: ${scoreHex(report.primaryScore.value)}">${report.primaryScore.value}</div><div class="score-label">${report.primaryScore.label}</div></div>`,
    ...report.secondaryScores.map((s) =>
      `<div class="score"><div class="score-value" style="color: ${scoreHex(s.value)}">${s.value}</div><div class="score-label">${s.label}</div></div>`
    ),
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AVS AI Shield Report — ${report.moduleName} — ${formatTimestamp(report.timestamp)}</title>
  <style>${styles}</style>
</head>
<body>
  <h1>AVS AI Shield — ${report.moduleName}</h1>
  <div class="meta">
    Report ID: ${report.reportId}<br />
    Timestamp: ${formatTimestamp(report.timestamp)}<br />
    Duration: ${formatDuration(report.durationMs)}<br />
    Items Analyzed: ${report.itemsAnalyzed.toLocaleString()}<br />
    Issues Found: ${report.issuesFound}${report.threatsFound !== undefined ? `<br />Threats Found: ${report.threatsFound}` : ''}<br />
    AI Confidence: ${Math.round(report.aiConfidence * 100)}%
  </div>

  <h2>Scores</h2>
  ${scoresHTML}

  <h2>AI Verdict</h2>
  <div class="verdict">
    <p>${report.aiVerdict.summary}</p>
    ${report.aiVerdict.details.map((d) => `<p style="font-size: 13px; color: #94A3B8;">• ${d}</p>`).join('')}
  </div>

  ${report.issues.length > 0 ? `<h2>Issues Found (${report.issues.length})</h2>${issuesHTML}` : ''}

  ${report.recommendations.length > 0 ? `<h2>Recommendations (${report.recommendations.length})</h2>${recsHTML}` : ''}

  ${report.systemInfo ? `<h2>System Information</h2>
  <table>
    <tr><th>OS</th><td>${report.systemInfo.os} ${report.systemInfo.osVersion}</td></tr>
    <tr><th>CPU</th><td>${report.systemInfo.cpu}</td></tr>
    <tr><th>RAM</th><td>${report.systemInfo.ram}</td></tr>
    <tr><th>Disk</th><td>${report.systemInfo.disk}</td></tr>
    <tr><th>Hostname</th><td>${report.systemInfo.hostname}</td></tr>
    <tr><th>App Version</th><td>${report.systemInfo.appVersion}</td></tr>
  </table>` : ''}

  <div class="footer">
    Generated by AVS AI Shield — Advanced Vision Software LLC<br />
    https://www.avsshield.com
  </div>
</body>
</html>`;
}

function scoreHex(score: number): string {
  if (score >= 90) return '#22C55E';
  if (score >= 75) return '#3B82F6';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}
