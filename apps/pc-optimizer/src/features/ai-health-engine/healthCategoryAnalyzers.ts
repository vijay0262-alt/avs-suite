/**
 * HealthCategoryAnalyzers — per-category analyzers that evaluate
 * individual aspects of PC health.
 *
 * Each analyzer implements the CategoryAnalyzer interface and
 * produces a CategoryResult with score, severity, issues, and
 * recommendations.
 *
 * Future modules (Driver, Network, Battery, GPU, AI Malware, Disk SMART)
 * can be added by implementing CategoryAnalyzer and registering it —
 * no architecture changes required.
 */
import type {
  CategoryAnalyzer,
  CategoryResult,
  CategoryIssue,
  HealthAnalysisInput,
  HealthCategoryId,
  Severity,
} from './types';
import { clampScore, severityToPriority } from './types';

// ── Helpers ───────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function worstSeverity(issues: CategoryIssue[]): Severity {
  if (issues.length === 0) return 'info';
  return issues.reduce((worst, issue) =>
    severityToPriority(issue.severity) < severityToPriority(worst) ? issue.severity : worst,
  'info' as Severity);
}

function scoreFromIssues(baseScore: number, issues: CategoryIssue[]): number {
  const totalImpact = issues.reduce((sum, i) => sum + i.impact, 0);
  return clampScore(baseScore - totalImpact);
}

// ── Storage Health Analyzer ───────────────────────────────────

