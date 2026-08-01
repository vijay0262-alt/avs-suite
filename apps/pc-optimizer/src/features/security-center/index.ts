/**
 * AI Security Center — barrel exports
 *
 * Version 1.2 — EPIC 1 — AI Security Center
 *
 * Public API for the AI Security Framework.
 * Modular, extensible security architecture with provider system.
 * Foundation only — no remediation, no real-time protection.
 */

// Types
export * from './types';

// Events
export { securityEventBus } from './SecurityEvents';

// Configuration
export { SecurityConfigurationManager } from './SecurityConfiguration';

// Core
export { SecurityManager } from './SecurityManager';
export { SecurityEngine } from './SecurityEngine';
export { SecurityScanner } from './SecurityScanner';
export { SecuritySnapshotBuilder } from './SecuritySnapshot';
export { SecurityRepository } from './SecurityRepository';
export { SecurityHistory } from './SecurityHistory';
export { SecurityCache } from './SecurityCache';

// Registry & Factory
export { SecurityRegistry } from './SecurityRegistry';
export { SecurityFactory } from './SecurityFactory';

// Providers
export { SecurityProvider } from './SecurityProvider';
export { ThreatProvider } from './ThreatProvider';
export { BehaviorProvider } from './BehaviorProvider';
export type { BehaviorDetectionInput } from './BehaviorProvider';
export { SignatureProvider } from './SignatureProvider';
export type { SignatureMatch, SignatureDetectionInput } from './SignatureProvider';
export { PersistenceProvider } from './PersistenceProvider';
export type { PersistenceEntry, PersistenceDetectionInput } from './PersistenceProvider';
export { BrowserProtectionProvider } from './BrowserProtectionProvider';
export type { BrowserExtensionInfo, BrowserSettingsInfo, BrowserDetectionInput } from './BrowserProtectionProvider';
export { ReputationProvider } from './ReputationProvider';
export type { ReputationEntry, ReputationDetectionInput } from './ReputationProvider';
export { ThreatIntelligenceProvider } from './ThreatIntelligenceProvider';
export type { ThreatIntelEntry, ThreatIntelligenceInput } from './ThreatIntelligenceProvider';

// Part 2 — Detection Providers
export { SpywareDetectionProvider } from './SpywareDetectionProvider';
export type { SpywareIndicator, SpywareSignal } from './types';
export { AdwareDetectionProvider } from './AdwareDetectionProvider';
export type { AdwareIndicator, AdwareSignal } from './types';
export { PUPDetectionProvider } from './PUPDetectionProvider';
export type { PUPIndicator, PUPSignal } from './types';
export { BrowserHijackerProvider } from './BrowserHijackerProvider';
export type { BrowserAnalysisInput, BrowserExtensionDetail, BrowserSettingsDetail, NotificationPermission } from './types';
export { PersistenceDetectionProvider } from './PersistenceDetectionProvider';
export type { PersistenceAnalysisInput, StartupEntryDetail, RegistryRunKeyDetail, ScheduledTaskDetail, ServiceDetail, WmiPersistenceDetail, ShellExtensionDetail } from './types';
export { StartupAbuseProvider } from './StartupAbuseProvider';
export { ScheduledTaskProvider } from './ScheduledTaskProvider';
export { ServiceAnalysisProvider } from './ServiceAnalysisProvider';
export { PowerShellDetectionProvider } from './PowerShellDetectionProvider';
export { MacroDetectionProvider } from './MacroDetectionProvider';
export { ScriptDetectionProvider } from './ScriptDetectionProvider';
export type { ScriptAnalysisInput, ScriptDetail } from './types';
export { CryptoMinerDetectionProvider } from './CryptoMinerDetectionProvider';
export type { CryptoMinerInput, CryptoMinerProcessDetail } from './types';
export { SuspiciousProcessProvider } from './SuspiciousProcessProvider';
export type { ProcessBehaviorInfo, BehaviorIndicator } from './types';
export { UnsignedExecutableProvider } from './UnsignedExecutableProvider';
export { NetworkBehaviorProvider } from './NetworkBehaviorProvider';
export type { NetworkBehaviorInput, NetworkConnectionDetail, ListeningPortDetail, DnsQueryDetail } from './types';
export { FileReputationProvider } from './FileReputationProvider';
export type { FileReputationDetail } from './types';
export { PublisherTrustProvider } from './PublisherTrustProvider';
export type { PublisherReputationDetail } from './types';

// Dashboard, Health, Capabilities, Diagnostics
export { SecurityDashboardProvider } from './SecurityDashboardProvider';
export { SecurityHealth } from './SecurityHealth';
export { SecurityCapabilities } from './SecurityCapabilities';
export { SecurityDiagnostics } from './SecurityDiagnostics';
