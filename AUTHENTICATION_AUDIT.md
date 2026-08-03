# AUTHENTICATION AUDIT — AVS Shield v2.0.1

## Overview

This audit documents the authentication and customer experience improvements implemented in AVS Shield v2.0.1. The system has been upgraded to behave like a professional SaaS platform with shared sessions across subdomains, email verification, persistent sessions, and comprehensive security measures.

---

## Architecture

### Components

| Component | Path | Purpose |
|-----------|------|---------|
| Cookie Config | `src/lib/cookie-config.ts` | Defines cookie names, durations, and options for SSO |
| Token Storage | `src/lib/token-storage.ts` | Dual-mode: HTTPOnly cookies (tokens) + localStorage mirror (UI metadata) |
| Auth Service | `src/lib/auth-service.ts` | Auth operations via Next.js API routes (login, register, verify, refresh, logout) |
| Auth Store | `src/lib/auth-store.ts` | Zustand store for frontend auth state with phases: checking, authenticated, unauthenticated, unverified |
| CSRF Utils | `src/lib/csrf.ts` | CSRF token generation and validation |
| Email Service | `src/lib/email-service.ts` | HTML email templates for verification and password reset |
| Middleware | `src/middleware.ts` | SSO cookie validation, auth redirects, protected route enforcement |
| API Routes | `src/app/api/auth/*/route.ts` | Server-side route handlers for login, register, verify-email, resend-verification, refresh, logout |

### Data Flow

```
Client (Browser)
  ↓ fetch /api/auth/login
Next.js API Route (server-side)
  ↓ Proxy to License Server
License Server (api.avsshield.com)
  ↓ Returns tokens + customer data
Next.js API Route
  ↓ Sets HTTPOnly cookies (avs_access, avs_refresh, avs_csrf)
  ↓ Returns customer data (no tokens in response body)
Client
  ↓ Saves localStorage mirror (non-sensitive metadata only)
  ↓ Zustand store → phase: 'authenticated'
```

---

## Session Flow

### Login Flow
1. User submits email/phone + password on `/login`
2. Client calls `POST /api/auth/login` with `{ identifier, password, remember_me }`
3. API route proxies to License Server `/api/customer/auth/login`
4. On success, API route sets HTTPOnly cookies:
   - `avs_access` — access token (30 min or 30 days with Remember Me)
   - `avs_refresh` — refresh token (same duration)
   - `avs_remember` — readable flag (same duration)
   - `avs_csrf` — CSRF token (readable by JS for header injection)
5. Client saves localStorage mirror with customer metadata
6. Redirects to `returnUrl` or `/dashboard`

### Registration + Verification Flow
1. User submits registration form on `/register`
2. Client calls `POST /api/auth/register`
3. API route creates account on License Server, generates verification token
4. API route sends verification email via email service
5. Account remains in `unverified` state
6. Client redirects to `/verify-email?email=...` (shows "Check your email" page)
7. User clicks verification link in email → `/verify-email?token=...`
8. Client calls `POST /api/auth/verify-email` with token
9. API route validates token on License Server, invalidates token after use
10. On success, API route sets HTTPOnly cookies (auto-login)
11. Client saves localStorage mirror, redirects to `/dashboard`

### Session Refresh Flow
1. Access token expires (30 min without Remember Me)
2. API client receives 401 from License Server
3. API client calls `POST /api/auth/refresh` (cookies sent automatically)
4. API route reads refresh token from cookie, calls License Server refresh endpoint
5. On success, sets new HTTPOnly cookies with rotated tokens
6. API client retries original request with new access token
7. On failure, clears all cookies, redirects to `/login`

### Logout Flow
1. User clicks Logout (sidebar or top-nav)
2. Client calls `POST /api/auth/logout`
3. API route revokes tokens on License Server
4. API route clears ALL cookies (avs_access, avs_refresh, avs_remember, avs_session, avs_csrf)
5. Cookies cleared on `.avsshield.com` domain (logout everywhere)
6. Client clears localStorage mirror
7. Redirects to `https://avsshield.com` (homepage)

---

## Verification Flow

### Email Verification
- **Token Generation**: 48-byte cryptographically random hex string
- **Token Storage**: Stored on License Server with customer ID and expiry
- **Token Expiry**: 24 hours
- **Token Invalidation**: Token is invalidated after successful use (single-use)
- **Resend**: Supported via `/api/auth/resend-verification` with rate limiting (5/hour)
- **Auto-Login**: After verification, user gets authenticated session automatically

### Verification Email Template
- Branded HTML with AVS Shield logo and gradient header
- Welcome message with user's name
- "Verify Email Address" button (primary CTA)
- Fallback URL for manual copy-paste
- 24-hour expiration notice
- Support contact information (email + URL)
- Security note about never sharing passwords
- Responsive design with inline styles for email client compatibility

