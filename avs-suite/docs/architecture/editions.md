# Editions

AVS PC Optimizer ships one binary for all editions. The active edition
is resolved at runtime by `@avs/licensing` and cached in memory.

| Edition | Description |
|---|---|
| `free` | Baseline features. |
| `pro` | Deep cleans, duplicate finder, performance presets, scheduled maintenance. |
| `enterprise` | Multi-device management, priority support. |
| `trial` | Same as Pro; expires. |

## Gating rule

* All feature capabilities are declared in
  `packages/shared/src/featureFlags/index.ts → FEATURES`.
* Consumers call `isFeatureEnabled('JUNK_CLEANER_DEEP', edition)`.
* `hardGated: true` means the feature is **hidden** for ineligible
  editions (no upsell). Everything else shows a locked state and links
  to the upgrade flow.

## Never do

* Don't scatter `if (edition === 'pro')` checks in components.
* Don't check the license service directly from a View — always through
  a hook that reads a resolved boolean.
