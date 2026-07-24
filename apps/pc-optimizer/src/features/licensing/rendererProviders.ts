import type { ILicenseStorage } from '@avs/licensing';
import type { LicenseModel } from '@avs/licensing';
import type { IDeviceIdProvider } from '@avs/licensing';

let cachedDeviceId: string | null = null;

export class MemoryLicenseStorage implements ILicenseStorage {
  private data: LicenseModel | null = null;

  async read(): Promise<LicenseModel | null> {
    return this.data;
  }

  async write(license: LicenseModel): Promise<void> {
    this.data = { ...license };
  }

  async remove(): Promise<void> {
    this.data = null;
  }

  async exists(): Promise<boolean> {
    return this.data !== null;
  }

  async getVersion(): Promise<number | null> {
    return this.data?.formatVersion ?? null;
  }
}

export class IpcDeviceIdProvider implements IDeviceIdProvider {
  async getDeviceId(): Promise<string> {
    if (cachedDeviceId && cachedDeviceId !== 'pending-device-id') return cachedDeviceId;
    try {
      const info = await window.avs.license.getInfo();
      if (info?.fingerprint) {
        cachedDeviceId = info.fingerprint;
        return cachedDeviceId;
      }
    } catch {
      // SDK not ready yet — fall through to fallback
    }
    const fallback = 'pending-device-id';
    // Do NOT cache the fallback — allow retry on next call
    return fallback;
  }

  async hasChanged(): Promise<boolean> {
    const prev = cachedDeviceId;
    cachedDeviceId = null;
    const next = await this.getDeviceId();
    return prev !== next;
  }
}
