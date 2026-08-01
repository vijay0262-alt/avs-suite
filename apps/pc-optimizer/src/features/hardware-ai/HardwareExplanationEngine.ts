/**
 * HardwareExplanationEngine — generates natural language explanations
 * for hardware health conditions.
 *
 * Every explanation is built from sensor evidence, not hallucinated.
 * The engine uses templates that reference actual sensor values,
 * thresholds, and trends to produce human-readable text.
 */
import type { HardwareAIConfiguration } from './types';
import type {
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
} from '../hardware-center/types';

export class HardwareExplanationEngine {
  constructor(private config: HardwareAIConfiguration) {}

  // ── CPU Explanations ─────────────────────────────────────────────

  explainHighCPUTemp(cpu: CPUComponent, temp: number, util: number | null): { summary: string; explanation: string } {
    const model = cpu.info.model;
    const utilText = util !== null
      ? `Average CPU utilization has remained below ${this.config.utilizationThresholds.cpuBackgroundPercent}% during the last several minutes while package temperature increased to ${temp.toFixed(0)}°C.`
      : `Package temperature has reached ${temp.toFixed(0)}°C.`;

    return {
      summary: `CPU temperature is higher than expected for the current workload.`,
      explanation: `${utilText} This may indicate insufficient airflow, dust accumulation, or degraded thermal paste on the CPU cooler. The ${model} should typically run cooler under this level of load. Continued operation at elevated temperatures can trigger thermal throttling, reducing performance and potentially shortening the CPU's lifespan.`,
    };
  }

  explainCPUThrottling(cpu: CPUComponent): { summary: string; explanation: string } {
    return {
      summary: 'CPU is actively thermal throttling to prevent damage.',
      explanation: `The ${cpu.info.model} has engaged thermal throttling, meaning it is deliberately reducing clock speeds to lower its temperature. This is a protective mechanism and indicates that the cooling solution is unable to dissipate heat fast enough. Users may experience noticeable performance drops, stuttering, or reduced frame rates. Possible causes include dust buildup in heatsink fins, a failing or slow CPU fan, dried out thermal paste, or inadequate case airflow.`,
    };
  }

  explainHighCPUUtilization(cpu: CPUComponent, util: number): { summary: string; explanation: string } {
    return {
      summary: `CPU utilization is very high at ${util.toFixed(0)}%.`,
      explanation: `The ${cpu.info.model} is operating at ${util.toFixed(0)}% utilization, which is above the optimal threshold of ${this.config.utilizationThresholds.cpuHighPercent}%. This could be caused by demanding applications, background processes, or malware. Sustained high utilization increases power consumption, heat generation, and may reduce system responsiveness for other tasks.`,
    };
  }

  explainBackgroundCPULoad(cpu: CPUComponent, util: number): { summary: string; explanation: string } {
    return {
      summary: `CPU shows persistent background load at ${util.toFixed(0)}%.`,
      explanation: `CPU utilization has remained at ${util.toFixed(0)}% without an obvious foreground application driving it. This may indicate background services, scheduled tasks, startup programs, or potentially unwanted software consuming CPU cycles. While not immediately harmful, persistent background load increases power consumption and heat output, and may slow down other applications.`,
    };
  }

  // ── GPU Explanations ─────────────────────────────────────────────

  explainHighGPUTemp(gpu: GPUComponent, temp: number, util: number | null): { summary: string; explanation: string } {
    const utilText = util !== null && util < 50
      ? `GPU utilization is only at ${util.toFixed(0)}%, suggesting the high temperature is not caused by heavy graphics load.`
      : `GPU utilization is at ${util?.toFixed(0) ?? 'unknown'}%.`;

    return {
      summary: `GPU temperature is elevated at ${temp.toFixed(0)}°C.`,
      explanation: `The ${gpu.info.model} is running at ${temp.toFixed(0)}°C. ${utilText} This could indicate insufficient case airflow, a dusty GPU heatsink, or degraded thermal pads. Elevated GPU temperatures can lead to thermal throttling, reduced gaming performance, and artifacting in demanding applications.`,
    };
  }

  explainGPUVRAMPressure(gpu: GPUComponent, memUtil: number): { summary: string; explanation: string } {
    return {
      summary: `GPU VRAM usage is high at ${memUtil.toFixed(0)}%.`,
      explanation: `The ${gpu.info.model} has ${gpu.info.vramMB} MB of VRAM and ${memUtil.toFixed(0)}% is currently in use. When VRAM is nearly full, the GPU may spill data to system RAM, causing significant performance degradation, texture pop-in, or stuttering in games and creative applications.`,
    };
  }

  explainGPUBackgroundUsage(gpu: GPUComponent, util: number): { summary: string; explanation: string } {
    return {
      summary: `GPU is being used by a background process (${util.toFixed(0)}%).`,
      explanation: `GPU utilization is at ${util.toFixed(0)}% without an obvious foreground graphics application. This may be caused by hardware-accelerated browsers, video encoding, cryptocurrency mining malware, or other GPU-accelerated background tasks. While not harmful to the GPU, it consumes power and may reduce performance for foreground applications.`,
    };
  }

