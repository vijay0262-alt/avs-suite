/**
 * Centralized application version metadata.
 *
 * Single source of truth for version, build, channel, edition, and
 * architecture information. Every component that needs to display
 * version data imports from here — no scattered hardcoded values.
 */

export type ReleaseChannel = 'stable' | 'beta' | 'nightly';
export type AppEdition = 'free' | 'pro' | 'enterprise';
export type AppArchitecture = 'x64' | 'arm64';

export interface VersionInfo {
  version: string;
  buildNumber: string;
  channel: ReleaseChannel;
  releaseDate: string;
  architecture: AppArchitecture;
  edition: AppEdition;
}

const APP_VERSION: VersionInfo = {
  version: '1.0.0',
  buildNumber: '1001',
  channel: 'stable',
  releaseDate: '2026-07-23',
  architecture: 'x64',
  edition: 'free',
};

export function getVersionInfo(): VersionInfo {
  return { ...APP_VERSION };
}

export function getVersionString(): string {
  const v = APP_VERSION;
  return `Version ${v.version}`;
}

export function getBuildString(): string {
  return `Build ${APP_VERSION.buildNumber}`;
}

export function getChannelString(): string {
  const labels: Record<ReleaseChannel, string> = {
    stable: 'Release',
    beta: 'Beta',
    nightly: 'Nightly',
  };
  return labels[APP_VERSION.channel];
}

export function getEditionString(): string {
  const labels: Record<AppEdition, string> = {
    free: 'Free Edition',
    pro: 'Pro Edition',
    enterprise: 'Enterprise Edition',
  };
  return labels[APP_VERSION.edition];
}

export function getArchitectureString(): string {
  const labels: Record<AppArchitecture, string> = {
    x64: '64-bit',
    arm64: 'ARM64',
  };
  return labels[APP_VERSION.architecture];
}

export function getFullVersionDisplay(): string {
  const v = APP_VERSION;
  const labels: Record<ReleaseChannel, string> = {
    stable: 'Release',
    beta: 'Beta',
    nightly: 'Nightly',
  };
  const editionLabels: Record<AppEdition, string> = {
    free: 'Free Edition',
    pro: 'Pro Edition',
    enterprise: 'Enterprise Edition',
  };
  const archLabels: Record<AppArchitecture, string> = {
    x64: '64-bit',
    arm64: 'ARM64',
  };
  return [
    `Version ${v.version}`,
    `Build ${v.buildNumber}`,
    labels[v.channel],
    archLabels[v.architecture],
    editionLabels[v.edition],
  ].join(' · ');
}
