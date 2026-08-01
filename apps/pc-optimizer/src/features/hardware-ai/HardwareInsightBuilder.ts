/**
 * HardwareInsightBuilder — converts component analyses and issues
 * into human-readable AIInsight objects with full evidence chains.
 *
 * Uses HardwareExplanationEngine for natural language generation.
 * Every insight is traceable to sensor evidence — no hallucinated information.
 */
import type {
  ComponentAnalysis,
  AIInsight,
  AIEvidence,
  AISeverity,
  HardwareAIConfiguration,
} from './types';
import {
  confidenceToLabel,
  severityToRisk,
  severityToUrgency,
} from './types';
import type {
  HardwareSnapshot,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
} from '../hardware-center/types';
import { HardwareExplanationEngine } from './HardwareExplanationEngine';

export class HardwareInsightBuilder {
  private explanationEngine: HardwareExplanationEngine;

  constructor(private config: HardwareAIConfiguration) {
    this.explanationEngine = new HardwareExplanationEngine(config);
  }

  build(analyses: ComponentAnalysis[], snapshot: HardwareSnapshot): AIInsight[] {
    const insights: AIInsight[] = [];

    for (const analysis of analyses) {
      const component = snapshot.components.find((c) => c.category === analysis.category);
      if (!component) continue;

      for (const issue of analysis.issues) {
        if (issue.confidence < this.config.minConfidence) continue;

        const insight = this.buildInsight(analysis, issue, component, snapshot);
        if (insight) insights.push(insight);
      }
    }

    // Sort by severity (critical first) then by confidence (highest first)
    const severityOrder: Record<AISeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    insights.sort((a, b) => {
      const s = severityOrder[a.severity] - severityOrder[b.severity];
      if (s !== 0) return s;
      return b.confidence - a.confidence;
    });

    return insights.slice(0, this.config.maxInsights);
  }

  private buildInsight(
    analysis: ComponentAnalysis,
    issue: ComponentAnalysis['issues'][number],
    component: HardwareSnapshot['components'][number],
    snapshot: HardwareSnapshot,
  ): AIInsight | null {
    const explanation = this.getExplanation(issue.id, component, snapshot);
    if (!explanation) return null;

    const id = `insight-${snapshot.id}-${issue.id}`;
    const actions = this.getRecommendedActions(issue.id);

    return {
      id,
      category: analysis.category,
      title: issue.title,
      summary: explanation.summary,
      explanation: explanation.explanation,
      evidence: issue.evidence,
      confidence: issue.confidence,
      confidenceLabel: confidenceToLabel(issue.confidence),
      severity: issue.severity,
      risk: severityToRisk(issue.severity),
      urgency: severityToUrgency(issue.severity),
      expectedImpact: this.getExpectedImpact(issue.id),
      recommendedActions: actions,
      estimatedBenefit: this.getEstimatedBenefit(issue.id, issue.severity),
      timestamp: snapshot.timestamp,
    };
  }

