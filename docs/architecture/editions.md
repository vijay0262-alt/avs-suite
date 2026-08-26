# Editions

AVS AI Shield: Security & System Intelligence ships one binary for all editions. The active edition
is resolved at runtime by `@avs/licensing` and cached in memory.

| Edition | Description |
|---|---|
| `free` | Baseline features. |
| `professional` | Full optimization suite, AI features, security, smart optimize. |

**Backward-compatibility aliases** (mapped to the two actual editions):
- `pro` → `professional`
- `enterprise` → `professional`
- `ultimate` → `professional`
- `trial` → `professional`
- `total_security` → `professional`

## Gating rule

* All feature capabilities are declared in
  `packages/shared/src/featureFlags/index.ts → FEATURES` (30+ flags).
* Consumers call `isFeatureEnabled('JUNK_CLEANER_DEEP', edition)`.
* `hardGated: true` means the feature is **hidden** for ineligible
  editions (no upsell). Everything else shows a locked state and links
  to the upgrade flow.

## Never do

* Don't scatter `if (edition === 'professional')` checks in components.
* Don't check the license service directly from a View — always through
  a hook that reads a resolved boolean.