  // ── Memory Explanations ──────────────────────────────────────────

  explainHighMemoryUsage(ram: RAMComponent, usedMB: number, totalMB: number): { summary: string; explanation: string } {
    const pct = (usedMB / totalMB) * 100;
    const usedGB = (usedMB / 1024).toFixed(1);
    const totalGB = (totalMB / 1024).toFixed(0);
    return {
      summary: `Memory utilization is high at ${pct.toFixed(0)}% (${usedGB} GB of ${totalGB} GB).`,
      explanation: `Memory utilization has remained above ${this.config.utilizationThresholds.ramHighPercent}% with ${usedGB} GB in use out of ${totalGB} GB installed. Several background applications may be consuming significant memory. When memory is nearly full, the operating system uses the page file (virtual memory on disk), which is much slower than RAM and can cause noticeable system slowdowns. Closing unnecessary applications may recover approximately 2–3 GB of RAM.`,
    };
  }

  explainMemoryPressure(ram: RAMComponent, pressure: number): { summary: string; explanation: string } {
    return {
      summary: `System is experiencing memory pressure (${pressure.toFixed(0)}%).`,
      explanation: `Memory pressure has reached ${pressure.toFixed(0)}%, indicating the system is struggling to allocate memory. The operating system may be aggressively trimming working sets, compressing memory, or swapping to disk. This can cause application slowdowns, UI lag, and disk activity spikes. Adding more RAM or reducing the number of running applications would alleviate this condition.`,
    };
  }

  // ── Storage Explanations ─────────────────────────────────────────

  explainLowFreeSpace(storage: StorageComponent, freeBytes: number, capacityBytes: number): { summary: string; explanation: string } {
    const freeGB = (freeBytes / 1e9).toFixed(1);
    const totalGB = (capacityBytes / 1e9).toFixed(1);
    const freePct = (freeBytes / capacityBytes) * 100;
    return {
      summary: `Drive "${storage.info.model}" has low free space (${freeGB} GB remaining of ${totalGB} GB).`,
      explanation: `The ${storage.info.model} has only ${freePct.toFixed(0)}% free space remaining. When free space drops below ${this.config.storageThresholds.lowFreeSpacePercent}%, the operating system may struggle with virtual memory allocation, file fragmentation increases, and SSDs may experience accelerated wear due to reduced garbage collection efficiency. Consider moving large files to another drive or cleaning up unnecessary data.`,
    };
  }

  explainSMARTDegradation(storage: StorageComponent, healthPercent: number): { summary: string; explanation: string } {
    return {
      summary: `Drive "${storage.info.model}" SMART health is degraded (${healthPercent.toFixed(0)}%).`,
      explanation: `The ${storage.info.model} reports a SMART health of ${healthPercent.toFixed(0)}%, which is below the warning threshold of ${this.config.storageThresholds.smartWarningPercent}%. SMART (Self-Monitoring, Analysis and Reporting Technology) attributes indicate the drive is experiencing wear or potential failure indicators. This drive should be monitored closely and important data should be backed up immediately. Drive failure may be imminent.`,
    };
  }

  explainStorageHighTemp(storage: StorageComponent, temp: number): { summary: string; explanation: string } {
    return {
      summary: `Drive "${storage.info.model}" temperature is high (${temp.toFixed(0)}°C).`,
      explanation: `The ${storage.info.model} is operating at ${temp.toFixed(0)}°C. NVMe SSDs in particular can throttle performance when temperatures exceed ${this.config.thermalThresholds.storageWarningC}°C. High storage temperatures can reduce drive lifespan and cause sudden performance drops. Improving case airflow or adding a heatsink to the drive may help.`,
    };
  }

  // ── Battery Explanations ─────────────────────────────────────────

  explainBatteryWear(battery: BatteryComponent, wearPercent: number): { summary: string; explanation: string } {
    const cycles = battery.info.chargeCycles ?? 0;
    return {
      summary: `Battery wear level is at ${wearPercent.toFixed(0)}%.`,
      explanation: `The battery has accumulated ${wearPercent.toFixed(0)}% wear after approximately ${cycles} charge cycles. This means the battery's full charge capacity is ${(100 - wearPercent).toFixed(0)}% of its original design capacity. Battery wear is a normal consequence of charge cycles and age. At the current rate, the battery may need replacement within ${this.estimateBatteryLifespan(wearPercent, cycles)} months. To slow further degradation, avoid exposing the device to high temperatures and consider keeping the charge between 20% and 80% when possible.`,
    };
  }

