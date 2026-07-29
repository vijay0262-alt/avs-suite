/**
 * Optimization Profile Resolver — resolves device profile for planning.
 *
 * Extracts a DeviceProfileSnapshot from the full DeviceProfile,
 * determines profile-specific planning adjustments.
 */
import type {
  DeviceProfile,
  DeviceProfileSnapshot,
  DeviceProfileType,
  PerformanceTier,
  WorkloadType,
  OptimizationGoal,
  PlanningContext,
} from './types';

export class OptimizationProfileResolver {
  resolve(profile: DeviceProfile | null): DeviceProfileSnapshot {
    if (!profile) {
      return {
        profileType: 'general_purpose' as DeviceProfileType,
        performanceTier: 'unknown' as PerformanceTier,
        primaryWorkload: 'unknown' as WorkloadType,
        deviceName: 'Unknown',
        confidenceScore: 0,
      };
    }

    return {
      profileType: profile.primaryProfile,
      performanceTier: profile.hardwareSummary.performanceTier,
      primaryWorkload: profile.workloadSummary.primaryWorkload,
      deviceName: profile.deviceName,
      confidenceScore: profile.confidenceScore,
    };
  }

  getProfileAdjustments(
    profileType: DeviceProfileType,
    goal: OptimizationGoal,
  ): ProfileAdjustments {
    const adjustments: ProfileAdjustments = {
      priorityBoost: [],
      priorityPenalty: [],
      riskAdjustment: 0,
      confidenceAdjustment: 0,
    };

    switch (profileType) {
      case 'gaming_pc':
        if (goal === 'gaming_preparation' || goal === 'maximum_performance') {
          adjustments.priorityBoost = ['performance', 'startup'];
          adjustments.confidenceAdjustment = 0.1;
        }
        break;
      case 'creative_workstation':
        if (goal === 'creator_workflow') {
          adjustments.priorityBoost = ['performance', 'storage'];
          adjustments.confidenceAdjustment = 0.1;
        }
        break;
      case 'business_laptop':
      case 'office_workstation':
        if (goal === 'business_productivity') {
          adjustments.priorityBoost = ['maintenance', 'security'];
          adjustments.confidenceAdjustment = 0.05;
        }
        break;
      case 'developer_workstation':
        adjustments.priorityBoost = ['performance'];
        adjustments.riskAdjustment = -0.1;
        break;
      case 'home_pc':
      case 'general_purpose':
        adjustments.riskAdjustment = 0.1;
        break;
      default:
        break;
    }

    return adjustments;
  }

  isLowEndDevice(profile: DeviceProfileSnapshot): boolean {
    return profile.performanceTier === 'low_end';
  }

  isHighEndDevice(profile: DeviceProfileSnapshot): boolean {
    return profile.performanceTier === 'high_end' || profile.performanceTier === 'enterprise';
  }

  hasBattery(profile: DeviceProfileSnapshot, context: PlanningContext): boolean {
    if (context.deviceProfile && context.deviceProfile.hardwareSummary.hasBattery !== null) {
      return context.deviceProfile.hardwareSummary.hasBattery ?? false;
    }
    return false;
  }
}

export interface ProfileAdjustments {
  priorityBoost: string[];
  priorityPenalty: string[];
  riskAdjustment: number;
  confidenceAdjustment: number;
}
