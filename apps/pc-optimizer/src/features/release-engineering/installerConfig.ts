/**
 * Installer Config — EPIC 3
 *
 * Professional installer configuration supporting:
 *   Install, repair, modify, uninstall, portable build,
 *   silent install, per-user, per-machine, upgrade existing
 *   installations, preserve user settings.
 *
 * This module does NOT modify any existing architecture.
 * It provides configuration that electron-builder consumes.
 */
import type { InstallerConfig, InstallMode, InstallScope } from './types';
import { DEFAULT_INSTALLER_CONFIG } from './types';

export class InstallerConfigBuilder {
  private _config: InstallerConfig;

  constructor(config?: Partial<InstallerConfig>) {
    this._config = { ...DEFAULT_INSTALLER_CONFIG, ...config };
  }

  setMode(mode: InstallMode): this {
    this._config.mode = mode;
    return this;
  }

  setScope(scope: InstallScope): this {
    this._config.scope = scope;
    return this;
  }

  setSilent(silent: boolean): this {
    this._config.silent = silent;
    return this;
  }

  setPortable(portable: boolean): this {
    this._config.portable = portable;
    this._config.silent = portable ? true : this._config.silent;
    return this;
  }

  setInstallPath(path: string | null): this {
    this._config.installPath = path;
    return this;
  }

  setPreserveSettings(preserve: boolean): this {
    this._config.preserveSettings = preserve;
    return this;
  }

  setUpgradeExisting(upgrade: boolean): this {
    this._config.upgradeExisting = upgrade;
    return this;
  }

  setShortcuts(desktop: boolean, startMenu: boolean): this {
    this._config.createDesktopShortcut = desktop;
    this._config.createStartMenuShortcut = startMenu;
    return this;
  }

  build(): InstallerConfig {
    return { ...this._config };
  }

  toElectronBuilderConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
      appId: 'com.avs.pcoptimizer',
      productName: 'AVS Shield Optimizer',
      copyright: 'Copyright © 2024-2026 Advanced Vision Software LLC. All rights reserved.',
      directories: {
        output: 'release',
        buildResources: 'build',
      },
      files: ['dist/**/*', 'dist-electron/**/*', 'package.json'],
      extraResources: [
        {
          from: '../../backend/dist/backend-py',
          to: 'backend',
          filter: ['**/*'],
        },
      ],
      win: {
        target: this._config.portable ? ['portable'] : ['nsis'],
        arch: ['x64'],
        artifactName: this._config.portable
          ? '${productName}-Portable.${ext}'
          : '${productName}-Setup.${ext}',
        publisherName: 'Advanced Vision Software LLC',
        signAndEditExecutable: false,
      },
    };

    if (!this._config.portable) {
      config.nsis = {
        oneClick: this._config.silent,
        perMachine: this._config.scope === 'per-machine',
        allowToChangeInstallationDirectory: !this._config.silent,
        createDesktopShortcut: this._config.createDesktopShortcut,
        createStartMenuShortcut: this._config.createStartMenuShortcut,
        runAfterFinish: !this._config.silent,
        deleteAppDataOnUninstall: false,
      };
    }

    return config;
  }

  static forInstall(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'install', scope: 'per-user', preserveSettings: true, upgradeExisting: true });
  }

  static forRepair(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'repair', scope: 'per-user', preserveSettings: true, upgradeExisting: false });
  }

  static forModify(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'modify', scope: 'per-user', preserveSettings: true, upgradeExisting: false });
  }

  static forUninstall(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'uninstall', scope: 'per-user', preserveSettings: false, upgradeExisting: false, createDesktopShortcut: false, createStartMenuShortcut: false });
  }

  static forPortable(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'portable', portable: true, silent: true, scope: 'per-user', preserveSettings: false, upgradeExisting: false });
  }

  static forSilentInstall(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'silent', silent: true, scope: 'per-machine', preserveSettings: true, upgradeExisting: true, createDesktopShortcut: false, createStartMenuShortcut: false });
  }

  static forUpgrade(): InstallerConfigBuilder {
    return new InstallerConfigBuilder({ mode: 'install', scope: 'per-user', preserveSettings: true, upgradeExisting: true });
  }
}

export const installerConfigBuilder = InstallerConfigBuilder.forInstall();