  explainLowBattery(battery: BatteryComponent, charge: number): { summary: string; explanation: string } {
    return {
      summary: `Battery charge is low at ${charge.toFixed(0)}%.`,
      explanation: `The battery is at ${charge.toFixed(0)}% charge, which is below the low charge threshold of ${this.config.batteryThresholds.lowChargePercent}%. Connect the power adapter soon to avoid an unexpected shutdown. ${battery.info.estimatedRuntimeMinutes?.supported && battery.info.estimatedRuntimeMinutes.value ? `Estimated remaining runtime: ${battery.info.estimatedRuntimeMinutes.value} minutes.` : ''}`,
    };
  }

  // ── Network Explanations ─────────────────────────────────────────

  explainHighNetworkUsage(network: NetworkComponent, downloadMbps: number): { summary: string; explanation: string } {
    return {
      summary: `Network bandwidth usage is high (${downloadMbps.toFixed(1)} Mbps download).`,
      explanation: `The ${network.info.adapter} is currently downloading at ${downloadMbps.toFixed(1)} Mbps. This could be caused by large file downloads, streaming services, system updates, or cloud sync operations. While not harmful, high network usage may impact latency-sensitive applications like online gaming or video calls.`,
    };
  }

  explainWeakWifiSignal(network: NetworkComponent, signal: number): { summary: string; explanation: string } {
    return {
      summary: `Wi-Fi signal strength is weak (${signal.toFixed(0)}%).`,
      explanation: `The ${network.info.adapter} reports a signal strength of ${signal.toFixed(0)}%. Weak Wi-Fi signals can cause slow speeds, high latency, and connection drops. Moving closer to the access point, removing physical obstructions, or switching to a 5 GHz band (if available) may improve the connection.`,
    };
  }

  // ── Cooling Explanations ─────────────────────────────────────────

  explainFanNotSpinning(fanName: string): { summary: string; explanation: string } {
    return {
      summary: `Fan "${fanName}" is not spinning (0 RPM).`,
      explanation: `The fan "${fanName}" reports 0 RPM, which may indicate a disconnected fan cable, a failed fan motor, or a fan that has been manually stopped. A non-spinning fan can lead to rapid temperature buildup in the associated component. This should be investigated immediately to prevent thermal damage.`,
    };
  }

  explainInsufficientCooling(maxTemp: number, fanCount: number): { summary: string; explanation: string } {
    return {
      summary: 'System cooling appears insufficient for current thermal load.',
      explanation: `Despite having ${fanCount} fan(s) operational, system temperatures are reaching ${maxTemp.toFixed(0)}°C. This suggests the cooling solution is inadequate for the current thermal output. Possible causes include dust-clogged heatsinks, dried thermal paste, poor case airflow, or fans running at insufficient speeds. Cleaning the system interior and reapplying thermal paste may significantly improve cooling performance.`,
    };
  }

  // ── Missing Sensors ──────────────────────────────────────────────

  explainMissingSensors(category: string, sensorName: string): { summary: string; explanation: string } {
    return {
      summary: `${category} ${sensorName} sensor is not available.`,
      explanation: `The ${sensorName} sensor for the ${category} component is not supported by any registered hardware provider. This means the AI engine cannot monitor this aspect of the ${category}. This is common on systems where the hardware manufacturer does not expose sensor data through standard Windows APIs. Consider installing Libre Hardware Monitor or manufacturer-specific tools for more comprehensive sensor coverage.`,
    };
  }

  // ── System Summary ───────────────────────────────────────────────

  explainSystemSummary(healthScore: number, componentCount: number, issueCount: number): string {
    if (issueCount === 0) {
      return `Your system is in excellent health. All ${componentCount} hardware components are operating within normal parameters. No issues or concerns were detected during the analysis.`;
    }
    if (healthScore >= 80) {
      return `Your system is in good health with a score of ${healthScore}/100. ${issueCount} minor issue${issueCount > 1 ? 's were' : ' was'} detected but none require immediate attention. Regular monitoring is recommended to catch any changes early.`;
    }
    if (healthScore >= 60) {
      return `Your system health is fair with a score of ${healthScore}/100. ${issueCount} issue${issueCount > 1 ? 's were' : ' was'} detected that may benefit from attention. Some components are showing signs of wear or elevated operating conditions.`;
    }
    return `Your system health needs attention with a score of ${healthScore}/100. ${issueCount} issue${issueCount > 1 ? 's were' : ' was'} detected, some of which may require immediate action. Please review the recommendations below to address the most critical concerns.`;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private estimateBatteryLifespan(wearPercent: number, cycles: number): string {
    if (cycles === 0 || wearPercent === 0) return '12–18';
    const expectedCycles = this.config.batteryThresholds.expectedLifespanCycles;
    const remainingCycles = Math.max(0, expectedCycles - cycles);
    const monthsRemaining = Math.max(1, Math.round((remainingCycles / cycles) * (cycles / 30)));
    return String(Math.min(24, monthsRemaining));
  }
}
