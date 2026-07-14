/**
 * ModuleRegistry — the plugin backbone.
 *
 * Modules register themselves at bootstrap. The shell then queries the
 * registry to build the sidebar, route table, and command palette.
 *
 * This inversion means adding "Driver Updater" is a single registration
 * call; no shell or routing code needs to change.
 */
import type { ModuleDescriptor } from './ModuleDescriptor';

export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleDescriptor>();

  register(descriptor: ModuleDescriptor): void {
    if (this.modules.has(descriptor.id)) {
      throw new Error(`Module "${descriptor.id}" is already registered.`);
    }
    this.modules.set(descriptor.id, descriptor);
  }

  get(id: string): ModuleDescriptor | undefined {
    return this.modules.get(id);
  }

  list(): ModuleDescriptor[] {
    return Array.from(this.modules.values()).sort((a, b) => a.order - b.order);
  }
}

export const moduleRegistry = new ModuleRegistry();
