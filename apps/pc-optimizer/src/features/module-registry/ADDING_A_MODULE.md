# Adding a New Module to AVS PC Optimizer

This guide walks through adding a new optimization module. The modular
plugin architecture means **no Dashboard, Health Engine, or FeatureGate
code changes are required**.

## Overview

Adding a module involves 3 steps:

1. **Implement the standard interface** — Create a class that implements `OptimizerModule`
2. **Register it** — Add metadata to `moduleDefinitions.ts` and register in `registerModules.ts`
3. **Optionally contribute** health, recommendations, and summaries

## Step 1: Add Module ID to the `ModuleId` type

File: `src/features/health/HealthContribution.ts`

Add your module ID to the `ModuleId` union type:

```typescript
export type ModuleId =
  | 'junk'
  | 'registry'
  // ... existing modules ...
  | 'your-new-module';  // ← Add this
```

Also add it to `FUTURE_MODULE_CONFIGS` in `src/features/health/FutureModules.ts`
if it's a future module.

## Step 2: Define Module Metadata

File: `src/features/module-registry/moduleDefinitions.ts`

Create a `ModuleMetadata` object:

```typescript
export const YOUR_NEW_MODULE: ModuleMetadata = {
  moduleId: 'your-new-module',
  displayName: 'Your New Module',
  description: 'Description shown in the Dashboard.',
  category: 'cleanup',           // 'cleanup' | 'optimization' | 'security' | 'privacy' | 'system' | 'future'
  icon: 'YourIcon',              // Heroicon name
  version: '1.0.0',
  routePath: '/your-new-module',
  capabilities: {
    canScan: true,
    canClean: true,
    canOptimize: false,
    canRunInBackground: false,
  },
  featurePermissions: {
    scan: 'your.scan' as ManagedFeature,    // FeatureGate permission
    clean: 'your.clean' as ManagedFeature,
  },
  maxHealthPenalty: 10,          // 0–30, weight in health score
  supportedOS: [],               // Empty = all platforms
};
```

Add it to `ALL_MODULE_DEFINITIONS`:

```typescript
export const ALL_MODULE_DEFINITIONS: ModuleMetadata[] = [
  // ... existing modules ...
  YOUR_NEW_MODULE,               // ← Add this
];
```

Also add it to `MODULE_DISPLAY_ORDER` in `ModuleConfig.ts`:

```typescript
export const MODULE_DISPLAY_ORDER: string[] = [
  // ... existing modules ...
  'your-new-module',             // ← Add this
];
```

## Step 3: Implement the Module Interface

Create a class that implements `OptimizerModule`. The easiest way is to
extend `BaseModuleAdapter`, which handles lifecycle events, history
recording, and error isolation automatically:

```typescript
import { BaseModuleAdapter } from '../module-registry';
import type { ModuleMetadata } from '../module-registry';
import type { HealthContribution } from '../health/HealthContribution';

export class YourNewModuleAdapter extends BaseModuleAdapter {
  constructor() {
    super(YOUR_NEW_MODULE_METADATA);
  }

  // Required: provide health contribution
  async getHealthContribution(): Promise<HealthContribution> {
    // Measure your module's current state and return a contribution
    return {
      moduleId: 'your-new-module',
      moduleName: 'Your New Module',
      currentPenalty: 5,       // 0–maxPenalty
      maxPenalty: 10,
      resolvedPenalty: 0,
      detail: '3 issues found',
      canAutoFix: true,
      actionPath: '/your-new-module',
    };
  }

  // Optional: override scan/clean/optimize
  protected override async doScan(): Promise<unknown> {
    // Your scan logic here
  }

  protected override async doClean(): Promise<unknown> {
    // Your clean logic here
  }

  // Optional: provide recommendations
  override getRecommendations(): Recommendation[] {
    return [
      {
        id: 'your-rec-1',
        title: 'Issue found',
        description: 'Description of the issue',
        actionLabel: 'Fix Now',
        actionPath: '/your-new-module',
        severity: 'warning',
        category: 'cleanup',
      },
    ];
  }
}
```

## Step 4: Register the Module

File: `src/features/module-registry/registerModules.ts`

For **existing modules** (eagerly loaded):

```typescript
import { YourNewModuleAdapter } from '../your-new-module/YourNewModuleAdapter';

export function registerAllModules(): void {
  // ... existing registration ...

  // Register your module eagerly
  moduleRegistry.register(new YourNewModuleAdapter());
}
```

For **future modules** (lazily loaded — factory called on first access):

```typescript
moduleRegistry.registerLazy('your-new-module', () => new YourNewModuleAdapter());
```

## Step 5: Add Feature Permissions (if needed)

File: `packages/licensing/src/featureManager.ts`

If your module requires new feature permissions, add them to the
`ManagedFeature` type and `FEATURE_MAP`:

```typescript
export type ManagedFeature =
  // ... existing features ...
  | 'your.scan'
  | 'your.clean';

export const FEATURE_MAP: Record<ManagedFeature, string> = {
  // ... existing mappings ...
  'your.scan': 'YOUR_MODULE_SCAN',
  'your.clean': 'YOUR_MODULE_CLEAN',
};
```

Then add the feature keys to the shared feature flags registry in
`packages/shared/src/featureFlags/`.

## What You Get Automatically

Once registered, your module automatically participates in:

- **Dashboard** — Module cards render dynamically from the registry
- **Health Engine** — Health score includes your module's penalty
- **FeatureGate** — Scan/clean/optimize gated by feature permissions
- **Events** — Scan/clean/optimize/error events published automatically
- **Recommendations** — Aggregated and prioritized by severity
- **Optimization Summary** — Results included in the final report
- **History** — Per-module history recorded for analytics
- **Lifecycle** — Status tracked and displayed (Ready, Scanning, etc.)

## What NOT to Do

- **Do NOT** modify Dashboard code to add module-specific logic
- **Do NOT** modify HealthScoreService to add module-specific scoring
- **Do NOT** modify FeatureGate to add module-specific checks
- **Do NOT** create separate event systems — use `moduleEventBus`

## Testing

Create tests in `src/features/your-new-module/__tests__/`:

```typescript
import { describe, expect, it } from 'vitest';
import { YourNewModuleAdapter } from '../YourNewModuleAdapter';

describe('YourNewModule', () => {
  it('provides health contribution', async () => {
    const module = new YourNewModuleAdapter();
    const contribution = await module.getHealthContribution();
    expect(contribution.moduleId).toBe('your-new-module');
  });
});
```

## Checklist

- [ ] Added module ID to `ModuleId` type
- [ ] Created `ModuleMetadata` in `moduleDefinitions.ts`
- [ ] Added to `ALL_MODULE_DEFINITIONS` array
- [ ] Added to `MODULE_DISPLAY_ORDER` in `ModuleConfig.ts`
- [ ] Implemented `OptimizerModule` (or extended `BaseModuleAdapter`)
- [ ] Registered in `registerModules.ts` (eager or lazy)
- [ ] Added feature permissions to `featureManager.ts` (if needed)
- [ ] Added health weight to `DEFAULT_HEALTH_WEIGHTS` in `ModuleConfig.ts`
- [ ] Written tests
- [ ] Verified: `npx tsc -b --noEmit && npx eslint && npx vitest run`
