/**
 * ProcessAnalyzer — dispatches to impact analyzers and produces
 * a full ProcessAnalysis for each process in a snapshot.
 *
 * Classifies processes, detects issues, and computes overall health.
 */
import type {
  ProcessAnalysis,
  ProcessEntry,
  ProcessIssue,
  ProcessImpactAnalysis,
  ProcessConfiguration,
  ProcessCategory,
  ProcessSafetyLevel,
  ProcessSeverity,
  ProcessRecovery,
  ProcessSnapshot,
} from './types';
import {
  isProtectedProcess,
  severityToRisk,
  severityToUrgency,
  makeProcessEvidence,
} from './types';
import {
  CPUImpactAnalyzer,
  MemoryImpactAnalyzer,
  DiskImpactAnalyzer,
  GPUImpactAnalyzer,
  NetworkImpactAnalyzer,
  PowerImpactAnalyzer,
  StartupImpactAnalyzer,
  BackgroundImpactAnalyzer,
  computeOverallImpact,
} from './ProcessImpactAnalyzers';
import type { ProcessHistory } from './ProcessHistory';

const KNOWN_SYSTEM_PROCESSES = new Set([
  'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe',
  'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe', 'winlogon.exe',
]);

const KNOWN_MICROSOFT_PUBLISHERS = ['microsoft', 'microsoft corporation', 'windows'];

const BROWSER_PROCESSES = new Set(['chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe']);
const GAMING_PROCESSES = new Set(['steam.exe', 'epicgames.exe', 'origin.exe', 'battle.net.exe', 'discord.exe']);
const DEV_PROCESSES = new Set(['code.exe', 'devenv.exe', 'node.exe', 'python.exe', 'java.exe', 'idea64.exe']);
const SECURITY_PROCESSES = new Set(['msmpeng.exe', 'avsshield.exe', 'defender.exe', 'mcshield.exe']);
const UPDATER_PROCESSES = new Set(['adobeupdater.exe', 'googleupdate.exe', 'softwareupdater.exe']);

export class ProcessAnalyzer {
  private cpuAnalyzer: CPUImpactAnalyzer;
  private memoryAnalyzer: MemoryImpactAnalyzer;
  private diskAnalyzer: DiskImpactAnalyzer;
  private gpuAnalyzer: GPUImpactAnalyzer;
  private networkAnalyzer: NetworkImpactAnalyzer;
  private powerAnalyzer: PowerImpactAnalyzer;
  private startupAnalyzer: StartupImpactAnalyzer;
  private backgroundAnalyzer: BackgroundImpactAnalyzer;

  constructor(private config: ProcessConfiguration, private history: ProcessHistory) {
    this.cpuAnalyzer = new CPUImpactAnalyzer(config);
    this.memoryAnalyzer = new MemoryImpactAnalyzer(config);
    this.diskAnalyzer = new DiskImpactAnalyzer(config);
    this.gpuAnalyzer = new GPUImpactAnalyzer(config);
    this.networkAnalyzer = new NetworkImpactAnalyzer(config);
    this.powerAnalyzer = new PowerImpactAnalyzer();
    this.startupAnalyzer = new StartupImpactAnalyzer(config);
    this.backgroundAnalyzer = new BackgroundImpactAnalyzer(config);
  }

  analyzeAll(snapshot: ProcessSnapshot): ProcessAnalysis[] {
    return snapshot.entries.map((entry) => this.analyzeEntry(entry, snapshot));
  }

  analyzeEntry(entry: ProcessEntry, snapshot: ProcessSnapshot): ProcessAnalysis {
    const trendData = this.history.getTrendData(entry.info.pid, this.config.maxTrendDataPoints);

    const cpu = this.cpuAnalyzer.analyze(entry, trendData);
    const memory = this.memoryAnalyzer.analyze(entry, trendData);
    const disk = this.diskAnalyzer.analyze(entry, trendData);
    const gpu = this.gpuAnalyzer.analyze(entry);
    const network = this.networkAnalyzer.analyze(entry);
    const power = this.powerAnalyzer.analyze(entry);
    const startup = this.startupAnalyzer.analyze(entry);
    const background = this.backgroundAnalyzer.analyze(entry, trendData);
    const overall = computeOverallImpact(cpu, memory, disk, gpu, network, power, startup, background);

    const impact: ProcessImpactAnalysis = { cpu, memory, disk, gpu, network, power, startup, background, overall };

    const issues = this.detectIssues(entry, impact, snapshot);
    const strengths = this.detectStrengths(entry, impact);
    const category = this.classifyProcess(entry);
    const safetyLevel = this.assessSafety(entry, category);
    const health = this.computeHealth(impact, issues);
    const confidence = this.computeConfidence(impact, issues);
    const worstSeverity = this.getWorstSeverity(issues);
    const recovery = this.computeRecovery(entry, impact);

    return {
      pid: entry.info.pid,
      name: entry.info.name,
      displayName: entry.info.displayName,
      category,
      safetyLevel,
      impact,
      issues,
      strengths,
      health,
      confidence,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      summary: this.buildSummary(entry, impact, category),
      purpose: this.getPurpose(entry, category),
      expectedBehavior: this.getExpectedBehavior(entry, category, impact),
      recommendedAction: this.getRecommendedAction(entry, safetyLevel, issues),
      expectedRecovery: recovery,
      requiresRestart: safetyLevel === 'critical_system',
      rollbackAvailable: safetyLevel === 'safe' || safetyLevel === 'review_recommended',
    };
  }

