/**
 * AI Tool Framework — Permission Engine
 *
 * EPIC 5 PHASE A PART 2
 *
 * Validates: Subscription, Capabilities, User Permissions,
 * Enterprise Policies, Feature Flags, Safety Policies.
 * Does NOT modify Authentication or Licensing modules.
 */
import type { ToolConfiguration, ToolPermissionResult, PermissionLevel, CopilotCapability } from './types';
import type { ToolDefinition } from './types';

const LEVEL_HIERARCHY: PermissionLevel[] = ['guest', 'free', 'pro', 'enterprise', 'future_level'];

export class ToolPermissionEngine {
  private _config: ToolConfiguration;

  constructor(config: ToolConfiguration) {
    this._config = config;
  }

  updateConfig(config: ToolConfiguration): void {
    this._config = config;
  }

  check(
    tool: ToolDefinition,
    currentLevel: PermissionLevel,
    userCapabilities: CopilotCapability[],
  ): ToolPermissionResult {
    const rule = this._findRule(tool.id);
    const requiredLevel = rule?.requiredLevel ?? tool.requiredPermissions;
    const requiredCapabilities = rule?.requiredCapabilities ?? tool.requiredCapabilities;

    const currentIdx = LEVEL_HIERARCHY.indexOf(currentLevel);
    const requiredIdx = LEVEL_HIERARCHY.indexOf(requiredLevel);

    if (currentIdx < 0 || requiredIdx < 0) {
      return {
        allowed: false,
        reason: `Unknown permission level: ${currentLevel}`,
        requiredLevel,
        currentLevel,
        missingCapabilities: [],
        futureMetadata: {},
      };
    }

    const levelOk = currentIdx >= requiredIdx;
    const missingCapabilities = requiredCapabilities.filter((c) => !userCapabilities.includes(c));
    const capabilitiesOk = missingCapabilities.length === 0;

    if (levelOk && capabilitiesOk) {
      return {
        allowed: true,
        reason: null,
        requiredLevel,
        currentLevel,
        missingCapabilities: [],
        futureMetadata: {},
      };
    }

    const reasons: string[] = [];
    if (!levelOk) reasons.push(`Requires ${requiredLevel} level (you have ${currentLevel})`);
    if (!capabilitiesOk) reasons.push(`Missing capabilities: ${missingCapabilities.join(', ')}`);

    return {
      allowed: false,
      reason: reasons.join('; '),
      requiredLevel,
      currentLevel,
      missingCapabilities,
      futureMetadata: {},
    };
  }

  private _findRule(toolId: string): import('./types').ToolPermissionRule | null {
    return this._config.permissionRules.rules.find((r) => r.toolId === toolId) ?? null;
  }

  getRules(): import('./types').ToolPermissionRule[] {
    return this._config.permissionRules.rules;
  }
}
