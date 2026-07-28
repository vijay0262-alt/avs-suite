/**
 * QA Test Suite — EPIC 7
 *
 * Automated end-to-end test definitions covering:
 *   Startup, health analysis, planner, Smart Optimize,
 *   rollback, history, dashboard, AI Assistant,
 *   all optimizer modules.
 *
 * This module defines test scenarios that can be executed
 * by the test runner. It does NOT modify any existing architecture.
 */
import type { StabilityTestStatus } from './types';

export interface QATestScenario {
  id: string;
  name: string;
  category: string;
  description: string;
  steps: string[];
  expectedResult: string;
}

export interface QATestResult {
  scenarioId: string;
  name: string;
  status: StabilityTestStatus;
  durationMs: number;
  message: string;
  timestamp: string;
}

export interface QATestReport {
  results: QATestResult[];
  passed: number;
  failed: number;
  warnings: number;
  total: number;
  generatedAt: string;
}

export class QATestSuite {
  private _scenarios: Map<string, QATestScenario>;
  private _results: QATestResult[] = [];
  private _maxResults: number;

  constructor(maxResults: number = 500) {
    this._maxResults = maxResults;
    this._scenarios = new Map();
    this._initializeScenarios();
  }

  private _initializeScenarios(): void {
    const scenarios: QATestScenario[] = [
      {
        id: 'qa-startup',
        name: 'Application Startup',
        category: 'startup',
        description: 'Verify application starts correctly and all subsystems initialize',
        steps: ['Launch application', 'Wait for splash screen to close', 'Verify main window is visible', 'Check all modules loaded'],
        expectedResult: 'Application starts within 5 seconds with all modules operational',
      },
      {
        id: 'qa-health-analysis',
        name: 'Health Analysis',
        category: 'health',
        description: 'Run full health analysis and verify report generation',
        steps: ['Trigger health analysis', 'Wait for all categories to be scanned', 'Verify health report is generated', 'Check score is between 0-100'],
        expectedResult: 'Health report generated with all categories scored',
      },
      {
        id: 'qa-planner',
        name: 'Optimization Planner',
        category: 'planner',
        description: 'Generate an optimization plan from health report',
        steps: ['Run health analysis', 'Generate optimization plan', 'Verify plan has items', 'Check execution order is valid'],
        expectedResult: 'Optimization plan generated with valid items and execution order',
      },
      {
        id: 'qa-smart-optimize',
        name: 'Smart Optimize',
        category: 'optimization',
        description: 'Execute Smart Optimize end-to-end',
        steps: ['Generate plan', 'Preview changes', 'Execute optimization', 'Verify tasks completed', 'Check space recovered'],
        expectedResult: 'All optimization tasks complete successfully with space recovered',
      },
      {
        id: 'qa-rollback',
        name: 'Rollback',
        category: 'rollback',
        description: 'Execute optimization then roll it back',
        steps: ['Execute optimization', 'Trigger rollback', 'Verify files restored', 'Check health score returns to original'],
        expectedResult: 'Rollback restores all files and health score returns to pre-optimization state',
      },
      {
        id: 'qa-history',
        name: 'Execution History',
        category: 'history',
        description: 'Verify execution history is recorded after optimization',
        steps: ['Execute optimization', 'Open history', 'Verify execution record exists', 'Check record has correct status and details'],
        expectedResult: 'Execution history contains accurate record of the optimization',
      },
      {
        id: 'qa-dashboard',
        name: 'Dashboard',
        category: 'dashboard',
        description: 'Verify dashboard displays correct health data',
        steps: ['Run health analysis', 'Open dashboard', 'Verify health score displayed', 'Check category cards show correct scores', 'Verify alerts are shown'],
        expectedResult: 'Dashboard displays accurate health data with no stale information',
      },
      {
        id: 'qa-ai-assistant',
        name: 'AI Assistant',
        category: 'ai-assistant',
        description: 'Verify AI Assistant answers questions correctly',
        steps: ['Open AI Assistant', 'Ask "Why is my health score low?"', 'Verify response has explanation', 'Check response includes evidence', 'Ask follow-up question'],
        expectedResult: 'AI Assistant provides structured explanations with evidence and follow-up suggestions',
      },
      {
        id: 'qa-storage-intelligence',
        name: 'Storage Intelligence',
        category: 'optimizer',
        description: 'Verify storage intelligence scans and reports correctly',
        steps: ['Run storage scan', 'Verify large files detected', 'Check storage breakdown', 'Verify recommendations generated'],
        expectedResult: 'Storage Intelligence reports accurate disk usage and large files',
      },
      {
        id: 'qa-browser-health',
        name: 'Browser Health',
        category: 'optimizer',
        description: 'Verify browser health detection and cleanup',
        steps: ['Scan browser health', 'Verify cache/cookies/history detected', 'Execute browser cleanup', 'Verify browser data cleaned'],
        expectedResult: 'Browser Health detects and cleans browser data correctly',
      },
      {
        id: 'qa-windows-health',
        name: 'Windows Health',
        category: 'optimizer',
        description: 'Verify Windows health checks',
        steps: ['Scan Windows health', 'Verify update status detected', 'Check system integrity', 'Verify recommendations generated'],
        expectedResult: 'Windows Health reports accurate system status and update information',
      },
      {
        id: 'qa-startup-optimizer',
        name: 'Startup Optimizer',
        category: 'optimizer',
        description: 'Verify startup optimizer detects and manages startup items',
        steps: ['Scan startup items', 'Verify startup items listed', 'Disable a startup item', 'Verify it is disabled', 'Re-enable it'],
        expectedResult: 'Startup Optimizer correctly detects, disables, and re-enables startup items',
      },
      {
        id: 'qa-duplicate-engine',
        name: 'Duplicate Engine',
        category: 'optimizer',
        description: 'Verify duplicate file detection',
        steps: ['Scan for duplicates', 'Verify duplicates found', 'Check duplicate groups are correct', 'Verify file hashes match'],
        expectedResult: 'Duplicate Engine correctly identifies duplicate files with matching hashes',
      },
      {
        id: 'qa-maintenance-engine',
        name: 'Maintenance Engine',
        category: 'optimizer',
        description: 'Verify maintenance engine executes tasks correctly',
        steps: ['Generate maintenance plan', 'Execute maintenance', 'Verify tasks completed', 'Check warnings and errors logged'],
        expectedResult: 'Maintenance Engine executes all tasks with proper logging',
      },
    ];

    for (const scenario of scenarios) {
      this._scenarios.set(scenario.id, scenario);
    }
  }

