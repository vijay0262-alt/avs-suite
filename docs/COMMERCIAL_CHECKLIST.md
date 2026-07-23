# AVS PC Optimizer — Commercial Release Checklist

**Version 1.0.0** | Build 1001 | Date: 2026-07-23

---

## Version & Branding

- [x] Centralized version system (`src/config/version.ts`)
- [x] Version: 1.0.0
- [x] Build Number: 1001
- [x] Release Channel: Stable
- [x] Architecture: x64
- [x] Edition: Free
- [x] Application name consistent across TitleBar, Sidebar, splash, installer
- [x] Publisher: Advanced Vision Software LLC
- [x] Copyright: © 2024-2026 Advanced Vision Software LLC
- [x] `package.json` version updated to 1.0.0
- [x] `APP_METADATA` constants updated with correct vendor and copyright

## Edition Framework

- [x] Edition Manager (`src/config/EditionManager.tsx`)
- [x] Free / Pro / Enterprise editions defined
- [x] Feature flag registry in `@avs/shared/featureFlags`
- [x] `isFeatureEnabled()` predicate for capability checking
- [x] `shouldHideFeature()` for hard-gated features
- [x] No hardcoded edition checks in feature modules
- [x] `NullLicensingService` placeholder in `@avs/licensing`
- [x] Edition context wraps app in `main.tsx`

## Upgrade Experience

- [x] Reusable Upgrade Dialog (`src/components/UpgradeDialog.tsx`)
- [x] Pro benefits list
- [x] Feature comparison table (Free vs Pro)
- [x] Upgrade, Learn More, Continue with Free buttons
- [x] `UpgradeDialogProvider` wraps app in `main.tsx`
- [x] `useUpgradeDialog()` hook for programmatic access
- [x] `useFeatureGate()` hook for feature gating
- [x] Upgrade button in Settings page

## About Window

- [x] Professional About page (`src/pages/AboutPage.tsx`)
- [x] Logo / brand mark
- [x] Version, Build, Channel, Release Date, Architecture, Edition
- [x] Publisher, Website, Support email
- [x] Copyright notice
- [x] Check for Updates button
- [x] Privacy Policy link
- [x] Terms of Service link
- [x] EULA link
- [x] Open Source Licenses link

## Update Framework

- [x] Update Manager hook (`src/config/updateManager.ts`)
- [x] `IUpdateService` interface in `@avs/updater`
- [x] `NullUpdateService` placeholder
- [x] `UPDATE_CONFIG` with feed/download/changelog URLs
- [x] Auto-update disabled (manual check only)
- [x] Update status display in About page
- [x] Update preferences in Settings page

## Settings

- [x] Application Edition section
- [x] Version section (version, build, channel)
- [x] Update Preferences section
- [x] Telemetry section (disabled, future)
- [x] License section (edition-aware)
- [x] Existing settings (Appearance, Language, Developer) unchanged

## Documentation

- [x] USER_GUIDE.md
- [x] INSTALLATION_GUIDE.md
- [x] RELEASE_NOTES.md
- [x] CHANGELOG.md
- [x] KNOWN_LIMITATIONS.md
- [x] COMMERCIAL_CHECKLIST.md (this file)

## Legal & Privacy

- [x] Privacy Policy placeholder
- [x] Terms of Service placeholder
- [x] EULA placeholder
- [x] Open Source Licenses placeholder
- [x] Third-party acknowledgements
- [x] Support information

## Release Verification

- [x] Frontend builds successfully (`vite build`)
- [x] No TypeScript errors in new files
- [x] No backend modifications
- [x] No RPC changes
- [x] No existing module modifications (except SettingsPage additions)
- [x] Existing functionality unchanged
- [x] Dashboard unchanged
- [x] Health engine unchanged
- [x] No performance regressions

## Pending (Future Sprints)

- [ ] License key activation
- [ ] Payment processing integration
- [ ] Automatic update checking
- [ ] Telemetry implementation
- [ ] Additional language support
- [ ] Code signing
- [ ] MSI installer for enterprise deployment
