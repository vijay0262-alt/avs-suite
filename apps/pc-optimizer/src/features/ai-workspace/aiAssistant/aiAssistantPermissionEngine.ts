/**
 * AVS AI Assistant Platform — Permission Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Checks user permissions for action types.
 * Does NOT modify Authentication or Licensing modules.
 * Only reads permission level and checks against configured rules.
 */
import type {
  AIAssistantConfiguration,
  PermissionResult,
  PermissionLevel,
  ActionType,
  PermissionRule,
} from './types';
import { getPermissionLevelLabel } from './types';

const LEVEL_HIERARCHY: PermissionLevel[] = ['guest', 'free', 'pro', 'enterprise', 'future_level'];

export class AIAssistantPermissionEngine {
  private _config: AIAssistantConfiguration;

  constructor(config: AIAssistantConfiguration) {
    this._config = config;
  }

  updateConfig(config: AIAssistantConfiguration): void {
    this._config = config;
  }

  check(action: ActionType, currentLevel: PermissionLevel): PermissionResult {
    const rule = this._findRule(action);

    if (!rule) {
      return {
        allowed: true,
        reason: null,
        requiredLevel: this._config.permissionRules.defaultLevel,
        currentLevel,
        futureMetadata: {},
      };
    }

    const currentIdx = LEVEL_HIERARCHY.indexOf(currentLevel);
    const requiredIdx = LEVEL_HIERARCHY.indexOf(rule.requiredLevel);

    if (currentIdx < 0 || requiredIdx < 0) {
      return {
        allowed: false,
        reason: `Unknown permission level: ${currentLevel}`,
        requiredLevel: rule.requiredLevel,
        currentLevel,
        futureMetadata: {},
      };
    }

    const allowed = currentIdx >= requiredIdx;

    return {
      allowed,
      reason: allowed
        ? null
        : `This action requires ${getPermissionLevelLabel(rule.requiredLevel)} level. You currently have ${getPermissionLevelLabel(currentLevel)}.`,
      requiredLevel: rule.requiredLevel,
      currentLevel,
      futureMetadata: {},
    };
  }

  private _findRule(action: ActionType): PermissionRule | null {
    return this._config.permissionRules.rules.find((r) => r.action === action) ?? null;
  }

  getRules(): PermissionRule[] {
    return this._config.permissionRules.rules;
  }

  getDefaultLevel(): PermissionLevel {
    return this._config.permissionRules.defaultLevel;
  }
}