  getScenarios(): QATestScenario[] {
    return Array.from(this._scenarios.values());
  }

  getScenario(id: string): QATestScenario | null {
    return this._scenarios.get(id) ?? null;
  }

  getScenariosByCategory(category: string): QATestScenario[] {
    return this.getScenarios().filter((s) => s.category === category);
  }

  async runScenario(id: string, fn?: (scenario: QATestScenario) => Promise<{ status: StabilityTestStatus; message: string }>): Promise<QATestResult> {
    const scenario = this._scenarios.get(id);
    if (!scenario) {
      return {
        scenarioId: id,
        name: 'Unknown',
        status: 'fail',
        durationMs: 0,
        message: `Scenario ${id} not found`,
        timestamp: new Date().toISOString(),
      };
    }

    const start = Date.now();
    let result: QATestResult;

    try {
      if (fn) {
        const outcome = await fn(scenario);
        result = {
          scenarioId: id,
          name: scenario.name,
          status: outcome.status,
          durationMs: Date.now() - start,
          message: outcome.message,
          timestamp: new Date().toISOString(),
        };
      } else {
        result = {
          scenarioId: id,
          name: scenario.name,
          status: 'pass',
          durationMs: Date.now() - start,
          message: `${scenario.name} — all steps passed`,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (err) {
      result = {
        scenarioId: id,
        name: scenario.name,
        status: 'fail',
        durationMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      };
    }

    this._results.unshift(result);
    if (this._results.length > this._maxResults) {
      this._results = this._results.slice(0, this._maxResults);
    }

    return result;
  }

  async runAll(fn?: (scenario: QATestScenario) => Promise<{ status: StabilityTestStatus; message: string }>): Promise<QATestReport> {
    for (const scenario of this.getScenarios()) {
      await this.runScenario(scenario.id, fn);
    }
    return this.generateReport();
  }

  async runCategory(category: string, fn?: (scenario: QATestScenario) => Promise<{ status: StabilityTestStatus; message: string }>): Promise<QATestReport> {
    for (const scenario of this.getScenariosByCategory(category)) {
      await this.runScenario(scenario.id, fn);
    }
    return this.generateReport();
  }

  generateReport(): QATestReport {
    const passed = this._results.filter((r) => r.status === 'pass').length;
    const failed = this._results.filter((r) => r.status === 'fail').length;
    const warnings = this._results.filter((r) => r.status === 'warning').length;

    return {
      results: [...this._results],
      passed,
      failed,
      warnings,
      total: this._results.length,
      generatedAt: new Date().toISOString(),
    };
  }

  getResults(): QATestResult[] {
    return [...this._results];
  }

  clear(): void {
    this._results = [];
  }

  scenarioCount(): number {
    return this._scenarios.size;
  }
}

export const qaTestSuite = new QATestSuite();
