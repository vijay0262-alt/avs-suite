/**
 * Minimal, type-safe dependency-injection container.
 *
 * We deliberately avoid decorator-based DI (reflect-metadata et al.) to
 * keep the runtime footprint tiny and TS strict-mode clean. Services are
 * registered against branded `InjectionToken<T>`s.
 */

export interface InjectionToken<T> {
  readonly key: symbol;
  readonly name: string;
  /** Phantom, purely for type inference. */
  readonly __brand?: T;
}

export function createToken<T>(name: string): InjectionToken<T> {
  return { key: Symbol(name), name };
}

type Factory<T> = (container: Container) => T;

interface Registration<T> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private readonly registrations = new Map<symbol, Registration<unknown>>();

  register<T>(token: InjectionToken<T>, factory: Factory<T>, singleton = true): this {
    this.registrations.set(token.key, { factory: factory as Factory<unknown>, singleton });
    return this;
  }

  registerValue<T>(token: InjectionToken<T>, value: T): this {
    this.registrations.set(token.key, {
      factory: () => value,
      singleton: true,
      instance: value,
    });
    return this;
  }

  resolve<T>(token: InjectionToken<T>): T {
    const reg = this.registrations.get(token.key) as Registration<T> | undefined;
    if (!reg) throw new Error(`No provider registered for token "${token.name}"`);
    if (reg.singleton) {
      if (reg.instance === undefined) reg.instance = reg.factory(this);
      return reg.instance;
    }
    return reg.factory(this);
  }

  has(token: InjectionToken<unknown>): boolean {
    return this.registrations.has(token.key);
  }
}
