/**
 * Device Profile Widget Provider — extracts device profile data.
 *
 * Displays: Primary profile, Secondary profiles, Hardware tier,
 * Usage summary, Confidence, Recent changes.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type { DeviceProfileData, CoreWidgetDataBundle } from './types';

export class DeviceProfileProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<DeviceProfileData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const profile = bundle?.deviceProfile;

    if (!profile) {
      return this._emptyData();
    }

    const secondaryProfiles = profile.secondaryProfiles.map((sp) => ({
      profile: sp.profileType,
      score: sp.score,
    }));

    const recentChanges = profile.changeHistory.slice(0, 5).map((c) => c.description);

    const usageText = `${profile.workloadSummary.primaryWorkload} workload, ${profile.usageSummary.optimizationFrequency} optimization`;

    return {
      deviceName: profile.deviceName,
      platform: profile.platform,
      primaryProfile: profile.primaryProfile,
      secondaryProfiles,
      hardwareTier: profile.hardwareSummary.performanceTier,
      usageSummary: usageText,
      confidenceScore: profile.confidenceScore,
      recentChanges,
      cpuModel: profile.hardwareSummary.cpuModel,
      cpuCores: profile.hardwareSummary.cpuCores,
      totalMemoryMB: profile.hardwareSummary.totalMemoryMB,
      gpuModel: profile.hardwareSummary.gpuModel,
      storageType: profile.hardwareSummary.storageType,
      storageCapacityMB: profile.hardwareSummary.storageCapacityMB,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<DeviceProfileData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }

  private _emptyData(): DeviceProfileData {
    return {
      deviceName: 'Unknown',
      platform: 'Unknown',
      primaryProfile: 'unknown',
      secondaryProfiles: [],
      hardwareTier: 'unknown',
      usageSummary: 'No profile data available',
      confidenceScore: 0,
      recentChanges: [],
      cpuModel: 'Unknown',
      cpuCores: 0,
      totalMemoryMB: 0,
      gpuModel: null,
      storageType: 'Unknown',
      storageCapacityMB: 0,
    };
  }
}
