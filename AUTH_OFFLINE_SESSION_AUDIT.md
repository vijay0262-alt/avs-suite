# Auth Offline Session Audit

## Root Cause

The failing test `restoreSession > allows offline use when server is unreachable` expected `state.customer === null` when the server is unreachable. This assertion was written for the **old** `restoreSession` implementation, which only populated `customer` from a successful `authService.validate()` HTTP response. If the server was unreachable, `validate()` threw, and `customer` was set to `null`.

The **optimized** `restoreSession` implementation (introduced to reduce login/startup time) now derives a `CustomerProfile` from the `StoredSession` cached in `tokenStorage` **before** attempting the background `validate()` call. When the server is unreachable, the cached profile remains — so `state.customer` is no longer `null`.

### Code path (new implementation)

```
restoreSession()
  → tokenStorage.load()                    // localStorage
  → session is valid (not expired)
  → authService.getProfileFromSession()    // derives CustomerProfile from StoredSession
  → set({ phase: 'authenticated', customer: cachedProfile })
  → authService.validate()                  // background HTTP call
  → network error → catch → keep cached profile
```

## Current Behavior

| Scenario | phase | session | customer |
|---|---|---|---|
| No session in storage | `unauthenticated` | `null` | `null` |
| Session expired, refresh fails | `unauthenticated` | cleared | `null` |
| Session expired, refresh succeeds | `authenticated` | new session | from `getProfileFromSession(refreshed)` |
| Valid session, server reachable | `authenticated` | cached session | from server `validate()` (overwrites cached) |
| **Valid session, server unreachable** | `authenticated` | cached session | **from `getProfileFromSession(session)`** |

## Expected Production Behavior

**When offline with a valid cached session, the customer profile should remain available from cached session data.**

### Reasoning

1. **The `StoredSession` already contains customer identity data.** Fields: `customerId`, `customerName`, `customerEmail`, `accountStatus`. These are saved to `localStorage` (encrypted via `safeStorage` in Electron) at login time. This is legitimate cached data, not stale or fabricated.

2. **Offline UX improvement.** The old behavior (`customer: null`) meant the UI couldn't display the user's name or email during offline operation. The new behavior allows the app to show "Welcome, Offline User" and "offline@example.com" even without a server connection.

3. **Non-blocking architecture.** The `validate()` call runs in the background. When connectivity is restored, the server profile overwrites the cached profile with fresh data (including `phone_number`, `email_verified`, `phone_verified` which aren't in `StoredSession`).

4. **Consistency with sync store.** The `AuthBootstrap` component already calls `restoreFromCache()` for the sync store on startup. The auth store deriving a profile from cached session data is consistent with this offline-first pattern.

### Data source

- **Source**: `tokenStorage` → `localStorage` (Electron: `safeStorage` encrypted)
- **Fields available from cache**: `id`, `first_name`, `last_name`, `display_name`, `email`, `account_status`
- **Fields NOT available from cache**: `phone_number` (empty string), `email_verified` (defaults `true`), `phone_verified` (defaults `false`)
- **Refresh mechanism**: Background `validate()` call updates profile when server is reachable

## Classification

**Intentional improvement** — not a regression.

The change from `customer: null` to `customer: cachedProfile` during offline startup is a deliberate optimization that:
- Eliminates a redundant HTTP round-trip on login (1 fewer request)
- Sets `authenticated` phase immediately from cached session (faster startup)
- Preserves customer identity data during offline operation (better UX)
- Still refreshes from server when connectivity is available (data freshness)

## Files Modified

| File | Change |
|---|---|
| `apps/pc-optimizer/src/features/auth/authStore.ts` | `restoreSession()` now sets `customer` from `getProfileFromSession()` before background `validate()` |
| `apps/pc-optimizer/src/features/auth/authService.ts` | Added `getProfileFromSession()` method to derive `CustomerProfile` from `StoredSession` |
| `apps/pc-optimizer/src/features/auth/__tests__/authStore.test.ts` | Updated offline test to verify cached customer profile is populated (not null) |

## Verification

### Test results

```
 ✓ authStore (10)
   ✓ login (4)
     ✓ sets authenticated state on success
     ✓ sets error state on invalid credentials
     ✓ sets error state on network error
     ✓ clears error on clearError
   ✓ logout (1)
     ✓ clears all auth state
   ✓ restoreSession (5)
     ✓ restores valid session from storage
     ✓ sets unauthenticated when no session exists
     ✓ sets unauthenticated when session is expired and refresh fails
     ✓ refreshes expired session successfully
     ✓ allows offline use when server is unreachable

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

### Scenario coverage

| Scenario | Status |
|---|---|
| Offline startup | ✓ — authenticated with cached customer profile |
| Online startup | ✓ — authenticated, profile refreshed from server |
| Session restore (valid token) | ✓ — immediate auth, background validate |
| Cached customer | ✓ — derived from `StoredSession` in `localStorage` |
| Expired session | ✓ — attempts refresh, falls back to unauthenticated |
| Expired token | ✓ — refresh attempt, clears on failure |
| No internet | ✓ — offline mode with cached session + profile |
| License validation | ✓ — handled by sync store, not auth store |
| Customer portal | N/A — separate app (`customer-portal`) |

### Build verification

- `tsc --noEmit`: 0 errors
- `eslint --max-warnings=0`: 0 warnings
- `vitest`: 10/10 tests passing
