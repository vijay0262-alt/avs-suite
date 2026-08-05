/**
 * hardwareAdapter — converts Hardware Center's HardwareSnapshot
 * into the dashboard's HardwareSensors format.
 *
 * This bridges the two data models so the dashboard can display
 * the same rich hardware data that the Hardware Center shows.
 */
import type { HardwareSnapshot, HardwareComponent, CPUComponent, GPUComponent, CoolingComponent, BatteryComponent, StorageComponent } from '../hardware-center/types';
import type { HardwareSensors, HardwareSensorReading, HardwareClockReading } from './dashboard.types';

export function hardwareSnapshotToSensors(snapshot: HardwareSnapshot): HardwareSensors {
  const components = snapshot.components;
  const cpu = components.find((c) => c.category === 'cpu') as CPUComponent | undefined;
  const gpu = components.find((c) => c.category === 'gpu') as GPUComponent | undefined;
  const cooling = components.find((c) => c.category === 'cooling') as CoolingComponent | undefined;
  const battery = components.find((c) => c.category === 'battery') as BatteryComponent | undefined;
  const storage = components.find((c) => c.category === 'storage') as StorageComponent | undefined;

  // Temperatures
  const tempSensors: HardwareSensorReading[] = [];
  if (cpu?.sensors?.temperatureC?.supported) {
    tempSensors.push({
      name: 'CPU Package',
      value: cpu.sensors.temperatureC.value,
      high: null,
      critical: null,
      unit: 'celsius',
      source: 'hardware-center',
      supported: true,
    });
  }
  if (gpu?.sensors?.temperatureC?.supported) {
    tempSensors.push({
      name: 'GPU',
      value: gpu.sensors.temperatureC.value,
      high: null,
      critical: null,
      unit: 'celsius',
      source: 'hardware-center',
      supported: true,
    });
  }
  if (storage?.sensors?.temperatureC?.supported) {
    tempSensors.push({
      name: 'SSD',
      value: storage.sensors.temperatureC.value,
      high: null,
      critical: null,
      unit: 'celsius',
      source: 'hardware-center',
      supported: true,
    });
  }

  // Fans
  const fanSensors: HardwareSensorReading[] = [];
  if (cooling?.info?.fans) {
    for (const fan of cooling.info.fans) {
      if (fan.rpm?.supported) {
        fanSensors.push({
          name: fan.name,
          value: fan.rpm.value,
          high: null,
          critical: null,
          unit: 'rpm',
          source: 'hardware-center',
          supported: true,
        });
      }
    }
  }
  if (gpu?.sensors?.fanSpeedRPM?.supported) {
    fanSensors.push({
      name: 'GPU Fan',
      value: gpu.sensors.fanSpeedRPM.value,
      high: null,
      critical: null,
      unit: 'rpm',
      source: 'hardware-center',
      supported: true,
    });
  }

  // Clocks
  const clockReadings: HardwareClockReading[] = [];
  if (cpu?.info?.currentFrequencyMHz?.supported) {
    clockReadings.push({
      name: 'CPU',
      current: cpu.info.currentFrequencyMHz.value,
      min: cpu.info.baseFrequencyMHz ?? null,
      max: cpu.info.boostFrequencyMHz ?? null,
      unit: 'mhz',
      source: 'hardware-center',
      supported: true,
    });
  }
  if (gpu?.sensors?.coreClockMHz?.supported) {
    clockReadings.push({
      name: 'GPU Core',
      current: gpu.sensors.coreClockMHz.value,
      min: null,
      max: null,
      unit: 'mhz',
      source: 'hardware-center',
      supported: true,
    });
  }

  // Battery
  const batterySupported = battery?.info?.currentChargePercent?.supported ?? false;

  return {
    temperature: {
      sensors: tempSensors,
      supported: tempSensors.length > 0,
      source: tempSensors.length > 0 ? 'hardware-center' : null,
      message: tempSensors.length === 0
        ? 'Temperature sensors are not available. Install LibreHardwareMonitor for detailed sensor data.'
        : undefined,
    },
    fans: {
      sensors: fanSensors,
      supported: fanSensors.length > 0,
      source: fanSensors.length > 0 ? 'hardware-center' : null,
      message: fanSensors.length === 0
        ? 'Fan speed sensors are not available.'
        : undefined,
    },
    clocks: {
      clocks: clockReadings,
      supported: clockReadings.length > 0,
    },
    battery: {
      present: batterySupported,
      percent: battery?.info?.currentChargePercent?.value ?? null,
      powerPlugged: battery?.info?.chargingStatus?.value === 'charging' ? true : battery?.info?.chargingStatus?.value === 'discharging' ? false : null,
      secsLeft: battery?.info?.estimatedRuntimeMinutes?.value ? battery.info.estimatedRuntimeMinutes.value * 60 : null,
      supported: batterySupported,
      message: batterySupported ? undefined : 'No battery detected on this system.',
    },
    power: {
      supported: false,
      source: null,
      message: 'Power usage monitoring is not available on this system.',
    },
  };
}

export function getCpuTempFromSnapshot(snapshot: HardwareSnapshot): number | null {
  const cpu = snapshot.components.find((c) => c.category === 'cpu') as CPUComponent | undefined;
  if (cpu?.sensors?.temperatureC?.supported) {
    return cpu.sensors.temperatureC.value;
  }
  return null;
}
