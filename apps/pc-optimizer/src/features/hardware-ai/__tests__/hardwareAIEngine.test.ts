/**
 * Hardware AI Engine — Comprehensive Tests
 *
 * Tests for:
 * - CPU analysis (high temp, throttling, high utilization, background load, missing sensors)
 * - GPU analysis (high temp, VRAM pressure, background usage)
 * - Memory analysis (high usage, memory pressure)
 * - Storage analysis (SMART degradation, low free space, high temp)
 * - Battery analysis (wear, low charge)
 * - Network analysis (high usage, weak signal)
 * - Cooling analysis (fan stopped)
 * - Thermal analysis (anomalies, missing sensors, throttling)
 * - Trend analysis (improving, stable, degrading, rapid degradation)
 * - Health scoring (weighted average, overall health level)
 * - Risk assessment (overall risk, urgency, time to action)
 * - Insight building (evidence-based, confidence, severity)
 * - Recommendation generation (actions, automation, restart)
 * - Full engine integration (end-to-end report)
 * - Unsupported sensors handling
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HardwareAIEngine } from '../HardwareAIEngine';
import { HardwareTrendHistory } from '../HardwareTrendHistory';
import { HealthScoringEngine } from '../HealthScoringEngine';
import { TrendAnalyzer } from '../TrendAnalyzer';
import { HardwareRiskAssessmentEngine } from '../HardwareRiskAssessment';
import { HardwareRecommendationEngine } from '../HardwareRecommendationEngine';
import { HardwareInsightBuilder } from '../HardwareInsightBuilder';
import { HardwareExplanationEngine } from '../HardwareExplanationEngine';
import { ThermalAnalyzer, CPUAnalyzer, GPUAnalyzer, MemoryAnalyzer, StorageAnalyzer, BatteryAnalyzer, NetworkAnalyzer, CoolingAnalyzer } from '../HardwareAnalyzers';
import { HardwareAnalyzer } from '../HardwareAnalyzer';
import { DEFAULT_AI_CONFIG } from '../types';
import type { HardwareAIConfiguration } from '../types';
import type {
  HardwareSnapshot,
  HardwareComponent,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
  OSComponent,
  MotherboardComponent,
  ProviderHealthStatus,
} from '../../hardware-center/types';
import { mkSensor } from '../../hardware-center/types';
import { hardwareAIEventBus } from '../HardwareAIEvents';

// ── Mock Factories ───────────────────────────────────────────────────

function makeCPU(overrides?: Partial<CPUComponent>): CPUComponent {
  return {
    category: 'cpu',
    info: {
      vendor: 'Intel',
      model: 'Core i7-12700K',
      architecture: 'x86_64',
      logicalCores: 20,
      physicalCores: 12,
      threads: 20,
      baseFrequencyMHz: 3600,
      boostFrequencyMHz: 5000,
      currentFrequencyMHz: mkSensor(4200, 'MHz'),
      perCoreUtilization: [45, 52, 38, 61, 44, 50, 33, 55, 41, 48, 39, 60].map((v) => mkSensor(v, '%')),
      packageUtilization: mkSensor(47, '%'),
    },
    sensors: {
      temperatureC: mkSensor(55, '°C'),
      powerDrawW: mkSensor(65, 'W'),
      voltageV: mkSensor(1.2, 'V'),
      thermalThrottling: mkSensor(false, 'bool'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeGPU(overrides?: Partial<GPUComponent>): GPUComponent {
  return {
    category: 'gpu',
    info: {
      vendor: 'NVIDIA',
      model: 'GeForce RTX 3070',
      driver: '536.40',
      vramMB: 8192,
      dedicatedMemoryMB: mkSensor(8192, 'MB'),
      sharedMemoryMB: mkSensor(0, 'MB'),
    },
    sensors: {
      gpuUtilization: mkSensor(35, '%'),
      memoryUtilization: mkSensor(28, '%'),
      temperatureC: mkSensor(58, '°C'),
      fanSpeedRPM: mkSensor(1800, 'RPM'),
      coreClockMHz: mkSensor(1500, 'MHz'),
      memoryClockMHz: mkSensor(6750, 'MHz'),
      powerDrawW: mkSensor(120, 'W'),
      encoderUsage: mkSensor(0, '%'),
      decoderUsage: mkSensor(0, '%'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeRAM(overrides?: Partial<RAMComponent>): RAMComponent {
  return {
    category: 'ram',
    info: {
      installedMB: 32768,
      availableMB: mkSensor(16384, 'MB'),
      usedMB: mkSensor(16384, 'MB'),
      cachedMB: mkSensor(2048, 'MB'),
      memoryPressure: mkSensor(50, '%'),
      speedMTs: 3200,
      channels: 2,
      slotsUsed: 2,
      slotsTotal: 4,
      ecc: false,
      modules: [],
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeStorage(overrides?: Partial<StorageComponent>): StorageComponent {
  return {
    category: 'storage',
    info: {
      type: 'ssd',
      model: 'Samsung 980 PRO',
      capacityBytes: 1024000000000,
      usedBytes: mkSensor(400000000000, 'B'),
      freeBytes: mkSensor(624000000000, 'B'),
      filesystem: 'NTFS',
      interface: 'NVMe',
      smartSupported: true,
    },
    sensors: {
      temperatureC: mkSensor(42, '°C'),
      healthPercent: mkSensor(95, '%'),
      lifetimeRemainingPercent: mkSensor(92, '%'),
      readSpeedMBps: mkSensor(6800, 'MB/s'),
      writeSpeedMBps: mkSensor(5100, 'MB/s'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeNetwork(overrides?: Partial<NetworkComponent>): NetworkComponent {
  return {
    category: 'network',
    info: {
      adapter: 'Intel Wi-Fi 6 AX201',
      mac: 'AA:BB:CC:DD:EE:FF',
      ipv4: ['192.168.1.100'],
      type: 'wifi',
      signalStrengthPercent: mkSensor(75, '%'),
    },
    sensors: {
      usagePercent: mkSensor(12, '%'),
      downloadMbps: mkSensor(45, 'Mbps'),
      uploadMbps: mkSensor(10, 'Mbps'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeBattery(overrides?: Partial<BatteryComponent>): BatteryComponent {
  return {
    category: 'battery',
    info: {
      designCapacityWH: 60,
      fullChargeCapacityWH: 55,
      chargeCycles: 120,
      currentChargePercent: mkSensor(85, '%'),
      wearLevelPercent: mkSensor(8, '%'),
      chargingStatus: mkSensor('discharging' as const, 'status'),
      estimatedRuntimeMinutes: mkSensor(240, 'min'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeCooling(overrides?: Partial<CoolingComponent>): CoolingComponent {
  return {
    category: 'cooling',
    info: {
      fans: [
        { name: 'CPU Fan', type: 'cpu_fan', rpm: mkSensor(1800, 'RPM') },
        { name: 'Case Fan', type: 'case_fan', rpm: mkSensor(1200, 'RPM') },
      ],
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeOS(overrides?: Partial<OSComponent>): OSComponent {
  return {
    category: 'operating_system',
    info: {
      name: 'Windows 11',
      version: '23H2',
      architecture: 'x86_64',
      uptimeSeconds: mkSensor(3600, 's'),
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeMotherboard(overrides?: Partial<MotherboardComponent>): MotherboardComponent {
  return {
    category: 'motherboard',
    info: {
      manufacturer: 'ASUS',
      model: 'PRIME Z690-A',
      version: 'Rev 1.02',
      biosVendor: 'AMI',
      biosVersion: '1801',
      biosDate: '2024-01-10',
      chipset: 'Intel Z690',
    },
    sensorStatus: { availability: 'available' },
    ...overrides,
  };
}

function makeAllComponents(): HardwareComponent[] {
  return [makeCPU(), makeGPU(), makeRAM(), makeStorage(), makeNetwork(), makeBattery(), makeCooling(), makeOS(), makeMotherboard()];
}

function makeSnapshot(components?: HardwareComponent[]): HardwareSnapshot {
  return {
    id: `hw-snap-${Date.now()}`,
    timestamp: Date.now(),
    scanDurationMs: 100,
    components: components ?? makeAllComponents(),
    providerHealth: {},
    metadata: { source: 'mock', version: '1.1.0', partial: false },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('HardwareAIEngine', () => {
  let engine: HardwareAIEngine;

  beforeEach(() => {
    hardwareAIEventBus.clear();
    engine = new HardwareAIEngine();
  });

  afterEach(() => {
    engine?.dispose();
    hardwareAIEventBus.clear();
  });

  describe('full analysis', () => {
    it('produces a complete report from a healthy snapshot', () => {
      const snapshot = makeSnapshot();
      const report = engine.analyze(snapshot);

      expect(report.snapshotId).toBe(snapshot.id);
      expect(report.componentAnalyses.length).toBe(7); // 7 analyzable categories
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.overallHealth).toBeDefined();
      expect(report.systemSummary).toBeTruthy();
      expect(report.systemExplanation).toBeTruthy();
    });

    it('stores last report for retrieval', () => {
      const snapshot = makeSnapshot();
      engine.analyze(snapshot);
      expect(engine.getLastReport()).not.toBeNull();
      expect(engine.getLastReport()!.snapshotId).toBe(snapshot.id);
    });

    it('returns empty report when disabled', () => {
      engine.updateConfiguration({ enabled: false });
      const snapshot = makeSnapshot();
      const report = engine.analyze(snapshot);

      expect(report.componentAnalyses.length).toBe(0);
      expect(report.insights.length).toBe(0);
      expect(report.systemSummary).toContain('disabled');
    });

    it('emits analysis events', () => {
      const events: string[] = [];
      hardwareAIEventBus.subscribe((e) => events.push(e.type));
      const snapshot = makeSnapshot();
      engine.analyze(snapshot);

      expect(events).toContain('ai_analysis_started');
      expect(events).toContain('ai_analysis_completed');
    });
  });

  describe('CPU analysis', () => {
    it('detects critical CPU temperature', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.health).toBe('critical');
      expect(cpu.issues.some((i) => i.id === 'cpu-temp-critical')).toBe(true);
      expect(cpu.risk).toBe('severe');
    });

    it('detects high CPU temperature', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(80, '°C') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.issues.some((i) => i.id === 'cpu-temp-high')).toBe(true);
      expect(cpu.healthScore).toBeLessThan(100);
    });

    it('detects thermal throttling', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, thermalThrottling: mkSensor(true, 'bool') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.issues.some((i) => i.id === 'cpu-throttling')).toBe(true);
      expect(cpu.issues.find((i) => i.id === 'cpu-throttling')!.severity).toBe('critical');
    });

    it('detects high CPU utilization', () => {
      const snapshot = makeSnapshot([makeCPU({ info: { ...makeCPU().info, packageUtilization: mkSensor(90, '%') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.issues.some((i) => i.id === 'cpu-util-high')).toBe(true);
    });

    it('detects background CPU load', () => {
      const snapshot = makeSnapshot([makeCPU({ info: { ...makeCPU().info, packageUtilization: mkSensor(40, '%') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.issues.some((i) => i.id === 'cpu-util-background')).toBe(true);
    });

    it('reports missing temperature sensor', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { thermalThrottling: mkSensor(false, 'bool') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.issues.some((i) => i.id === 'cpu-temp-missing')).toBe(true);
    });

    it('reports healthy CPU with no issues', () => {
      const snapshot = makeSnapshot([makeCPU()]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.strengths.length).toBeGreaterThan(0);
      expect(cpu.issues.filter((i) => i.severity === 'critical' || i.severity === 'high')).toHaveLength(0);
    });
  });

  describe('GPU analysis', () => {
    it('detects critical GPU temperature', () => {
      const snapshot = makeSnapshot([makeGPU({ sensors: { ...makeGPU().sensors, temperatureC: mkSensor(90, '°C') } })]);
      const report = engine.analyze(snapshot);
      const gpu = report.componentAnalyses.find((a) => a.category === 'gpu')!;

      expect(gpu.issues.some((i) => i.id === 'gpu-temp-critical')).toBe(true);
    });

    it('detects VRAM pressure', () => {
      const snapshot = makeSnapshot([makeGPU({ sensors: { ...makeGPU().sensors, memoryUtilization: mkSensor(95, '%') } })]);
      const report = engine.analyze(snapshot);
      const gpu = report.componentAnalyses.find((a) => a.category === 'gpu')!;

      expect(gpu.issues.some((i) => i.id === 'gpu-vram-pressure')).toBe(true);
    });

    it('detects background GPU usage', () => {
      const snapshot = makeSnapshot([makeGPU({ sensors: { ...makeGPU().sensors, gpuUtilization: mkSensor(20, '%') } })]);
      const report = engine.analyze(snapshot);
      const gpu = report.componentAnalyses.find((a) => a.category === 'gpu')!;

      expect(gpu.issues.some((i) => i.id === 'gpu-util-background')).toBe(true);
    });
  });

  describe('Memory analysis', () => {
    it('detects high memory usage', () => {
      const snapshot = makeSnapshot([makeRAM({ info: { ...makeRAM().info, usedMB: mkSensor(28000, 'MB') } })]);
      const report = engine.analyze(snapshot);
      const ram = report.componentAnalyses.find((a) => a.category === 'ram')!;

      expect(ram.issues.some((i) => i.id === 'ram-high-usage')).toBe(true);
    });

    it('detects memory pressure', () => {
      const snapshot = makeSnapshot([makeRAM({ info: { ...makeRAM().info, memoryPressure: mkSensor(92, '%') } })]);
      const report = engine.analyze(snapshot);
      const ram = report.componentAnalyses.find((a) => a.category === 'ram')!;

      expect(ram.issues.some((i) => i.id === 'ram-pressure-high')).toBe(true);
    });

    it('reports healthy memory', () => {
      const snapshot = makeSnapshot([makeRAM()]);
      const report = engine.analyze(snapshot);
      const ram = report.componentAnalyses.find((a) => a.category === 'ram')!;

      expect(ram.strengths.some((s) => s.includes('healthy'))).toBe(true);
    });
  });

  describe('Storage analysis', () => {
    it('detects critical SMART degradation', () => {
      const snapshot = makeSnapshot([makeStorage({ sensors: { ...makeStorage().sensors, healthPercent: mkSensor(15, '%') } })]);
      const report = engine.analyze(snapshot);
      const storage = report.componentAnalyses.find((a) => a.category === 'storage')!;

      expect(storage.issues.some((i) => i.id === 'storage-smart-critical')).toBe(true);
      expect(storage.health).toBe('critical');
    });

    it('detects SMART degradation', () => {
      const snapshot = makeSnapshot([makeStorage({ sensors: { ...makeStorage().sensors, healthPercent: mkSensor(40, '%') } })]);
      const report = engine.analyze(snapshot);
      const storage = report.componentAnalyses.find((a) => a.category === 'storage')!;

      expect(storage.issues.some((i) => i.id === 'storage-smart-degraded')).toBe(true);
    });

    it('detects low free space', () => {
      const snapshot = makeSnapshot([makeStorage({ info: { ...makeStorage().info, freeBytes: mkSensor(50000000000, 'B') } })]);
      const report = engine.analyze(snapshot);
      const storage = report.componentAnalyses.find((a) => a.category === 'storage')!;

      expect(storage.issues.some((i) => i.id === 'storage-low-space')).toBe(true);
    });

    it('detects high storage temperature', () => {
      const snapshot = makeSnapshot([makeStorage({ sensors: { ...makeStorage().sensors, temperatureC: mkSensor(55, '°C') } })]);
      const report = engine.analyze(snapshot);
      const storage = report.componentAnalyses.find((a) => a.category === 'storage')!;

      expect(storage.issues.some((i) => i.id === 'storage-temp-high')).toBe(true);
    });
  });

  describe('Battery analysis', () => {
    it('detects critical battery wear', () => {
      const snapshot = makeSnapshot([makeBattery({ info: { ...makeBattery().info, wearLevelPercent: mkSensor(35, '%') } })]);
      const report = engine.analyze(snapshot);
      const battery = report.componentAnalyses.find((a) => a.category === 'battery')!;

      expect(battery.issues.some((i) => i.id === 'battery-wear-critical')).toBe(true);
    });

    it('detects battery wear warning', () => {
      const snapshot = makeSnapshot([makeBattery({ info: { ...makeBattery().info, wearLevelPercent: mkSensor(20, '%') } })]);
      const report = engine.analyze(snapshot);
      const battery = report.componentAnalyses.find((a) => a.category === 'battery')!;

      expect(battery.issues.some((i) => i.id === 'battery-wear-warning')).toBe(true);
    });

    it('detects low battery charge', () => {
      const snapshot = makeSnapshot([makeBattery({ info: { ...makeBattery().info, currentChargePercent: mkSensor(15, '%') } })]);
      const report = engine.analyze(snapshot);
      const battery = report.componentAnalyses.find((a) => a.category === 'battery')!;

      expect(battery.issues.some((i) => i.id === 'battery-low-charge')).toBe(true);
    });
  });

  describe('Network analysis', () => {
    it('detects weak Wi-Fi signal', () => {
      const snapshot = makeSnapshot([makeNetwork({ info: { ...makeNetwork().info, signalStrengthPercent: mkSensor(20, '%') } })]);
      const report = engine.analyze(snapshot);
      const network = report.componentAnalyses.find((a) => a.category === 'network')!;

      expect(network.issues.some((i) => i.id === 'net-weak-signal')).toBe(true);
    });

    it('reports healthy network', () => {
      const snapshot = makeSnapshot([makeNetwork()]);
      const report = engine.analyze(snapshot);
      const network = report.componentAnalyses.find((a) => a.category === 'network')!;

      expect(network.strengths.some((s) => s.includes('signal'))).toBe(true);
    });
  });

  describe('Cooling analysis', () => {
    it('detects stopped fan', () => {
      const snapshot = makeSnapshot([makeCooling({ info: { fans: [{ name: 'CPU Fan', type: 'cpu_fan', rpm: mkSensor(0, 'RPM') }] } })]);
      const report = engine.analyze(snapshot);
      const cooling = report.componentAnalyses.find((a) => a.category === 'cooling')!;

      expect(cooling.issues.some((i) => i.id.includes('fan-stopped'))).toBe(true);
      expect(cooling.health).toBe('critical');
    });

    it('reports healthy cooling', () => {
      const snapshot = makeSnapshot([makeCooling()]);
      const report = engine.analyze(snapshot);
      const cooling = report.componentAnalyses.find((a) => a.category === 'cooling')!;

      expect(cooling.strengths.some((s) => s.includes('operational'))).toBe(true);
    });
  });

  describe('Thermal analysis', () => {
    it('detects high temperature anomaly', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);
      const cpuThermal = report.thermalAnalyses.find((t) => t.category === 'cpu')!;

      expect(cpuThermal.currentTempC).toBe(95);
      expect(cpuThermal.anomalies.some((a) => a.type === 'high_temp')).toBe(true);
    });

    it('detects thermal throttling', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, thermalThrottling: mkSensor(true, 'bool') } })]);
      const report = engine.analyze(snapshot);
      const cpuThermal = report.thermalAnalyses.find((t) => t.category === 'cpu')!;

      expect(cpuThermal.throttling).toBe(true);
      expect(cpuThermal.anomalies.some((a) => a.type === 'throttling')).toBe(true);
    });

    it('detects missing thermal sensors', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { thermalThrottling: mkSensor(false, 'bool') } })]);
      const report = engine.analyze(snapshot);
      const cpuThermal = report.thermalAnalyses.find((t) => t.category === 'cpu')!;

      expect(cpuThermal.currentTempC).toBeNull();
      expect(cpuThermal.anomalies.some((a) => a.type === 'missing_sensors')).toBe(true);
    });

    it('reports cooling adequate when temp is normal', () => {
      const snapshot = makeSnapshot([makeCPU()]);
      const report = engine.analyze(snapshot);
      const cpuThermal = report.thermalAnalyses.find((t) => t.category === 'cpu')!;

      expect(cpuThermal.coolingAdequate).toBe(true);
    });
  });

  describe('Trend analysis', () => {
    it('returns unknown trend with insufficient data', () => {
      const trendHistory = new HardwareTrendHistory();
      expect(trendHistory.computeTrend('cpu', 'temperatureC')).toBe('unknown');
    });

    it('detects stable trend', () => {
      const trendHistory = new HardwareTrendHistory();
      const baseTime = Date.now();
      for (let i = 0; i < 5; i++) {
        trendHistory.record('cpu', 'temperatureC', { timestamp: baseTime + i * 1000, value: 55 + (Math.random() - 0.5) * 2, unit: '°C', source: 'wmi' });
      }
      expect(trendHistory.computeTrend('cpu', 'temperatureC')).toBe('stable');
    });

    it('detects degrading trend (increasing temperature)', () => {
      const trendHistory = new HardwareTrendHistory();
      const baseTime = Date.now();
      const temps = [50, 53, 56, 59, 62];
      for (let i = 0; i < temps.length; i++) {
        trendHistory.record('cpu', 'temperatureC', { timestamp: baseTime + i * 1000, value: temps[i]!, unit: '°C', source: 'wmi' });
      }
      const trend = trendHistory.computeTrend('cpu', 'temperatureC');
      expect(trend === 'degrading' || trend === 'rapid_degradation').toBe(true);
    });

    it('detects improving trend (decreasing temperature)', () => {
      const trendHistory = new HardwareTrendHistory();
      const baseTime = Date.now();
      const temps = [70, 65, 60, 55, 50];
      for (let i = 0; i < temps.length; i++) {
        trendHistory.record('cpu', 'temperatureC', { timestamp: baseTime + i * 1000, value: temps[i]!, unit: '°C', source: 'wmi' });
      }
      expect(trendHistory.computeTrend('cpu', 'temperatureC')).toBe('improving');
    });

    it('records snapshot data points', () => {
      const trendHistory = new HardwareTrendHistory();
      const snapshot = makeSnapshot();
      trendHistory.recordSnapshot(snapshot);
      expect(trendHistory.getPoints('cpu', 'temperatureC').length).toBe(1);
      expect(trendHistory.getPoints('cpu', 'utilization').length).toBe(1);
    });

    it('produces trend summaries', () => {
      const engine = new HardwareAIEngine();
      const snapshot = makeSnapshot();
      engine.analyze(snapshot);
      engine.analyze(snapshot);
      engine.analyze(snapshot);

      const report = engine.analyze(snapshot);
      expect(report.trendSummaries.length).toBeGreaterThan(0);
    });
  });

  describe('Health scoring', () => {
    it('computes weighted overall score', () => {
      const scoring = new HealthScoringEngine();
      const analyses = [
        { category: 'cpu', healthScore: 80, confidence: 0.9 } as never,
        { category: 'gpu', healthScore: 90, confidence: 0.8 } as never,
        { category: 'ram', healthScore: 70, confidence: 0.85 } as never,
      ];
      const score = scoring.computeOverallScore(analyses);
      expect(score).toBeGreaterThan(70);
      expect(score).toBeLessThan(100);
    });

    it('returns 100 for empty analyses', () => {
      const scoring = new HealthScoringEngine();
      expect(scoring.computeOverallScore([])).toBe(100);
    });

    it('computes overall confidence as average', () => {
      const scoring = new HealthScoringEngine();
      const analyses = [
        { confidence: 0.8 } as never,
        { confidence: 0.6 } as never,
      ];
      expect(scoring.computeOverallConfidence(analyses)).toBeCloseTo(0.7, 1);
    });
  });

  describe('Risk assessment', () => {
    it('assesses overall risk from component analyses', () => {
      const riskEngine = new HardwareRiskAssessmentEngine();
      const analyses = [
        { category: 'cpu', risk: 'severe', urgency: 'immediate', issues: [{ title: 'Critical temp' }], strengths: [] } as never,
        { category: 'gpu', risk: 'none', urgency: 'none', issues: [], strengths: ['Good temp'] } as never,
      ];
      const assessment = riskEngine.assess(analyses);

      expect(assessment.overallRisk).toBe('severe');
      expect(assessment.overallUrgency).toBe('immediate');
    });

    it('includes system risk factors', () => {
      const riskEngine = new HardwareRiskAssessmentEngine();
      const analyses = [
        { category: 'cpu', risk: 'high', urgency: 'soon', issues: [{ title: 'High temp' }], strengths: [] } as never,
      ];
      const assessment = riskEngine.assess(analyses);
      expect(assessment.systemRiskFactors.length).toBeGreaterThan(0);
    });

    it('includes mitigating factors for healthy components', () => {
      const riskEngine = new HardwareRiskAssessmentEngine();
      const analyses = [
        { category: 'cpu', risk: 'none', urgency: 'none', issues: [], strengths: ['Good temp'] } as never,
      ];
      const assessment = riskEngine.assess(analyses);
      expect(assessment.mitigatingFactors.length).toBeGreaterThan(0);
    });
  });

  describe('Insight building', () => {
    it('builds insights with evidence from snapshot', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const cpuInsight = report.insights.find((i) => i.category === 'cpu');
      expect(cpuInsight).toBeDefined();
      expect(cpuInsight!.evidence.length).toBeGreaterThan(0);
      expect(cpuInsight!.evidence[0]!.sensor).toBe('temperatureC');
    });

    it('generates human-readable summary and explanation', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const insight = report.insights.find((i) => i.category === 'cpu')!;
      expect(insight.summary).toBeTruthy();
      expect(insight.explanation).toBeTruthy();
      expect(insight.explanation.length).toBeGreaterThan(50);
    });

    it('includes confidence and severity in insights', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const insight = report.insights.find((i) => i.category === 'cpu')!;
      expect(insight.confidence).toBeGreaterThan(0);
      expect(insight.confidenceLabel).toBeDefined();
      expect(insight.severity).toBe('critical');
    });

    it('includes recommended actions and estimated benefit', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const insight = report.insights.find((i) => i.category === 'cpu')!;
      expect(insight.recommendedActions.length).toBeGreaterThan(0);
      expect(insight.estimatedBenefit).toBeTruthy();
    });

    it('filters out insights below minimum confidence', () => {
      const engine = new HardwareAIEngine({ ...DEFAULT_AI_CONFIG, minConfidence: 0.99 });
      const snapshot = makeSnapshot([makeCPU()]);
      const report = engine.analyze(snapshot);

      // Healthy CPU has no high-confidence issues
      expect(report.insights.filter((i) => i.confidence >= 0.99).length).toBe(report.insights.length);
    });
  });

  describe('Recommendations', () => {
    it('generates recommendations for critical issues', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      expect(report.recommendations.length).toBeGreaterThan(0);
      const rec = report.recommendations[0]!;
      expect(rec.title).toBeTruthy();
      expect(rec.reason).toBeTruthy();
      expect(rec.evidence.length).toBeGreaterThan(0);
      expect(rec.expectedImprovement).toBeTruthy();
    });

    it('marks cleaning recommendations as automatable', () => {
      const snapshot = makeSnapshot([makeStorage({ info: { ...makeStorage().info, freeBytes: mkSensor(50000000000, 'B') } })]);
      const report = engine.analyze(snapshot);

      const spaceRec = report.recommendations.find((r) => r.id.includes('low-space'));
      expect(spaceRec).toBeDefined();
      expect(spaceRec!.canAutomate).toBe(true);
    });

    it('marks hardware maintenance as non-automatable', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const tempRec = report.recommendations.find((r) => r.id.includes('temp'));
      expect(tempRec).toBeDefined();
      expect(tempRec!.canAutomate).toBe(false);
    });

    it('includes estimated time and restart requirement', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const rec = report.recommendations[0]!;
      expect(rec.estimatedTimeMinutes).toBeGreaterThan(0);
      expect(typeof rec.requiresRestart).toBe('boolean');
    });
  });

  describe('Explanation engine', () => {
    let explanation: HardwareExplanationEngine;

    beforeEach(() => {
      explanation = new HardwareExplanationEngine(DEFAULT_AI_CONFIG);
    });

    it('explains high CPU temp with utilization context', () => {
      const cpu = makeCPU();
      const result = explanation.explainHighCPUTemp(cpu, 82, 30);
      expect(result.summary).toContain('higher than expected');
      expect(result.explanation).toContain('82');
      expect(result.explanation).toContain('airflow');
    });

    it('explains memory usage with recovery estimate', () => {
      const ram = makeRAM();
      const result = explanation.explainHighMemoryUsage(ram, 28000, 32768);
      expect(result.summary).toContain('high');
      expect(result.explanation).toContain('2–3 GB');
    });

    it('explains SMART degradation with backup warning', () => {
      const storage = makeStorage();
      const result = explanation.explainSMARTDegradation(storage, 40);
      expect(result.explanation).toContain('back');
      expect(result.explanation).toContain('40');
    });

    it('explains battery wear with lifespan estimate', () => {
      const battery = makeBattery();
      const result = explanation.explainBatteryWear(battery, 25);
      expect(result.explanation).toContain('wear');
      expect(result.explanation).toContain('charge cycles');
    });

    it('generates system summary for healthy system', () => {
      const summary = explanation.explainSystemSummary(95, 9, 0);
      expect(summary).toContain('excellent');
    });

    it('generates system summary for degraded system', () => {
      const summary = explanation.explainSystemSummary(50, 9, 5);
      expect(summary).toContain('attention');
    });
  });

  describe('Unsupported sensors', () => {
    it('handles missing CPU temperature sensor gracefully', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { thermalThrottling: mkSensor(false, 'bool') } })]);
      const report = engine.analyze(snapshot);
      const cpu = report.componentAnalyses.find((a) => a.category === 'cpu')!;

      expect(cpu.issues.some((i) => i.id === 'cpu-temp-missing')).toBe(true);
      expect(cpu.issues.find((i) => i.id === 'cpu-temp-missing')!.severity).toBe('info');
    });

    it('handles missing GPU temperature sensor gracefully', () => {
      const snapshot = makeSnapshot([makeGPU({ sensors: { ...makeGPU().sensors, temperatureC: undefined } })]);
      const report = engine.analyze(snapshot);
      const gpu = report.componentAnalyses.find((a) => a.category === 'gpu')!;

      expect(gpu.issues.some((i) => i.id === 'gpu-temp-missing')).toBe(true);
    });

    it('handles all sensors missing gracefully', () => {
      const snapshot = makeSnapshot([
        makeCPU({ sensors: { thermalThrottling: mkSensor(false, 'bool') } }),
        makeGPU({ sensors: { ...makeGPU().sensors, temperatureC: undefined } }),
      ]);
      const report = engine.analyze(snapshot);

      expect(report.componentAnalyses.length).toBe(2);
      expect(report.overallScore).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('respects maxInsights limit', () => {
      const engine = new HardwareAIEngine({ ...DEFAULT_AI_CONFIG, maxInsights: 2 });
      const snapshot = makeSnapshot([
        makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } }),
        makeGPU({ sensors: { ...makeGPU().sensors, temperatureC: mkSensor(90, '°C') } }),
        makeStorage({ sensors: { ...makeStorage().sensors, healthPercent: mkSensor(15, '%') } }),
      ]);
      const report = engine.analyze(snapshot);
      expect(report.insights.length).toBeLessThanOrEqual(2);
    });

    it('respects maxRecommendations limit', () => {
      const engine = new HardwareAIEngine({ ...DEFAULT_AI_CONFIG, maxRecommendations: 1 });
      const snapshot = makeSnapshot([
        makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } }),
        makeStorage({ sensors: { ...makeStorage().sensors, healthPercent: mkSensor(15, '%') } }),
      ]);
      const report = engine.analyze(snapshot);
      expect(report.recommendations.length).toBeLessThanOrEqual(1);
    });

    it('can disable thermal analysis', () => {
      const engine = new HardwareAIEngine({ ...DEFAULT_AI_CONFIG, enableThermalAnalysis: false });
      const snapshot = makeSnapshot();
      const report = engine.analyze(snapshot);
      expect(report.thermalAnalyses.length).toBe(0);
    });

    it('can disable recommendations', () => {
      const engine = new HardwareAIEngine({ ...DEFAULT_AI_CONFIG, enableRecommendations: false });
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);
      expect(report.recommendations.length).toBe(0);
    });
  });

  describe('Evidence traceability', () => {
    it('every insight has at least one evidence item for non-info severities', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      for (const insight of report.insights) {
        if (insight.severity !== 'info') {
          expect(insight.evidence.length).toBeGreaterThan(0);
        }
      }
    });

    it('evidence includes source, sensor, value, and timestamp', () => {
      const snapshot = makeSnapshot([makeCPU({ sensors: { ...makeCPU().sensors, temperatureC: mkSensor(95, '°C') } })]);
      const report = engine.analyze(snapshot);

      const insight = report.insights.find((i) => i.category === 'cpu')!;
      const evidence = insight.evidence[0]!;
      expect(evidence.source).toBeTruthy();
      expect(evidence.sensor).toBeTruthy();
      expect(evidence.value).toBeTruthy();
      expect(evidence.timestamp).toBeGreaterThan(0);
    });
  });
});
