# packages/

Shared libraries consumed by every app in `apps/`. Adding code here
means adding value to every product simultaneously.

| Package | Purpose |
|---|---|
| `ui/` | Design-system components, tokens, theme provider |
| `core/` | MVVM base, DI container, event bus, plugin registry, Result, errors |
| `shared/` | Design tokens, i18n keys, feature flags, RPC schema, environment config |
| `licensing/` | Licensing interfaces (Free / Pro / Enterprise / Trial); no implementation yet |
| `updater/` | Auto-update interfaces & event types |
| `analytics/` | Opt-in telemetry interfaces |

Dependency direction:

```
apps/*      →  ui, core, shared, licensing, updater, analytics
ui          →  shared
core        →  shared
licensing   →  shared, core
updater     →  shared
analytics   →  (none)
shared      →  (nothing; leaf)
```

No circular imports allowed; enforced by TS project references and CI.
