# @avs/shared

Zero-dependency shared primitives.

| Sub-module | Contents |
|---|---|
| `tokens/` | Design tokens (source of truth for all colours, spacing, typography, motion) |
| `i18n/` | Canonical English translation tree; `SUPPORTED_LOCALES`; `DEFAULT_LOCALE` |
| `featureFlags/` | Edition registry (`Free` / `Pro` / `Enterprise` / `Trial`), `FEATURES` map, `isFeatureEnabled` |
| `env/` | `resolveEnvironment(AVS_ENV)` — dev / staging / prod configuration |
| `rpc/` | JSON-RPC method names + error codes shared with Python backend |
| `constants/` | Product metadata, user-data paths, settings filenames |
| `types/` | Cross-package TypeScript types |
| `utils/` | Pure helpers (formatBytes, clamp, delay, assertNever) |

Rule: **nothing in this package may import from any other `packages/*`**.
It is the leaf of the dependency graph.
