/**
 * HardwareAnalyzer — dispatches to per-component analyzers and
 * collects ComponentAnalysis results for all hardware in a snapshot.
 */
import type { ComponentAnalysis, HardwareAIConfiguration } from './types';
import type { HardwareSnapshot, HardwareComponent } from '../hardware-center/types';
import {
  CPUAnalyzer,
  GPUAnalyzer,
  MemoryAnalyzer,
  StorageAnalyzer,
  BatteryAnalyzer,
  NetworkAnalyzer,
  CoolingAnalyzer,
} from './HardwareAnalyzers';
import type { HardwareTrendHistory } from './HardwareTrendHistory';

export class HardwareAnalyzer {
  private cpuAnalyzer: CPUAnalyzer;
  private gpuAnalyzer: GPUAnalyzer;
  private memoryAnalyzer: MemoryAnalyzer;
  private storageAnalyzer: StorageAnalyzer;
  private batteryAnalyzer: BatteryAnalyzer;
  private networkAnalyzer: NetworkAnalyzer;
  private coolingAnalyzer: CoolingAnalyzer;

  constructor(config: HardwareAIConfiguration, trendHistory: HardwareTrendHistory) {
    this.cpuAnalyzer = new CPUAnalyzer(config, trendHistory);
    this.gpuAnalyzer = new GPUAnalyzer(config, trendHistory);
    this.memoryAnalyzer = new MemoryAnalyzer(config, trendHistory);
    this.storageAnalyzer = new StorageAnalyzer(config, trendHistory);
    this.batteryAnalyzer = new BatteryAnalyzer(config, trendHistory);
    this.networkAnalyzer = new NetworkAnalyzer(config, trendHistory);
    this.coolingAnalyzer = new CoolingAnalyzer(config, trendHistory);
  }

  analyzeAll(snapshot: HardwareSnapshot): ComponentAnalysis[] {
    const results: ComponentAnalysis[] = [];
    for (const component of snapshot.components) {
      const analysis = this.analyzeComponent(component);
      if (analysis) results.push(analysis);
    }
    return results;
  }

  analyzeComponent(component: HardwareComponent): ComponentAnalysis | null {
    switch (component.category) {
      case 'cpu': return this.cpuAnalyzer.analyze(component);
      case 'gpu': return this.gpuAnalyzer.analyze(component);
      case 'ram': return this.memoryAnalyzer.analyze(component);
      case 'storage': return this.storageAnalyzer.analyze(component);
      case 'battery': return this.batteryAnalyzer.analyze(component);
      case 'network': return this.networkAnalyzer.analyze(component);
      case 'cooling': return this.coolingAnalyzer.analyze(component);
      default: return null;
    }
  }
}
