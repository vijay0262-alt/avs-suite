/**
 * AI Workspace Personalization Platform — Workspace Template Registry
 *
 * EPIC 5 PHASE A PART 7
 *
 * Registry for workspace templates supporting import, export, duplicate,
 * share, enterprise templates, default templates, and future template
 * providers through a plugin architecture.
 */
import type {
  WorkspaceTemplate,
  WorkspaceTemplatePlugin,
  WorkspaceConfiguration,
  WorkspaceProfile,
} from './types';
import { generateTemplateId } from './types';

export class WorkspaceTemplateRegistry {
  private _config: WorkspaceConfiguration;
  private _templates: Map<string, WorkspaceTemplate> = new Map();
  private _plugins: Map<string, WorkspaceTemplatePlugin> = new Map();

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
    this._loadDefaultTemplates();
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  private _loadDefaultTemplates(): void {
    const now = new Date().toISOString();
    const defaults: WorkspaceTemplate[] = [
      {
        id: 'tmpl_default',
        name: 'Default Workspace',
        description: 'Balanced workspace for general use',
        profileType: 'default',
        layout: { widgets: [], columns: 3, compactMode: false, sidebarCollapsed: false, theme: 'auto', futureMetadata: {} },
        quickActions: ['optimize', 'report', 'health_check'],
        preferredReports: [],
        notificationPreferences: { enableNotifications: true, enableSound: true, enableDesktop: true, enableEmail: false, priorityThreshold: 'medium', quietHoursStart: null, quietHoursEnd: null, futureMetadata: {} },
        defaultGoals: [],
        preferredTools: [],
        aiInteractionStyle: 'detailed',
        widgetOrdering: ['health_score', 'recommendations', 'timeline', 'goals', 'device_profile'],
        isEnterprise: false,
        tags: ['default'],
        createdBy: 'system',
        createdAt: now,
        futureMetadata: {},
      },
      {
        id: 'tmpl_enterprise_standard',
        name: 'Enterprise Standard',
        description: 'Standard enterprise workspace with reporting focus',
        profileType: 'business',
        layout: { widgets: [], columns: 4, compactMode: false, sidebarCollapsed: false, theme: 'light', futureMetadata: {} },
        quickActions: ['report', 'optimize', 'health_check', 'goals'],
        preferredReports: ['executive_summary', 'performance_report'],
        notificationPreferences: { enableNotifications: true, enableSound: false, enableDesktop: true, enableEmail: true, priorityThreshold: 'high', quietHoursStart: null, quietHoursEnd: null, futureMetadata: {} },
        defaultGoals: ['maintain_performance'],
        preferredTools: ['generate_report', 'explain_health', 'create_goal'],
        aiInteractionStyle: 'detailed',
        widgetOrdering: ['health_score', 'goals', 'recommendations', 'timeline', 'device_profile'],
        isEnterprise: true,
        tags: ['enterprise', 'standard'],
        createdBy: 'system',
        createdAt: now,
        futureMetadata: {},
      },
    ];

    for (const template of defaults) {
      this._templates.set(template.id, template);
    }
  }

  registerTemplate(template: WorkspaceTemplate): boolean {
    if (this._templates.has(template.id)) {
      return false;
    }
    this._templates.set(template.id, template);
    return true;
  }

  unregisterTemplate(id: string): boolean {
    return this._templates.delete(id);
  }

  getTemplate(id: string): WorkspaceTemplate | null {
    return this._templates.get(id) ?? null;
  }

  getAllTemplates(): WorkspaceTemplate[] {
    return Array.from(this._templates.values());
  }

  getEnterpriseTemplates(): WorkspaceTemplate[] {
    return Array.from(this._templates.values()).filter((t) => t.isEnterprise);
  }

  getDefaultTemplates(): WorkspaceTemplate[] {
    return Array.from(this._templates.values()).filter((t) => !t.isEnterprise);
  }

  getTemplatesByProfileType(profileType: string): WorkspaceTemplate[] {
    return Array.from(this._templates.values()).filter((t) => t.profileType === profileType);
  }