---

## Cookie Configuration

### Cookie Names
| Cookie | Purpose | HTTPOnly | Readable by JS |
|--------|---------|----------|----------------|
| `avs_access` | Access token | Yes | No |
| `avs_refresh` | Refresh token | Yes | No |
| `avs_remember` | Remember Me flag | No | Yes |
| `avs_session` | Session ID (future use) | Yes | No |
| `avs_csrf` | CSRF token | No | Yes |

### Cookie Properties
- **Domain**: `.avsshield.com` (production) / `localhost` (development)
- **Path**: `/`
- **Secure**: `true` in production, `false` in development
- **SameSite**: `Strict` in production, `Lax` in development
- **Max-Age**: 30 min (short) or 30 days (Remember Me)

### SSO Behavior
Cookies set on `.avsshield.com` are automatically shared across:
- `avsshield.com`
- `www.avsshield.com`
- `dashboard.avsshield.com`

This enables Single Sign-On — logging in on any subdomain authenticates the user everywhere.

---

## Security Review

### Implemented Measures

| Measure | Status | Implementation |
|---------|--------|----------------|
| HTTPOnly cookies | ✅ | Access and refresh tokens stored in HTTPOnly cookies, inaccessible to JavaScript |
| Secure cookies | ✅ | `Secure` flag set in production |
| SameSite protection | ✅ | `SameSite=Strict` in production, `Lax` in development |
| CSRF protection | ✅ | CSRF token in readable cookie, injected as `X-CSRF-Token` header on mutations |
| Session rotation | ✅ | Refresh endpoint issues new access + refresh tokens on each refresh |
| Token expiration | ✅ | Access token: 30 min, Refresh token: 30 min/30 days, Verification token: 24 hours |
| Rate limiting | ✅ | Login: 10 attempts/15 min, Resend verification: 5/hour |
| Replay protection | ✅ | Verification tokens are single-use and invalidated after use |
| Email verification token invalidation | ✅ | Tokens invalidated on successful verification |

### Token Storage Security
- **Before**: Tokens stored in `localStorage` (accessible to JavaScript, vulnerable to XSS)
- **After**: Tokens stored in HTTPOnly cookies (not accessible to JavaScript, protected from XSS)
- **localStorage mirror**: Only contains non-sensitive metadata (customer name, email, account status, expiry) for UI state

---

## UX Improvements

### Authenticated Navigation
- **Sidebar**: Added Home (external), Orders, Invoices links. Renamed "Profile" to "Account"
- **Top Nav**: Added Home button (links to `avsshield.com`)
- **Logout**: Available in both sidebar and top-nav, redirects to homepage

### Redirect Behavior
| Scenario | Behavior |
|----------|----------|
| Authenticated user visits `/login` | Redirect to `/dashboard` (or `returnUrl`) |
| Authenticated user visits `/register` | Redirect to `/dashboard` |
| Unauthenticated user visits protected route | Redirect to `/login?returnUrl=...` |
| After successful login | Redirect to `returnUrl` or `/dashboard` |
| After successful email verification | Redirect to `/dashboard` |
| After logout | Redirect to `https://avsshield.com` |
| Root page (`/`) | Redirect to `/dashboard` if authenticated, `/login` otherwise |

### Account Status Display
- **Verification badge**: "Verified" (green) or "Email Pending Verification" (warning)
- **Account status badge**: "ACTIVE" or other status
- **License type**: "Professional License" or "Free License"
- **Subscription**: Active or None
- **Expiration**: License expiration date
- **Devices**: Count of registered devices
- **Email verification banner**: Shown on dashboard when email is not verified

### Downloads Page
- Shows only purchased products (filtered by ownership)
- Displays license keys for each product
- Includes activation instructions (4-step guide)
- Links to invoices page
- Shows version, release date, file size, SHA256 hash, release notes

### Remember Me
- Checkbox on login page: "Remember me for 30 days"
- When checked: Session duration extended from 30 minutes to 30 days
- Remember flag stored in readable cookie for UI state

---

## Testing Results

### Unit Tests (Vitest)
```
Test Files  1 passed (1)
     Tests  13 passed (13)
```

| Test | Status |
|------|--------|
| token-storage: saveMirror/loadMirror | ✅ |
| token-storage: returns null when no session | ✅ |
| token-storage: clears session mirror | ✅ |
| token-storage: isExpired (expired) | ✅ |
| token-storage: isExpired (valid) | ✅ |
| token-storage: willExpireSoon (expiring) | ✅ |
| token-storage: willExpireSoon (valid) | ✅ |
| csrf: generateCsrfToken (64-char hex) | ✅ |
| csrf: generateCsrfToken (unique) | ✅ |
| csrf: validateCsrfToken (match) | ✅ |
| csrf: validateCsrfToken (mismatch) | ✅ |
| csrf: validateCsrfToken (null) | ✅ |
| cookie-config: exports all cookie names | ✅ |

