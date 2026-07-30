/**
 * Multimodal AI Interaction Platform — Modality Registry
 *
 * EPIC 5 PHASE A PART 6
 *
 * Central registry for modality definitions. New modalities register
 * through this registry. Provider/plugin architecture only.
 */
import type { ModalityDefinition, ModalityPlugin, InputModality } from './types';
import { createDefaultModalityDefinitions } from './types';

export class ModalityRegistry {
  private _definitions: Map<InputModality, ModalityDefinition> = new Map();
  private _plugins: Map<string, ModalityPlugin> = new Map();

  constructor() {
    for (const def of createDefaultModalityDefinitions()) {
      this._definitions.set(def.modality, def);
    }
  }

  register(definition: ModalityDefinition): boolean {
    if (this._definitions.has(definition.modality)) return false;
    this._definitions.set(definition.modality, definition);
    return true;
  }

  unregister(modality: InputModality): boolean {
    return this._definitions.delete(modality);
  }

  get(modality: InputModality): ModalityDefinition | null {
    return this._definitions.get(modality) ?? null;
  }

  has(modality: InputModality): boolean {
    return this._definitions.has(modality);
  }

  getAll(): ModalityDefinition[] {
    return Array.from(this._definitions.values());
  }

  getEnabled(): ModalityDefinition[] {
    return this.getAll().filter((d) => d.enabled);
  }

  getByProcessorId(processorId: string): ModalityDefinition[] {
    return this.getAll().filter((d) => d.processorId === processorId);
  }

  count(): number {
    return this._definitions.size;
  }

  enable(modality: InputModality): boolean {
    const def = this._definitions.get(modality);
    if (!def) return false;
    def.enabled = true;
    return true;
  }

  disable(modality: InputModality): boolean {
    const def = this._definitions.get(modality);
    if (!def) return false;
    def.enabled = false;
    return true;
  }

  registerPlugin(plugin: ModalityPlugin): boolean {
    if (!plugin.isAvailable()) return false;
    const name = plugin.getPluginName();
    if (this._plugins.has(name)) return false;
    this._plugins.set(name, plugin);
    for (const def of plugin.getModalityDefinitions()) {
      if (!this._definitions.has(def.modality)) {
        this._definitions.set(def.modality, def);
      }
    }
    return true;
  }

  unregisterPlugin(pluginName: string): boolean {
    const plugin = this._plugins.get(pluginName);
    if (!plugin) return false;
    for (const def of plugin.getModalityDefinitions()) {
      this._definitions.delete(def.modality);
    }
    return this._plugins.delete(pluginName);
  }

  getPlugin(pluginName: string): ModalityPlugin | null {
    return this._plugins.get(pluginName) ?? null;
  }

  getPlugins(): ModalityPlugin[] {
    return Array.from(this._plugins.values());
  }

  clear(): void {
    this._definitions.clear();
    this._plugins.clear();
    for (const def of createDefaultModalityDefinitions()) {
      this._definitions.set(def.modality, def);
    }
  }
}