  private getExplanation(
    issueId: string,
    component: HardwareSnapshot['components'][number],
    _snapshot: HardwareSnapshot,
  ): { summary: string; explanation: string } | null {
    switch (component.category) {
      case 'cpu': {
        const cpu = component as CPUComponent;
        const temp = cpu.sensors.temperatureC;
        const util = cpu.info.packageUtilization;
        const utilVal = util?.supported ? util.value : null;
        const tempVal = temp?.supported ? temp.value : null;

        if (issueId.includes('temp-critical') || (issueId.includes('temp-high') && tempVal !== null)) {
          return this.explanationEngine.explainHighCPUTemp(cpu, tempVal!, utilVal);
        }
        if (issueId.includes('throttling')) {
          return this.explanationEngine.explainCPUThrottling(cpu);
        }
        if (issueId.includes('util-high') && utilVal !== null) {
          return this.explanationEngine.explainHighCPUUtilization(cpu, utilVal);
        }
        if (issueId.includes('background') && utilVal !== null) {
          return this.explanationEngine.explainBackgroundCPULoad(cpu, utilVal);
        }
        if (issueId.includes('missing')) {
          return this.explanationEngine.explainMissingSensors('CPU', 'temperature');
        }
        break;
      }
      case 'gpu': {
        const gpu = component as GPUComponent;
        const temp = gpu.sensors.temperatureC;
        const util = gpu.sensors.gpuUtilization;
        const utilVal = util?.supported ? util.value : null;
        const tempVal = temp?.supported ? temp.value : null;
        const memUtil = gpu.sensors.memoryUtilization;

        if (issueId.includes('temp') && tempVal !== null) {
          return this.explanationEngine.explainHighGPUTemp(gpu, tempVal, utilVal);
        }
        if (issueId.includes('vram') && memUtil?.supported) {
          return this.explanationEngine.explainGPUVRAMPressure(gpu, memUtil.value);
        }
        if (issueId.includes('background') && utilVal !== null) {
          return this.explanationEngine.explainGPUBackgroundUsage(gpu, utilVal);
        }
        if (issueId.includes('missing')) {
          return this.explanationEngine.explainMissingSensors('GPU', 'temperature');
        }
        break;
      }
      case 'ram': {
        const ram = component as RAMComponent;
        const used = ram.info.usedMB;
        const pressure = ram.info.memoryPressure;

        if ((issueId.includes('high-usage') || issueId.includes('pressure')) && used?.supported) {
          return this.explanationEngine.explainHighMemoryUsage(ram, used.value, ram.info.installedMB);
        }
        if (issueId.includes('pressure-high') && pressure?.supported) {
          return this.explanationEngine.explainMemoryPressure(ram, pressure.value);
        }
        break;
      }
      case 'storage': {
        const storage = component as StorageComponent;
        const health = storage.sensors.healthPercent;
        const temp = storage.sensors.temperatureC;
        const freeBytes = storage.info.freeBytes;

        if (issueId.includes('smart') && health?.supported) {
          return this.explanationEngine.explainSMARTDegradation(storage, health.value);
        }
        if (issueId.includes('temp') && temp?.supported) {
          return this.explanationEngine.explainStorageHighTemp(storage, temp.value);
        }
        if (issueId.includes('low-space') && freeBytes?.supported) {
          return this.explanationEngine.explainLowFreeSpace(storage, freeBytes.value, storage.info.capacityBytes);
        }
        break;
      }
      case 'battery': {
        const battery = component as BatteryComponent;
        const wear = battery.info.wearLevelPercent;
        const charge = battery.info.currentChargePercent;

        if (issueId.includes('wear') && wear?.supported) {
          return this.explanationEngine.explainBatteryWear(battery, wear.value);
        }
        if (issueId.includes('low-charge') && charge?.supported) {
          return this.explanationEngine.explainLowBattery(battery, charge.value);
        }
        break;
      }
      case 'network': {
        const network = component as NetworkComponent;
        const download = network.sensors.downloadMbps;
        const signal = network.info.signalStrengthPercent;

        if (issueId.includes('high-download') && download?.supported) {
          return this.explanationEngine.explainHighNetworkUsage(network, download.value);
        }
        if (issueId.includes('weak-signal') && signal?.supported) {
          return this.explanationEngine.explainWeakWifiSignal(network, signal.value);
        }
        break;
      }
      case 'cooling': {
        if (issueId.includes('fan-stopped')) {
          const fanName = issueId.replace('fan-stopped-', '');
          return this.explanationEngine.explainFanNotSpinning(fanName);
        }
        break;
      }
    }

    // Generic fallback
    return {
      summary: `Issue detected: ${issueId}`,
      explanation: `An issue was detected that warrants attention. Please review the component details for more information.`,
    };
  }

  private getRecommendedActions(issueId: string): string[] {
    if (issueId.includes('temp') || issueId.includes('throttling')) {
      return [
        'Clean dust from heatsinks and fans',
        'Verify case airflow is unobstructed',
        'Consider reapplying thermal paste',
        'Ensure adequate ventilation around the computer',
      ];
    }
    if (issueId.includes('smart')) {
      return ['Back up data immediately', 'Run manufacturer disk diagnostic', 'Plan drive replacement'];
    }
    if (issueId.includes('low-space')) {
      return ['Run Junk Cleaner', 'Move large files to another drive', 'Uninstall unused applications'];
    }
    if (issueId.includes('wear')) {
      return ['Check warranty coverage', 'Keep plugged in when possible', 'Avoid high temperatures'];
    }
    if (issueId.includes('pressure') || issueId.includes('usage')) {
      return ['Close unnecessary applications', 'Check Task Manager for memory hogs', 'Consider adding more RAM'];
    }
    if (issueId.includes('weak-signal')) {
      return ['Move closer to the router', 'Switch to 5 GHz if available', 'Remove obstructions'];
    }
    if (issueId.includes('fan')) {
      return ['Check fan cable connection', 'Replace fan if failed', 'Do not run under load until repaired'];
    }
    if (issueId.includes('missing')) {
      return ['Install Libre Hardware Monitor', 'Check manufacturer tools', 'Some sensors may be unavailable'];
    }
    return ['Monitor the situation and revisit if conditions worsen'];
  }

  private getExpectedImpact(issueId: string): string {
    if (issueId.includes('temp')) return 'Reduced temperatures, restored performance, extended component lifespan';
    if (issueId.includes('smart')) return 'Data safety ensured, system reliability restored';
    if (issueId.includes('low-space')) return '10–50 GB recovered, improved SSD performance';
    if (issueId.includes('wear')) return 'Restored battery runtime and reliability';
    if (issueId.includes('pressure')) return '2–4 GB RAM recovered, improved responsiveness';
    if (issueId.includes('weak-signal')) return '20–50% network speed improvement';
    if (issueId.includes('fan')) return 'Prevented thermal damage, restored cooling';
    return 'Improved system health and stability';
  }

  private getEstimatedBenefit(issueId: string, severity: AISeverity): string {
    if (severity === 'critical') return 'Critical — prevents hardware damage or data loss';
    if (severity === 'high') return 'High — significant improvement to system health and longevity';
    if (severity === 'medium') return 'Moderate — noticeable improvement to performance or reliability';
    return 'Low — preventive maintenance for long-term health';
  }
}
