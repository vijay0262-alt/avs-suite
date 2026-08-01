/**
 * HardwareCapabilities — detects and reports which sensor capabilities
 * are available across all registered providers.
 */

import type { HardwareCapabilities, HardwareComponent } from './types';

export class HardwareCapabilitiesDetector {
  detect(components: HardwareComponent[]): HardwareCapabilities {
    const caps: HardwareCapabilities = {
      cpu: {
        temperature: false,
        powerDraw: false,
        voltage: false,
        perCoreUtilization: false,
        frequency: false,
        thermalThrottling: false,
      },
      gpu: {
        utilization: false,
        temperature: false,
        fanSpeed: false,
        powerDraw: false,
        encoderDecoder: false,
      },
      storage: {
        temperature: false,
        smart: false,
        lifetimeRemaining: false,
        readWriteSpeed: false,
      },
      network: {
        signalStrength: false,
        usage: false,
      },
      battery: {
        wearLevel: false,
        chargeCycles: false,
        estimatedRuntime: false,
      },
      cooling: {
        fanRPM: false,
      },
    };

    for (const component of components) {
      if (component.category === 'cpu') {
        const s = component.sensors;
        caps.cpu.temperature = s.temperatureC !== undefined;
        caps.cpu.powerDraw = s.powerDrawW !== undefined;
        caps.cpu.voltage = s.voltageV !== undefined;
        caps.cpu.perCoreUtilization =
          component.info.perCoreUtilization !== undefined &&
          component.info.perCoreUtilization.length > 0;
        caps.cpu.frequency = component.info.currentFrequencyMHz !== undefined;
        caps.cpu.thermalThrottling = true;
      }

      if (component.category === 'gpu') {
        const s = component.sensors;
        caps.gpu.utilization = s.gpuUtilization !== undefined;
        caps.gpu.temperature = s.temperatureC !== undefined;
        caps.gpu.fanSpeed = s.fanSpeedRPM !== undefined;
        caps.gpu.powerDraw = s.powerDrawW !== undefined;
        caps.gpu.encoderDecoder = s.encoderUsage !== undefined || s.decoderUsage !== undefined;
      }

      if (component.category === 'storage') {
        const s = component.sensors;
        caps.storage.temperature = s.temperatureC !== undefined;
        caps.storage.smart = component.info.smartSupported;
        caps.storage.lifetimeRemaining = s.lifetimeRemainingPercent !== undefined;
        caps.storage.readWriteSpeed = s.readSpeedMBps !== undefined || s.writeSpeedMBps !== undefined;
      }

      if (component.category === 'network') {
        caps.network.signalStrength = component.info.signalStrengthPercent !== undefined;
        caps.network.usage = component.sensors.usagePercent !== undefined;
      }

      if (component.category === 'battery') {
        caps.battery.wearLevel = component.info.wearLevelPercent !== undefined;
        caps.battery.chargeCycles = component.info.chargeCycles !== undefined;
        caps.battery.estimatedRuntime = component.info.estimatedRuntimeMinutes !== undefined;
      }

      if (component.category === 'cooling') {
        caps.cooling.fanRPM = component.info.fans.some((f) => f.rpm !== undefined);
      }
    }

    return caps;
  }
}