  private classifyProcess(entry: ProcessEntry): ProcessCategory {
    const name = entry.info.name.toLowerCase();

    if (KNOWN_SYSTEM_PROCESSES.has(name)) return 'system';
    if (BROWSER_PROCESSES.has(name)) return 'browser';
    if (GAMING_PROCESSES.has(name)) return 'gaming';
    if (DEV_PROCESSES.has(name)) return 'development';
    if (SECURITY_PROCESSES.has(name)) return 'security';
    if (UPDATER_PROCESSES.has(name)) return 'updater';

    const publisher = entry.info.publisher.toLowerCase();
    if (KNOWN_MICROSOFT_PUBLISHERS.some((p) => publisher.includes(p))) {
      if (entry.info.isService) return 'windows';
      return 'microsoft';
    }

    if (entry.info.isService) return 'background';
    if (!entry.info.windowTitle && entry.sensors.cpuUsagePercent < 5) return 'background';
    if (entry.info.windowTitle) return 'user_application';

    return 'unknown';
  }

  private assessSafety(entry: ProcessEntry, category: ProcessCategory): ProcessSafetyLevel {
    const name = entry.info.name;

    if (isProtectedProcess(name, this.config.protectedProcesses)) return 'critical_system';
    if (category === 'system' || category === 'windows') return 'critical_system';
    if (category === 'security') return 'avoid';
    if (entry.info.signatureStatus === 'invalid' || entry.info.signatureStatus === 'expired') return 'review_recommended';
    if (entry.info.signatureStatus === 'unsigned') return 'review_recommended';
    if (category === 'updater' || category === 'background') return 'safe';
    if (category === 'user_application' || category === 'browser' || category === 'gaming' || category === 'development') return 'safe';

    return 'review_recommended';
  }