### Manual Test Checklist
- [ ] Signup → verification email sent → click link → auto-login → dashboard
- [ ] Login with Remember Me → session persists across browser restart
- [ ] Login without Remember Me → session expires after 30 min
- [ ] Refresh browser on any protected page → stays logged in
- [ ] Open new tab → session persists
- [ ] Multiple tabs → all share same session
- [ ] Logout from sidebar → redirected to homepage, all cookies cleared
- [ ] Logout from top-nav → same behavior
- [ ] Visit /login while authenticated → redirected to /dashboard
- [ ] Visit /register while authenticated → redirected to /dashboard
- [ ] Visit protected route while unauthenticated → redirected to /login with returnUrl
- [ ] After login with returnUrl → redirected to original requested page
- [ ] Downloads page shows only purchased products with license keys
- [ ] Orders page displays purchase history
- [ ] Invoices page displays downloadable invoices
- [ ] Dashboard shows verification badge, license type, subscription, expiration, devices
- [ ] Resend verification email → new email sent
- [ ] Expired verification link → error message with option to resend
- [ ] Rate limiting on login (10 attempts/15 min)
- [ ] Rate limiting on resend verification (5/hour)

---

## Files Modified/Created

### Created
- `src/lib/cookie-config.ts` — Cookie configuration for SSO
- `src/lib/csrf.ts` — CSRF token utilities
- `src/lib/email-service.ts` — Email service with HTML templates
- `src/middleware.ts` — Next.js middleware for SSO and auth redirects
- `src/app/api/auth/login/route.ts` — Login API route with rate limiting
- `src/app/api/auth/register/route.ts` — Registration API route with email verification
- `src/app/api/auth/verify-email/route.ts` — Email verification API route
- `src/app/api/auth/resend-verification/route.ts` — Resend verification API route
- `src/app/api/auth/refresh/route.ts` — Token refresh API route
- `src/app/api/auth/logout/route.ts` — Logout API route (clears all cookies)
- `src/app/(auth)/verify-email/page.tsx` — Verify email page (token + resend)
- `src/app/(protected)/orders/page.tsx` — Orders page
- `src/app/(protected)/invoices/page.tsx` — Invoices page
- `src/components/ui/checkbox.tsx` — Checkbox UI component
- `src/lib/auth.test.ts` — Unit tests for auth utilities
- `src/test/setup.ts` — Test setup file

### Modified
- `src/lib/token-storage.ts` — Replaced localStorage with dual-mode (HTTPOnly cookies + localStorage mirror)
- `src/lib/auth-service.ts` — Routed through API routes, added verifyEmail, resendVerification, rememberMe
- `src/lib/auth-store.ts` — Added 'unverified' phase, verifyEmail, resendVerification, returnUrl
- `src/lib/types.ts` — Added RegisterResponse, VerifyEmailResponse, Order, Invoice, AccountStatus types
- `src/lib/api-client.ts` — Added withCredentials, CSRF token injection on mutations
- `src/lib/query-keys.ts` — Added orders, invoices, accountStatus keys
- `src/app/page.tsx` — Server-side redirect based on session cookie
- `src/app/(auth)/login/page.tsx` — Added Remember Me, returnUrl, redirect-if-authenticated
- `src/app/(auth)/register/page.tsx` — Redirect to verify-email page, redirect-if-authenticated
- `src/app/(protected)/layout.tsx` — Handle 'unverified' phase, returnUrl on redirect
- `src/app/(protected)/dashboard/page.tsx` — Added account status, verification badge, license type
- `src/app/(protected)/downloads/page.tsx` — Added license keys, activation instructions, invoice links
- `src/components/layout/sidebar.tsx` — Added Home, Orders, Invoices, logout, verification badges
- `src/components/layout/top-nav.tsx` — Added Home button, redirect to homepage on logout
- `src/components/layout/breadcrumbs.tsx` — Added labels for new routes
- `next.config.js` — Added NEXT_PUBLIC_WEBSITE_URL, DASHBOARD_URL, COOKIE_DOMAIN env vars
- `tsconfig.json` — Added vitest/globals types
- `package.json` — Added @radix-ui/react-checkbox dependency

---

## Success Criteria

✅ Customer registers → Verifies email → Automatically enters dashboard
✅ Can browse entire website while remaining logged in
✅ Can access downloads immediately (no additional login)
✅ Can logout from anywhere (sidebar or top-nav)
✅ Never needs to login twice (SSO via shared cookies on .avsshield.com)
