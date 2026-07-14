# @avs/updater

Contracts for auto-update. The concrete implementation lives in the
Electron main process (`apps/*/electron/updater/`) so it can access
`electron-updater` directly; renderers consume the update API through
the preload bridge.

Placeholder `NullUpdateService` is provided so features that reference
`IUpdateService` can be developed and unit-tested without electron.