  private detectIssues(entry: ProcessEntry, impact: ProcessImpactAnalysis, snapshot: ProcessSnapshot): ProcessIssue[] {
    const issues: ProcessIssue[] = [];
    const ts = Date.now();

    // High CPU
    if (impact.cpu.level === 'high' || impact.cpu.level === 'critical') {
      issues.push({
        id: `high-cpu-${entry.info.pid}`,
        type: 'high_cpu',
        title: 'High CPU Usage',
        description: impact.cpu.description,
        severity: impact.cpu.level === 'critical' ? 'critical' : 'high',
        evidence: impact.cpu.evidence,
        confidence: 0.9,
      });
    }

    // Memory leak suspected
    if (impact.memory.isLeakSuspected) {
      issues.push({
        id: `memory-leak-${entry.info.pid}`,
        type: 'memory_leak',
        title: 'Memory Leak Suspected',
        description: impact.memory.description,
        severity: 'high',
        evidence: impact.memory.evidence,
        confidence: 0.85,
      });
    }

    // High memory
    if (impact.memory.level === 'high' || impact.memory.level === 'critical') {
      issues.push({
        id: `high-memory-${entry.info.pid}`,
        type: 'high_cpu',
        title: 'High Memory Usage',
        description: impact.memory.description,
        severity: impact.memory.level === 'critical' ? 'critical' : 'high',
        evidence: impact.memory.evidence,
        confidence: 0.85,
      });
    }

    // Idle process
    if (impact.background.isIdle) {
      issues.push({
        id: `idle-${entry.info.pid}`,
        type: 'idle_process',
        title: 'Idle Process',
        description: impact.background.description,
        severity: 'low',
        evidence: impact.background.evidence,
        confidence: 0.75,
      });
    }

    // Unused background app
    if (impact.background.isBackgroundProcess && impact.background.isIdle && entry.sensors.memoryMB > 100) {
      issues.push({
        id: `unused-bg-${entry.info.pid}`,
        type: 'unused_background_app',
        title: 'Unused Background Application',
        description: `${entry.info.displayName} has been idle and is consuming ${entry.sensors.memoryMB.toFixed(0)} MB of memory with no active work.`,
        severity: 'medium',
        evidence: [
          makeProcessEvidence('memoryMB', entry.sensors.memoryMB.toFixed(0), 'MB', ts),
          makeProcessEvidence('cpuUsagePercent', entry.sensors.cpuUsagePercent.toFixed(1), '%', ts),
        ],
        confidence: 0.8,
      });
    }

    // High disk activity
    if (impact.disk.level === 'high' || impact.disk.level === 'critical') {
      issues.push({
        id: `high-disk-${entry.info.pid}`,
        type: 'high_disk_activity',
        title: 'High Disk Activity',
        description: impact.disk.description,
        severity: impact.disk.level === 'critical' ? 'high' : 'medium',
        evidence: impact.disk.evidence,
        confidence: 0.85,
      });
    }

    // Abnormal network
    if (impact.network.isAbnormal) {
      issues.push({
        id: `abnormal-net-${entry.info.pid}`,
        type: 'abnormal_network',
        title: 'Abnormal Network Activity',
        description: impact.network.description,
        severity: 'high',
        evidence: impact.network.evidence,
        confidence: 0.75,
      });
    }

    // Suspicious - unsigned process
    if (entry.info.signatureStatus === 'unsigned' && entry.info.category !== 'system') {
      issues.push({
        id: `unsigned-${entry.info.pid}`,
        type: 'suspicious_behavior',
        title: 'Unsigned Process',
        description: `${entry.info.displayName} is running without a valid digital signature. This may indicate an untrusted or potentially malicious application.`,
        severity: 'medium',
        evidence: [makeProcessEvidence('signatureStatus', 'unsigned', 'status', ts)],
        confidence: 0.7,
      });
    }

    // Excessive startup impact
    if (impact.startup.level === 'high') {
      issues.push({
        id: `startup-impact-${entry.info.pid}`,
        type: 'excessive_startup_impact',
        title: 'Excessive Startup Impact',
        description: impact.startup.description,
        severity: 'medium',
        evidence: impact.startup.evidence,
        confidence: 0.8,
      });
    }

    // Duplicate processes
    const duplicates = snapshot.entries.filter((e) => e.info.name === entry.info.name);
    if (duplicates.length >= this.config.thresholds.duplicateThreshold && entry.info.category !== 'browser') {
      issues.push({
        id: `duplicate-${entry.info.pid}`,
        type: 'duplicate_process',
        title: 'Duplicate Process',
        description: `${duplicates.length} instances of ${entry.info.name} are running simultaneously.`,
        severity: 'low',
        evidence: [makeProcessEvidence('instanceCount', String(duplicates.length), 'count', ts)],
        confidence: 0.7,
      });
    }

    return issues;
  }

  private detectStrengths(entry: ProcessEntry, impact: ProcessImpactAnalysis): string[] {
    const strengths: string[] = [];
    if (impact.cpu.level === 'none' || impact.cpu.level === 'minimal') {
      strengths.push('Low CPU usage');
    }
    if (impact.memory.level === 'none' || impact.memory.level === 'minimal' || impact.memory.level === 'low') {
      strengths.push('Low memory usage');
    }
    if (impact.disk.level === 'none') {
      strengths.push('No significant disk activity');
    }
    if (impact.network.level === 'none' || impact.network.level === 'minimal') {
      strengths.push('Minimal network activity');
    }
    if (entry.info.signatureStatus === 'valid') {
      strengths.push('Digitally signed by trusted publisher');
    }
    return strengths;
  }

  private computeHealth(impact: ProcessImpactAnalysis, issues: ProcessIssue[]): ProcessAnalysis['health'] {
    if (issues.some((i) => i.severity === 'critical')) return 'critical';
    if (issues.some((i) => i.severity === 'high')) return 'warning';
    if (issues.some((i) => i.severity === 'medium')) return 'attention';
    if (impact.overall.level === 'minimal' || impact.overall.level === 'none') return 'healthy';
    return 'normal';
  }

