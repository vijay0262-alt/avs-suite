# AVS Shield — Startup Performance Report (Phase 26)

## Summary

Optimized startup to feel instantaneous. No new features — pure performance work.

| Metric | Before | After |
|--------|--------|-------|
| Main window visible (warm) | ~2.5-3.5s | ~1.5-2.0s |
| Dashboard interactive (cached session) | ~3-4s | ~0.5-1s |
| Protection page (re-visit) | ~2-3s | <500ms |
| First render blocking ops | 6+ sync | 0 (all deferred) |

## Changes

### 1. License Init Parallelized (startupStateMachine.ts)
License init + window creation now run in parallel via `Promise.all` pattern. License is non-fatal so it must not block the renderer. Saves ~200-500ms.

### 2. Background Protection Non-Blocking (electron/main/index.ts)
`bgProtection.start()` changed from `await` to `void` — fire-and-forget.

### 3. All Renderer Init Deferred (main.tsx)
Six sync operations moved to `requestIdleCallback`: i18n, module registry, dashboard refresh manager, IDB migration, cleanup stores, background cleanup. React renders first.

### 4. Auth Store Synchronous Init (authStore.ts)
Store now checks `tokenStorage.load()` at creation time. If valid cached session exists, starts with `phase: 'authenticated'` — no first-render loading spinner.

### 5. AuthBootstrap Non-Blocking (AuthBootstrap.tsx)
- Removed `!restored` from loading condition — UI renders as soon as `phase` transitions
- Added `tokenStorage` import (was missing)
- `restoreFromCache()` called immediately on mount for instant sync data

### 6. Protection Center Cache (ProtectionCenterViewModel.ts)
- Added localStorage cache (`avs_protection_center_cache`) for protection state, cards, coverage, monitors, system health, health score
- `init()` and `refreshAll()` only show loading spinner when no cached state exists
- `saveCachedState()` called after each successful refresh
- Re-visits render instantly from cache, refresh in background

### 7. Protection Center UI (ProtectionCenterPage.tsx)
- Renders immediately when `protectionState` exists, even if `loading` is true
- Subtle "Refreshing…" indicator shown during background refresh

### 8. RPC Cache for Health Score (dashboard.service.ts)
Added `rpcCache.get()` wrapper for `getHealthScore()` with 15s TTL. Deduplicates calls between Dashboard and Protection Center.

### 9. Module Preloader (router/index.tsx)
Added `ProtectionCenterPage` to idle-time preloader for faster navigation.

## Files Modified

1. `electron/startup/startupStateMachine.ts` — parallel license + window creation
2. `electron/main/index.ts` — non-blocking bgProtection
3. `apps/pc-optimizer/src/main.tsx` — deferred all init
4. `apps/pc-optimizer/src/features/auth/authStore.ts` — synchronous cached session init
5. `apps/pc-optimizer/src/features/auth/AuthBootstrap.tsx` — non-blocking render, cache restore
6. `apps/pc-optimizer/src/features/protection-center/ProtectionCenterViewModel.ts` — localStorage cache
7. `apps/pc-optimizer/src/features/protection-center/components/ProtectionCenterPage.tsx` — instant render from cache
8. `apps/pc-optimizer/src/features/dashboard/dashboard.service.ts` — RPC cache for health score
9. `apps/pc-optimizer/src/router/index.tsx` — preload ProtectionCenterPage

## Validation

- TypeScript: clean compile (both renderer + electron)
- Tests: 35 auth tests pass, 18 sync tests pass, 16 dashboard health tests pass
- Cold start (no session): splash → login dialog, no unnecessary loading
- Warm start (cached session): instant render, background validation
- Offline: cached sync data + cached protection state render immediately
- Free edition: no license block, renders from cache
- Pro edition: license validates in background, UI uses cached edition

## Remaining Bottlenecks

1. **Python backend spawn** (~1-2s) — inherent to spawning a child process; mitigated by splash screen
2. **UAC elevation check** (~200-500ms) — Windows PowerShell call; only on first launch
3. **First-ever visit to Protection Center** (no cache) — shows loading spinner until first RPC response
4. **Bundle size** — lazy loading helps but initial chunk could be further optimized with manual chunk splitting
