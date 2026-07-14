# @avs/core

Framework primitives: MVVM base class, DI container, event bus, plugin registry, Result type, error hierarchy.

## MVVM

* `ViewModel<TState>` — pure TypeScript class that owns state, exposes subscribe / setState.
* `useViewModel(vm)` — React hook that binds a ViewModel to a component.

## DI

* `createToken<T>(name)` — type-safe injection token.
* `Container.register(token, factory)` / `resolve(token)`.
* Canonical tokens live in `di/tokens.ts` (Logger, RpcClient, SettingsStore, Licensing, Updater, Analytics).

## Plugin registry

* `ModuleDescriptor` — sidebar-driven module description.
* `moduleRegistry.register(descriptor)` — new modules plug in without touching the shell.

## Result / errors

* `Result<T, E>` with `Ok` / `Err` constructors.
* `AppError` hierarchy — always throw / return `AppError`, never raw `Error`.
