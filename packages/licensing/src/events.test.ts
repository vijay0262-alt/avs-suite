/**
 * License events tests — validates event emitter and event creation.
 */
import { LicenseEventEmitter, createLicenseEvent } from '../events';

describe('License Events', () => {
  describe('createLicenseEvent', () => {
    it('creates an event with type and timestamp', () => {
      const event = createLicenseEvent('license_activated');
      expect(event.type).toBe('license_activated');
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).not.toBeNaN();
    });

    it('includes extra fields', () => {
      const event = createLicenseEvent('edition_changed', {
        previousEdition: 'free',
        newEdition: 'pro',
      });
      expect(event.previousEdition).toBe('free');
      expect(event.newEdition).toBe('pro');
    });
  });

  describe('LicenseEventEmitter', () => {
    it('delivers events to specific listeners', () => {
      const emitter = new LicenseEventEmitter();
      const received: string[] = [];
      emitter.on('license_activated', (e) => received.push(e.type));
      emitter.emit(createLicenseEvent('license_activated'));
      expect(received).toEqual(['license_activated']);
    });

    it('delivers events to all-event listeners', () => {
      const emitter = new LicenseEventEmitter();
      const received: string[] = [];
      emitter.onAll((e) => received.push(e.type));
      emitter.emit(createLicenseEvent('license_activated'));
      emitter.emit(createLicenseEvent('license_expired'));
      expect(received).toEqual(['license_activated', 'license_expired']);
    });

    it('does not deliver to unsubscribed listeners', () => {
      const emitter = new LicenseEventEmitter();
      const received: string[] = [];
      const unsub = emitter.on('license_activated', (e) => received.push(e.type));
      unsub();
      emitter.emit(createLicenseEvent('license_activated'));
      expect(received).toHaveLength(0);
    });

    it('swallows listener errors', () => {
      const emitter = new LicenseEventEmitter();
      emitter.on('license_activated', () => {
        throw new Error('listener error');
      });
      expect(() => emitter.emit(createLicenseEvent('license_activated'))).not.toThrow();
    });

    it('clears all listeners', () => {
      const emitter = new LicenseEventEmitter();
      const received: string[] = [];
      emitter.onAll((e) => received.push(e.type));
      emitter.clear();
      emitter.emit(createLicenseEvent('license_activated'));
      expect(received).toHaveLength(0);
    });
  });
});
