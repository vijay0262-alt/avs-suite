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
        caps.cpu.temperature = s.temperatureC?.supported ?? false;
        caps.cpu.powerDraw = s.powerDrawW?.supported ?? false;
        caps.cpu.voltage = s.voltageV?.supported ?? false;
        caps.cpu.perCoreUtilization =
          component.info.perCoreUtilization !== undefined &&
          component.info.perCoreUtilization.length > 0;
        caps.cpu.frequency = component.info.currentFrequencyMHz?.supported ?? false;
        caps.cpu.thermalThrottling = s.thermalThrottling?.supported ?? false;
      }

      if (component.category === 'gpu') {
        const s = component.sensors;
        caps.gpu.utilization = s.gpuUtilization?.supported ?? false;
        caps.gpu.temperature = s.temperatureC?.supported ?? false;
        caps.gpu.fanSpeed = s.fanSpeedRPM?.supported ?? false;
        caps.gpu.powerDraw = s.powerDrawW?.supported ?? false;
        caps.gpu.encoderDecoder = (s.encoderUsage?.supported ?? false) || (s.decoderUsage?.supported ?? false);
      }

      if (component.category === 'storage') {
        const s = component.sensors;
        caps.storage.temperature = s.temperatureC?.supported ?? false;
        caps.storage.smart = component.info.smartSupported;
        caps.storage.lifetimeRemaining = s.lifetimeRemainingPercent?.supported ?? false;
        caps.storage.readWriteSpeed = (s.readSpeedMBps?.supported ?? false) || (s.writeSpeedMBps?.supported ?? false);
      }

      if (component.category === 'network') {
        caps.network.signalStrength = component.info.signalStrengthPercent?.supported ?? false;
        caps.network.usage = component.sensors.usagePercent?.supported ?? false;
      }

      if (component.category === 'battery') {
        caps.battery.wearLevel = component.info.wearLevelPercent?.supported ?? false;
        caps.battery.chargeCycles = component.info.chargeCycles !== undefined;
        caps.battery.estimatedRuntime = component.info.estimatedRuntimeMinutes?.supported ?? false;
      }

      if (component.category === 'cooling') {
        caps.cooling.fanRPM = component.info.fans.some((f) => f.rpm?.supported ?? false);
      }
    }

    return caps;
  }
}
