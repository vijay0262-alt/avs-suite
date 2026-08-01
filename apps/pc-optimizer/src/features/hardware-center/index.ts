/**
 * Hardware Intelligence Center — barrel export.
 *
 * Version 1.1 — Foundation: hardware discovery, monitoring, and architecture.
 * No AI, no optimization, no fan control, no overclocking.
 */

// Types
export * from './types';

// Core infrastructure
export { HardwareManager } from './HardwareManager';
export { HardwareScanner } from './HardwareScanner';
export { HardwareMonitor } from './HardwareMonitor';
export { HardwareCache } from './HardwareCache';
export { HardwareHistory } from './HardwareHistory';
export { hardwareRegistry } from './HardwareRegistry';
export { HardwareFactory } from './HardwareFactory';
export { HardwareCapabilitiesDetector } from './HardwareCapabilities';
export { HardwareDiagnosticsRunner } from './HardwareDiagnostics';
export { HardwareHealthEvaluator } from './HardwareHealth';
export { HardwareDashboardProvider } from './HardwareDashboardProvider';
export { hardwareEventBus } from './HardwareEvents';

// Repository
export { InMemoryHardwareRepository } from './HardwareRepository';
export type { HardwareRepository } from './HardwareRepository';
