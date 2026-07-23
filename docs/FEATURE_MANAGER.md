# Feature Manager

**AVS PC Optimizer** — Commercial Licensing Foundation  
**Version:** 1.0.0 | **Date:** 2026-07-23

---

## Overview

The Feature Manager is the single entry point for all feature gating in the application. Every premium feature check must go through:

```typescript
FeatureManager.has('privacy_cleaner')
```

No module should perform direct license or edition checks. The FeatureManager resolves the current license state to an edition and delegates to the `@avs/shared/featureFlags` registry.

## Interface

```typescript
interface IFeatureManager {
  has(feature: ManagedFeature): boolean;
  isHidden(feature: ManagedFeature): boolean;
  currentState(): LicenseState;
  currentEdition(): 'free' | 'pro' | 'enterprise' | 'trial';
}
```

## Managed Features

| Feature Key | Description | Free | Pro | Enterprise |
|-------------|-------------|------|-----|------------|
| `privacy_cleaner` | Clear traces from browsers | ✓ | ✓ | ✓ |
| `registry_cleaner` | Registry scan and repair | ✓ | ✓ | ✓ |
| `software_updater` | Check for outdated software | Future | Future | Future |
| `drive_wiper` | Secure drive wiping | Future | Future | Future |
| `scheduled_cleaning` | Automatic scheduled scans | ✗ | ✓ | ✓ |
| `advanced_startup` | Advanced startup management | ✓ | ✓ | ✓ |
| `history` | Operation history | Future | Future | Future |
| `junk_cleaner_basic` | Basic junk cleaning | ✓ | ✓ | ✓ |
| `junk_cleaner_deep` | Deep cache sweep | ✗ | ✓ | ✓ |
| `duplicate_finder` | Find duplicate files | ✗ | ✓ | ✓ |
| `disk_analyzer` | Disk usage visualization | ✓ | ✓ | ✓ |
| `performance_boost` | Performance tuning presets | ✗ | ✓ | ✓ |
| `multi_device_management` | Multi-device console | ✗ | ✗ | ✓ |
| `priority_support` | Priority support | ✗ | ✓ | ✓ |

## Usage

### Creating a FeatureManager

```typescript
import { createFeatureManager } from '@avs/licensing';

const featureManager = createFeatureManager({
  getState: () => licenseManager.getState(),
});

if (featureManager.has('privacy_cleaner')) {
  // Enable privacy cleaner feature
}
```

### With Overrides (Testing)

```typescript
const testFM = createFeatureManager({
  getState: () => 'annual',
  overrides: { duplicate_finder: false }, // Force disable for testing
});
```

### In React Components

```typescript
import { useLicense } from '../features/licensing/LicenseContext';

function MyComponent() {
  const { hasFeature } = useLicense();
  
  if (hasFeature('scheduled_cleaning')) {
    return <ScheduledCleaningUI />;
  }
  return <UpgradePrompt />;
}
```

## State-to-Edition Mapping

| License State | Edition |
|---------------|---------|
| free | free |
| trial | trial |
| monthly | pro |
| annual | pro |
| lifetime | pro |
| grace_period | pro |
| expired | free |
| invalid | free |
| revoked | free |

## Future Features

Features marked as "Future" (`software_updater`, `drive_wiper`, `history`) are defined in the `ManagedFeature` type but return `false` from `has()` until they are added to the `@avs/shared/featureFlags` FEATURES registry. This prevents accidental use before implementation is complete.