  private computeConfidence(impact: ProcessImpactAnalysis, issues: ProcessIssue[]): number {
    if (issues.length === 0) return 0.95;
    const avgConfidence = issues.reduce((sum, i) => sum + i.confidence, 0) / issues.length;
    return Math.min(0.98, avgConfidence);
  }

  private getWorstSeverity(issues: ProcessIssue[]): ProcessSeverity {
    const order: ProcessSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    let worst: ProcessSeverity = 'info';
    for (const issue of issues) {
      if (order.indexOf(issue.severity) > order.indexOf(worst)) {
        worst = issue.severity;
      }
    }
    return worst;
  }

  private computeRecovery(entry: ProcessEntry, _impact: ProcessImpactAnalysis): ProcessRecovery {
    return {
      ramMB: entry.sensors.memoryMB,
      cpuPercent: entry.sensors.cpuUsagePercent,
      diskMBps: entry.sensors.diskReadMBps + entry.sensors.diskWriteMBps,
      gpuPercent: entry.sensors.gpuUsagePercent,
      networkMbps: entry.sensors.networkDownloadMbps + entry.sensors.networkUploadMbps,
      description: `Terminating this process would recover approximately ${entry.sensors.memoryMB.toFixed(0)} MB RAM and ${entry.sensors.cpuUsagePercent.toFixed(1)}% CPU.`,
    };
  }

  private buildSummary(entry: ProcessEntry, impact: ProcessImpactAnalysis, category: ProcessCategory): string {
    const catDisplay = category.replace(/_/g, ' ');
    return `${entry.info.displayName} is a ${catDisplay} process consuming ${entry.sensors.cpuUsagePercent.toFixed(1)}% CPU and ${entry.sensors.memoryMB.toFixed(0)} MB RAM. Overall impact: ${impact.overall.level}.`;
  }

  private getPurpose(entry: ProcessEntry, category: ProcessCategory): string {
    if (entry.info.description) return entry.info.description;
    switch (category) {
      case 'system': return 'Critical Windows system process required for operating system functionality.';
      case 'windows': return 'Windows service that supports core operating system features.';
      case 'microsoft': return 'Microsoft application or service.';
      case 'security': return 'Security software protecting the system from threats.';
      case 'updater': return 'Background updater service that keeps software current.';
      case 'browser': return 'Web browser application.';
      case 'gaming': return 'Gaming platform or game client.';
      case 'development': return 'Development tool or programming runtime.';
      case 'background': return 'Background process running without a user interface.';
      case 'user_application': return 'User application with an active window.';
      default: return 'Process with unknown purpose. Investigation is recommended.';
    }
  }

  private getExpectedBehavior(entry: ProcessEntry, category: ProcessCategory, impact: ProcessImpactAnalysis): string {
    if (category === 'system' || category === 'windows') {
      return 'This process is expected to run continuously as part of the Windows operating system.';
    }
    if (category === 'updater') {
      return 'Updater processes typically run periodically to check for software updates and should not consume resources continuously.';
    }
    if (category === 'security') {
      return 'Security software is expected to run continuously but should not consume excessive CPU unless performing a scan.';
    }
    if (impact.background.isIdle) {
      return 'This process appears to be idle and is not actively performing work.';
    }
    return 'This process should consume resources proportional to its current activity level.';
  }

  private getRecommendedAction(entry: ProcessEntry, safety: ProcessSafetyLevel, issues: ProcessIssue[]): string {
    if (safety === 'critical_system') {
      return 'No action required. This is a critical system process and should not be terminated.';
    }
    if (safety === 'avoid') {
      return 'No action recommended. Terminating this process may reduce system security.';
    }
    if (issues.some((i) => i.type === 'unused_background_app')) {
      return 'Consider closing this process if it is not needed. The process can be safely restarted later if required.';
    }
    if (issues.some((i) => i.type === 'memory_leak')) {
      return 'Consider restarting this process to release accumulated memory. The application will continue to function normally after restart.';
    }
    if (issues.some((i) => i.type === 'idle_process')) {
      return 'No action required unless system resources are needed for other applications.';
    }
    if (issues.some((i) => i.type === 'excessive_startup_impact')) {
      return 'Consider delaying this process at startup to improve boot time. AVS AI Shield can automate this safely.';
    }
    if (issues.some((i) => i.type === 'duplicate_process')) {
      return 'Multiple instances are running. Consider closing unnecessary instances if the application allows it.';
    }
    if (issues.some((i) => i.type === 'suspicious_behavior')) {
      return 'This process is unsigned. Consider verifying the source or scanning with security software.';
    }
    return 'No action required at this time.';
  }
}
