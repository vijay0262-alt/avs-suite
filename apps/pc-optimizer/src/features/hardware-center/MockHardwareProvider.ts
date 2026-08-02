/**
 * MockHardwareProvider — generates realistic, varying hardware data
 * for development and non-Electron environments.
 *
 * Sensor values fluctuate slightly on each scan/poll to simulate
 * real-time monitoring. Component identities (model, vendor, etc.)
 * remain constant.
 */
import type {
  HardwareComponent,
  HardwareProvider,
  ProviderSource,
} from './types';
import { mkSensor } from './types';

function jitter(base: number, range: number): number {
  return base + (Math.random() - 0.5) * range;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createMockHardwareProvider(): HardwareProvider {
  return {
    id: 'mock-wmi',
    source: 'wmi' as ProviderSource,
    categories: ['cpu', 'gpu', 'ram', 'storage', 'network', 'battery', 'cooling', 'operating_system', 'motherboard'],
    async initialize() {},
    dispose() {},
    async scan(): Promise<HardwareComponent[]> {
      return generateMockComponents();
    },
    async poll(): Promise<HardwareComponent[]> {
      return generateMockComponents();
    },
    isAvailable() { return true; },
    getHealth() {
      return { state: 'healthy' as const, consecutiveFailures: 0, consecutiveSuccesses: 1 };
    },
  };
}

function generateMockComponents(): HardwareComponent[] {
  const cpuUtil = clamp(jitter(35, 20), 5, 95);
  const cpuTemp = clamp(jitter(52, 8), 35, 85);
  const gpuUtil = clamp(jitter(25, 15), 5, 80);
  const gpuTemp = clamp(jitter(55, 7), 40, 80);
  const ramUsed = clamp(jitter(16384, 2048), 4096, 28672);
  const netDown = clamp(jitter(45, 30), 1, 100);
  const netUp = clamp(jitter(10, 8), 0.5, 40);

  return [
    {
      category: 'cpu',
      info: {
        vendor: 'Intel',
        model: 'Core i7-12700K',
        architecture: 'x86_64',
        generation: '12th',
        socket: 'LGA1700',
        logicalCores: 20,
        physicalCores: 12,
        threads: 20,
        baseFrequencyMHz: 3600,
        boostFrequencyMHz: 5000,
        currentFrequencyMHz: mkSensor(Math.round(jitter(4200, 200)), 'MHz'),
        perCoreUtilization: Array.from({ length: 12 }, () =>
          mkSensor(Math.round(clamp(cpuUtil + jitter(0, 15), 5, 95)), '%'),
        ),
        packageUtilization: mkSensor(Math.round(cpuUtil), '%'),
        cacheSizes: { l1KB: 480, l2KB: 2048, l3KB: 25600 },
        instructionSets: ['AVX', 'AVX2', 'AVX-512'],
        virtualization: { supported: true, enabled: true },
      },
      sensors: {
        temperatureC: mkSensor(Math.round(cpuTemp), '°C'),
        powerDrawW: mkSensor(Math.round(jitter(65, 15)), 'W'),
        voltageV: mkSensor(Number(jitter(1.2, 0.05).toFixed(2)), 'V'),
        thermalThrottling: mkSensor(false, 'bool'),
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'gpu',
      info: {
        vendor: 'NVIDIA',
        model: 'GeForce RTX 3070',
        driver: '536.40',
        driverDate: '2024-01-15',
        vramMB: 8192,
        dedicatedMemoryMB: mkSensor(8192, 'MB'),
        sharedMemoryMB: mkSensor(0, 'MB'),
        pcieGeneration: '4.0',
        pcieLaneWidth: 'x16',
      },
      sensors: {
        gpuUtilization: mkSensor(Math.round(gpuUtil), '%'),
        memoryUtilization: mkSensor(Math.round(jitter(28, 10)), '%'),
        temperatureC: mkSensor(Math.round(gpuTemp), '°C'),
        fanSpeedRPM: mkSensor(Math.round(jitter(1800, 200)), 'RPM'),
        coreClockMHz: mkSensor(Math.round(jitter(1500, 100)), 'MHz'),
        memoryClockMHz: mkSensor(Math.round(jitter(6750, 50)), 'MHz'),
        powerDrawW: mkSensor(Math.round(jitter(120, 20)), 'W'),
        encoderUsage: mkSensor(0, '%'),
        decoderUsage: mkSensor(0, '%'),
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'ram',
      info: {
        installedMB: 32768,
        availableMB: mkSensor(32768 - Math.round(ramUsed), 'MB'),
        usedMB: mkSensor(Math.round(ramUsed), 'MB'),
        cachedMB: mkSensor(2048, 'MB'),
        memoryPressure: mkSensor(Math.round((ramUsed / 32768) * 100), '%'),
        speedMTs: 3200,
        channels: 2,
        slotsUsed: 2,
        slotsTotal: 4,
        ecc: false,
        modules: [
          { manufacturer: 'Corsair', partNumber: 'CMK32GX4M2B3200C16', sizeMB: 16384, speedMTs: 3200, formFactor: 'DIMM' },
          { manufacturer: 'Corsair', partNumber: 'CMK32GX4M2B3200C16', sizeMB: 16384, speedMTs: 3200, formFactor: 'DIMM' },
        ],
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'storage',
      info: {
        type: 'ssd',
        model: 'Samsung 980 PRO',
        serial: 'S5GZNX0R123456',
        firmware: '5B2QGXA7',
        capacityBytes: 1024000000000,
        usedBytes: mkSensor(400000000000 + Math.round(jitter(0, 500000000)), 'B'),
        freeBytes: mkSensor(624000000000 - Math.round(jitter(0, 500000000)), 'B'),
        filesystem: 'NTFS',
        interface: 'NVMe',
        smartSupported: true,
      },
      sensors: {
        temperatureC: mkSensor(Math.round(jitter(42, 3)), '°C'),
        healthPercent: mkSensor(95, '%'),
        lifetimeRemainingPercent: mkSensor(92, '%'),
        readSpeedMBps: mkSensor(Math.round(jitter(6800, 200)), 'MB/s'),
        writeSpeedMBps: mkSensor(Math.round(jitter(5100, 200)), 'MB/s'),
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'network',
      info: {
        adapter: 'Intel Wi-Fi 6 AX201',
        mac: 'AA:BB:CC:DD:EE:FF',
        ipv4: ['192.168.1.100'],
        ipv6: ['fe80::1234:5678:9abc:def0'],
        linkSpeedMbps: 866,
        type: 'wifi',
        signalStrengthPercent: mkSensor(Math.round(jitter(75, 5)), '%'),
      },
      sensors: {
        usagePercent: mkSensor(Math.round(jitter(12, 5)), '%'),
        downloadMbps: mkSensor(Number(netDown.toFixed(1)), 'Mbps'),
        uploadMbps: mkSensor(Number(netUp.toFixed(1)), 'Mbps'),
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'battery',
      info: {
        designCapacityWH: 60,
        fullChargeCapacityWH: 55,
        chargeCycles: 120,
        currentChargePercent: mkSensor(Math.round(clamp(jitter(85, 1), 20, 100)), '%'),
        wearLevelPercent: mkSensor(8, '%'),
        chargingStatus: mkSensor('discharging' as const, 'status'),
        estimatedRuntimeMinutes: mkSensor(Math.round(jitter(240, 20)), 'min'),
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'cooling',
      info: {
        fans: [
          { name: 'CPU Fan', type: 'cpu_fan', rpm: mkSensor(Math.round(jitter(1800, 150)), 'RPM') },
          { name: 'Case Fan 1', type: 'case_fan', rpm: mkSensor(Math.round(jitter(1200, 100)), 'RPM') },
          { name: 'Case Fan 2', type: 'case_fan', rpm: mkSensor(Math.round(jitter(1100, 100)), 'RPM') },
        ],
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'motherboard',
      info: {
        manufacturer: 'ASUS',
        model: 'PRIME Z690-A',
        version: 'Rev 1.02',
        biosVendor: 'American Megatrends',
        biosVersion: '1801',
        biosDate: '2024-01-10',
        chipset: 'Intel Z690',
      },
      sensorStatus: { availability: 'available' },
    },
    {
      category: 'operating_system',
      info: {
        name: 'Windows 11',
        version: '23H2',
        build: '22631.3447',
        architecture: 'x86_64',
        installDate: '2023-06-15',
        lastBootTime: '2024-08-01T08:00:00Z',
        uptimeSeconds: mkSensor(Math.round((Date.now() - new Date('2024-08-01T08:00:00Z').getTime()) / 1000), 's'),
      },
      sensorStatus: { availability: 'available' },
    },
  ];
}