export class StorageHealthAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'storage' as const;
  readonly categoryName = 'Storage Health';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.8;

    if (metrics && metrics.storage.length > 0) {
      for (const drive of metrics.storage) {
        if (drive.usage > 90) {
          issues.push({
            title: `Drive ${drive.mount} critically full`,
            description: `Drive "${drive.name}" is at ${drive.usage.toFixed(1)}% capacity. Only ${(drive.free / (1024 ** 3)).toFixed(1)} GB free.`,
            severity: 'critical',
            impact: 30,
            autoFixable: true,
          });
        } else if (drive.usage > 80) {
          issues.push({
            title: `Drive ${drive.mount} running low on space`,
            description: `Drive "${drive.name}" is at ${drive.usage.toFixed(1)}% capacity. Consider cleaning up files.`,
            severity: 'high',
            impact: 15,
            autoFixable: true,
          });
        } else if (drive.usage > 70) {
          issues.push({
            title: `Drive ${drive.mount} moderately used`,
            description: `Drive "${drive.name}" is at ${drive.usage.toFixed(1)}% capacity.`,
            severity: 'low',
            impact: 5,
            autoFixable: true,
          });
        }
      }
      confidence = 0.95;
    } else {
      issues.push({
        title: 'Unable to read storage metrics',
        description: 'Storage drive information is not available.',
        severity: 'low',
        impact: 10,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Run the Junk Cleaner to free up disk space', 'Empty the Recycle Bin', 'Use Disk Analyzer to find large files']
        : ['Storage is in good condition'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Performance Analyzer ──────────────────────────────────────

export class PerformanceAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'performance' as const;
  readonly categoryName = 'Performance';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.7;

    if (metrics) {
      const cpu = metrics.cpu;
      if (cpu.usage > 80) {
        issues.push({
          title: 'High CPU usage',
          description: `CPU usage is at ${cpu.usage.toFixed(1)}%. This may slow down the system.`,
          severity: 'high',
          impact: 20,
          autoFixable: false,
        });
      } else if (cpu.usage > 60) {
        issues.push({
          title: 'Moderate CPU usage',
          description: `CPU usage is at ${cpu.usage.toFixed(1)}%.`,
          severity: 'low',
          impact: 5,
          autoFixable: false,
        });
      }

      if (cpu.processes > 200) {
        issues.push({
          title: 'High process count',
          description: `${cpu.processes} processes running. Consider disabling unnecessary startup programs.`,
          severity: 'medium',
          impact: 10,
          autoFixable: true,
        });
      }

      const perf = metrics.performance;
      if (perf.backgroundProcesses > 50) {
        issues.push({
          title: 'Many background processes',
          description: `${perf.backgroundProcesses} background processes detected.`,
          severity: 'medium',
          impact: 8,
          autoFixable: true,
        });
      }

      confidence = 0.9;
    } else {
      issues.push({
        title: 'Performance metrics unavailable',
        description: 'Unable to read CPU and process metrics.',
        severity: 'low',
        impact: 10,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Review startup programs', 'Close unnecessary background applications', 'Run the Performance Optimizer']
        : ['Performance is within normal parameters'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Memory Usage Analyzer ─────────────────────────────────────

export class MemoryUsageAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'memory' as const;
  readonly categoryName = 'Memory Usage';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.8;

    if (metrics) {
      const mem = metrics.memory;
      if (mem.usage > 85) {
        issues.push({
          title: 'Critical memory usage',
          description: `Memory usage is at ${mem.usage.toFixed(1)}%. Available: ${(mem.available / (1024 ** 3)).toFixed(1)} GB.`,
          severity: 'critical',
          impact: 25,
          autoFixable: false,
        });
      } else if (mem.usage > 70) {
        issues.push({
          title: 'High memory usage',
          description: `Memory usage is at ${mem.usage.toFixed(1)}%.`,
          severity: 'medium',
          impact: 12,
          autoFixable: false,
        });
      }

      if (mem.swapUsage > 80) {
        issues.push({
          title: 'High swap usage',
          description: `Swap usage is at ${mem.swapUsage.toFixed(1)}%. This indicates memory pressure.`,
          severity: 'high',
          impact: 15,
          autoFixable: false,
        });
      }

      confidence = 0.95;
    } else {
      issues.push({
        title: 'Memory metrics unavailable',
        description: 'Unable to read memory information.',
        severity: 'low',
        impact: 10,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Close memory-intensive applications', 'Consider adding more RAM', 'Reduce startup programs']
        : ['Memory usage is healthy'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Startup Programs Analyzer ─────────────────────────────────

export class StartupAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'startup' as const;
  readonly categoryName = 'Startup Programs';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.7;

    if (metrics) {
      const startupCount = metrics.performance.startupApps;
      if (startupCount > 30) {
        issues.push({
          title: 'Too many startup programs',
          description: `${startupCount} programs start with Windows. This significantly slows boot time.`,
          severity: 'high',
          impact: 20,
          autoFixable: true,
        });
      } else if (startupCount > 15) {
        issues.push({
          title: 'High startup program count',
          description: `${startupCount} programs start with Windows. Consider disabling unnecessary ones.`,
          severity: 'medium',
          impact: 10,
          autoFixable: true,
        });
      } else if (startupCount > 8) {
        issues.push({
          title: 'Moderate startup programs',
          description: `${startupCount} programs start with Windows.`,
          severity: 'low',
          impact: 4,
          autoFixable: true,
        });
      }
      confidence = 0.85;
    } else {
      issues.push({
        title: 'Startup data unavailable',
        description: 'Unable to read startup program information.',
        severity: 'low',
        impact: 10,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Use the Startup Manager to disable unnecessary programs', 'Review which programs need to start automatically']
        : ['Startup configuration is optimal'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Browser Health Analyzer ───────────────────────────────────

export class BrowserHealthAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'browser' as const;
  readonly categoryName = 'Browser Health';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.7;

    if (metrics) {
      const browserCache = metrics.performance.browserCacheSize;
      const cacheMB = browserCache / (1024 * 1024);
      if (cacheMB > 500) {
        issues.push({
          title: 'Large browser cache',
          description: `Browser cache is ${cacheMB.toFixed(0)} MB. This can slow browsing and waste disk space.`,
          severity: 'medium',
          impact: 12,
          autoFixable: true,
        });
      } else if (cacheMB > 200) {
        issues.push({
          title: 'Growing browser cache',
          description: `Browser cache is ${cacheMB.toFixed(0)} MB.`,
          severity: 'low',
          impact: 5,
          autoFixable: true,
        });
      }
      confidence = 0.8;
    } else {
      issues.push({
        title: 'Browser data unavailable',
        description: 'Unable to read browser cache information.',
        severity: 'low',
        impact: 10,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Use the Privacy Cleaner to clear browser cache', 'Clear browsing data periodically']
        : ['Browser health is good'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Privacy Analyzer ──────────────────────────────────────────

export class PrivacyAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'privacy' as const;
  readonly categoryName = 'Privacy';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.6;

    if (metrics) {
      const browserData = metrics.performance.browserCacheSize;
      if (browserData > 100 * 1024 * 1024) {
        issues.push({
          title: 'Browser data accumulation',
          description: 'Significant browsing data detected. This may expose your online activity.',
          severity: 'medium',
          impact: 10,
          autoFixable: true,
        });
      }

      const win = metrics.windows;
      if (!win.secureBoot) {
        issues.push({
          title: 'Secure Boot disabled',
          description: 'Secure Boot is not enabled. This reduces system security at boot time.',
          severity: 'medium',
          impact: 8,
          autoFixable: false,
        });
      }

      if (!win.tpmStatus) {
        issues.push({
          title: 'TPM not active',
          description: 'Trusted Platform Module is not detected or not active.',
          severity: 'low',
          impact: 5,
          autoFixable: false,
        });
      }

      confidence = 0.75;
    } else {
      issues.push({
        title: 'Privacy data unavailable',
        description: 'Unable to assess privacy status.',
        severity: 'low',
        impact: 10,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Use the Privacy Cleaner regularly', 'Enable Secure Boot in BIOS', 'Verify TPM is enabled']
        : ['Privacy settings are adequate'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Temporary Files Analyzer ──────────────────────────────────

export class TempFilesAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'temp_files' as const;
  readonly categoryName = 'Temporary Files';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.7;

    if (metrics) {
      const tempSize = metrics.performance.temporaryFilesSize;
      const tempMB = tempSize / (1024 * 1024);
      if (tempMB > 1000) {
        issues.push({
          title: 'Excessive temporary files',
          description: `${tempMB.toFixed(0)} MB of temporary files detected. These can be safely removed.`,
          severity: 'high',
          impact: 15,
          autoFixable: true,
        });
      } else if (tempMB > 200) {
        issues.push({
          title: 'Growing temporary files',
          description: `${tempMB.toFixed(0)} MB of temporary files detected.`,
          severity: 'medium',
          impact: 8,
          autoFixable: true,
        });
      }
      confidence = 0.85;
    } else {
      issues.push({
        title: 'Temp file data unavailable',
        description: 'Unable to read temporary file information.',
        severity: 'low',
        impact: 5,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Run the Junk Cleaner to remove temporary files', 'Clear temp folders periodically']
        : ['Temporary files are under control'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Recycle Bin Analyzer ──────────────────────────────────────

export class RecycleBinAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'recycle_bin' as const;
  readonly categoryName = 'Recycle Bin';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    const metrics = input.metrics;
    const baseScore = 100;
    let confidence = 0.7;

    if (metrics) {
      const binSize = metrics.performance.recycleBinSize;
      const binMB = binSize / (1024 * 1024);
      if (binMB > 2000) {
        issues.push({
          title: 'Recycle Bin nearly full',
          description: `${binMB.toFixed(0)} MB in the Recycle Bin. Empty it to reclaim space.`,
          severity: 'high',
          impact: 12,
          autoFixable: true,
        });
      } else if (binMB > 500) {
        issues.push({
          title: 'Recycle Bin accumulating',
          description: `${binMB.toFixed(0)} MB in the Recycle Bin.`,
          severity: 'low',
          impact: 5,
          autoFixable: true,
        });
      }
      confidence = 0.85;
    } else {
      issues.push({
        title: 'Recycle Bin data unavailable',
        description: 'Unable to read Recycle Bin size.',
        severity: 'low',
        impact: 5,
        autoFixable: false,
      });
      confidence = 0.3;
    }

    const score = scoreFromIssues(baseScore, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Empty the Recycle Bin to reclaim disk space']
        : ['Recycle Bin is empty or minimal'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Placeholder Analyzers ─────────────────────────────────────

export class SystemUpdatesAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'system_updates' as const;
  readonly categoryName = 'System Updates';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    let confidence = 0.3;

    if (input.metrics) {
      const updates = input.metrics.security.updates;
      if (updates.pendingUpdates > 0) {
        issues.push({
          title: `${updates.pendingUpdates} pending Windows updates`,
          description: 'Windows updates are pending installation. Security patches are important.',
          severity: 'medium',
          impact: 10,
          autoFixable: false,
        });
      }
      if (updates.lastUpdateDate) {
        const lastUpdate = new Date(updates.lastUpdateDate);
        const daysSince = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 60) {
          issues.push({
            title: 'Windows updates are overdue',
            description: `Last update was ${Math.round(daysSince)} days ago. Security patches may be missing.`,
            severity: 'high',
            impact: 15,
            autoFixable: false,
          });
        }
      }
      confidence = 0.5;
    }

    const score = scoreFromIssues(100, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Install pending Windows updates', 'Enable automatic Windows updates']
        : ['System is up to date'],
      confidence,
      analyzedAt: now(),
    };
  }
}

export class DriversAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'drivers' as const;
  readonly categoryName = 'Drivers';

  analyze(_input: HealthAnalysisInput): CategoryResult {
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score: 75,
      severity: 'info',
      issues: [{
        title: 'Driver analysis not yet available',
        description: 'Driver health analysis will be available in a future update.',
        severity: 'info',
        impact: 0,
        autoFixable: false,
      }],
      recommendations: ['Keep drivers updated through Windows Update or manufacturer tools'],
      confidence: 0.1,
      analyzedAt: now(),
    };
  }
}

export class SecurityAnalyzer implements CategoryAnalyzer {
  readonly categoryId = 'security' as const;
  readonly categoryName = 'Security';

  analyze(input: HealthAnalysisInput): CategoryResult {
    const issues: CategoryIssue[] = [];
    let confidence = 0.4;

    if (input.metrics) {
      const sec = input.metrics.security;
      if (!sec.defender.enabled) {
        issues.push({
          title: 'Antivirus protection disabled',
          description: 'Windows Defender or third-party antivirus is not active.',
          severity: 'critical',
          impact: 25,
          autoFixable: false,
        });
      }
      if (!sec.defender.realTimeProtection) {
        issues.push({
          title: 'Real-time protection off',
          description: 'Real-time malware protection is disabled.',
          severity: 'high',
          impact: 15,
          autoFixable: false,
        });
      }
      if (!sec.firewall.enabled) {
        issues.push({
          title: 'Firewall disabled',
          description: 'Windows Firewall is not active. This exposes the system to network threats.',
          severity: 'high',
          impact: 12,
          autoFixable: false,
        });
      }
      confidence = 0.6;
    }

    const score = scoreFromIssues(100, issues);
    return {
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      score,
      severity: worstSeverity(issues),
      issues,
      recommendations: issues.length > 0
        ? ['Enable antivirus protection immediately', 'Turn on Windows Firewall', 'Enable real-time protection']
        : ['Security settings are properly configured'],
      confidence,
      analyzedAt: now(),
    };
  }
}

// ── Analyzer Registry ─────────────────────────────────────────

/**
 * Registry of all available category analyzers.
 * Future modules register their analyzer here — no architecture changes.
 */
export class AnalyzerRegistry {
  private _analyzers: Map<HealthCategoryId, CategoryAnalyzer> = new Map();

  register(analyzer: CategoryAnalyzer): void {
    this._analyzers.set(analyzer.categoryId, analyzer);
  }

  unregister(categoryId: HealthCategoryId): void {
    this._analyzers.delete(categoryId);
  }

  get(categoryId: HealthCategoryId): CategoryAnalyzer | undefined {
    return this._analyzers.get(categoryId);
  }

  getAll(): CategoryAnalyzer[] {
    return Array.from(this._analyzers.values());
  }

  has(categoryId: HealthCategoryId): boolean {
    return this._analyzers.has(categoryId);
  }

  clear(): void {
    this._analyzers.clear();
  }
}

/**
 * Default registry with all built-in analyzers registered.
 */
export function createDefaultRegistry(): AnalyzerRegistry {
  const registry = new AnalyzerRegistry();
  registry.register(new StorageHealthAnalyzer());
  registry.register(new PerformanceAnalyzer());
  registry.register(new MemoryUsageAnalyzer());
  registry.register(new StartupAnalyzer());
  registry.register(new BrowserHealthAnalyzer());
  registry.register(new PrivacyAnalyzer());
  registry.register(new TempFilesAnalyzer());
  registry.register(new RecycleBinAnalyzer());
  registry.register(new SystemUpdatesAnalyzer());
  registry.register(new DriversAnalyzer());
  registry.register(new SecurityAnalyzer());
  return registry;
}