  getTemplatesByTag(tag: string): WorkspaceTemplate[] {
    return Array.from(this._templates.values()).filter((t) => t.tags.includes(tag));
  }

  createTemplate(
    name: string,
    description: string,
    profileType: WorkspaceTemplate['profileType'],
    layout: WorkspaceTemplate['layout'],
    options?: Partial<WorkspaceTemplate>,
  ): WorkspaceTemplate {
    const now = new Date().toISOString();
    const template: WorkspaceTemplate = {
      id: generateTemplateId(),
      name,
      description,
      profileType,
      layout,
      quickActions: options?.quickActions ?? [],
      preferredReports: options?.preferredReports ?? [],
      notificationPreferences: options?.notificationPreferences ?? { enableNotifications: true, enableSound: true, enableDesktop: true, enableEmail: false, priorityThreshold: 'medium', quietHoursStart: null, quietHoursEnd: null, futureMetadata: {} },
      defaultGoals: options?.defaultGoals ?? [],
      preferredTools: options?.preferredTools ?? [],
      aiInteractionStyle: options?.aiInteractionStyle ?? 'detailed',
      widgetOrdering: options?.widgetOrdering ?? [],
      isEnterprise: options?.isEnterprise ?? false,
      tags: options?.tags ?? [],
      createdBy: options?.createdBy ?? 'user',
      createdAt: now,
      futureMetadata: {},
    };

    this._templates.set(template.id, template);
    return template;
  }

  duplicateTemplate(id: string, newName: string): WorkspaceTemplate {
    const original = this.getTemplate(id);
    if (!original) {
      throw new Error(`Template ${id} not found`);
    }

    const duplicate: WorkspaceTemplate = {
      ...structuredClone(original),
      id: generateTemplateId(),
      name: newName,
      isEnterprise: false,
      createdBy: 'user',
      createdAt: new Date().toISOString(),
    };

    this._templates.set(duplicate.id, duplicate);
    return duplicate;
  }

  shareTemplate(id: string, targetUserId: string): WorkspaceTemplate {
    const original = this.getTemplate(id);
    if (!original) {
      throw new Error(`Template ${id} not found`);
    }

    const shared: WorkspaceTemplate = {
      ...structuredClone(original),
      id: generateTemplateId(),
      createdBy: targetUserId,
      createdAt: new Date().toISOString(),
    };

    return shared;
  }

  createTemplateFromProfile(profile: WorkspaceProfile, name: string, description: string): WorkspaceTemplate {
    return this.createTemplate(name, description, profile.type, structuredClone(profile.layout), {
      quickActions: [...profile.quickActions],
      preferredReports: [...profile.preferredReports],
      notificationPreferences: structuredClone(profile.notificationPreferences),
      defaultGoals: [...profile.defaultGoals],
      preferredTools: [...profile.preferredTools],
      aiInteractionStyle: profile.aiInteractionStyle,
      widgetOrdering: [...profile.widgetOrdering],
    });
  }

  registerPlugin(plugin: WorkspaceTemplatePlugin): boolean {
    if (!this._config.featureFlags.enablePlugins) {
      throw new Error('Plugins are disabled');
    }
    if (this._plugins.has(plugin.getPluginName())) {
      return false;
    }
    this._plugins.set(plugin.getPluginName(), plugin);

    if (plugin.isAvailable()) {
      const templates = plugin.getTemplates();
      for (const template of templates) {
        this.registerTemplate(template);
      }
    }

    return true;
  }

  unregisterPlugin(pluginName: string): boolean {
    const plugin = this._plugins.get(pluginName);
    if (!plugin) return false;

    if (plugin.isAvailable()) {
      const templates = plugin.getTemplates();
      for (const template of templates) {
        this.unregisterTemplate(template.id);
      }
    }

    return this._plugins.delete(pluginName);
  }

  getRegisteredPlugins(): string[] {
    return Array.from(this._plugins.keys());
  }

  clearCustomTemplates(): void {
    const customTemplates = Array.from(this._templates.values()).filter((t) => t.createdBy !== 'system');
    for (const template of customTemplates) {
      this._templates.delete(template.id);
    }
  }
}
