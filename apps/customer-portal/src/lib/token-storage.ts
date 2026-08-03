/**
 * Token storage — dual-mode session persistence.
 *
 * Browser-side: stores a lightweight session mirror in localStorage for
 * immediate UI state (display name, email, expiry). The actual access
 * and refresh tokens live in HTTPOnly cookies set by the /api/auth/*
 * route handlers, so they are never accessible to JavaScript.
 *
 * Server-side (Next.js API routes): uses cookies() from next/headers.
 */
import type { NextRequest } from 'next/server';
import { COOKIE_NAMES, SESSION_DURATIONS } from './cookie-config';

export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string;
  accountStatus: string;
  emailVerified: boolean;
  expiresAt: number; // epoch ms
  rememberMe: boolean;
}

const STORAGE_KEY = 'avs-portal-session';

/* ── Client-side mirror (non-sensitive metadata only) ─────────── */

export interface ClientMirror {
  customerId: string;
  customerName: string;
  customerEmail: string;
  accountStatus: string;
  emailVerified: boolean;
  expiresAt: number;
  rememberMe: boolean;
}

export const tokenStorage = {
  saveMirror(session: StoredSession): void {
    try {
      if (typeof window !== 'undefined') {
        const mirror: ClientMirror = {
          customerId: session.customerId,
          customerName: session.customerName,
          customerEmail: session.customerEmail,
          accountStatus: session.accountStatus,
          emailVerified: session.emailVerified,
          expiresAt: session.expiresAt,
          rememberMe: session.rememberMe,
        };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mirror));
      }
    } catch {
      // Storage unavailable
    }
  },

  loadMirror(): ClientMirror | null {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as ClientMirror;
    } catch {
      return null;
    }
  },

  clearMirror(): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  },

  isExpired(mirror: ClientMirror): boolean {
    return Date.now() >= mirror.expiresAt;
  },

  willExpireSoon(mirror: ClientMirror, thresholdMs = 5 * 60 * 1000): boolean {
    return Date.now() >= mirror.expiresAt - thresholdMs;
  },
};

/* ── Server-side cookie helpers (for API routes) ──────────────── */

export function setSessionCookies(
  response: Response,
  session: {
    accessToken: string;
    refreshToken: string | null;
    rememberMe: boolean;
  },
): void {
  const maxAge = session.rememberMe ? SESSION_DURATIONS.REMEMBER : SESSION_DURATIONS.SHORT;
  const isDev = process.env.NODE_ENV === 'development';
  const domain = isDev ? '' : `Domain=.avsshield.com; `;
  const secure = isDev ? '' : 'Secure; ';
  const sameSite = isDev ? 'Lax' : 'Strict';

  const accessCookie = `${COOKIE_NAMES.ACCESS_TOKEN}=${encodeURIComponent(session.accessToken)}; ${domain}Path=/; ${secure}HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;
  response.headers.append('Set-Cookie', accessCookie);

  if (session.refreshToken) {
    const refreshCookie = `${COOKIE_NAMES.REFRESH_TOKEN}=${encodeURIComponent(session.refreshToken)}; ${domain}Path=/; ${secure}HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}`;
    response.headers.append('Set-Cookie', refreshCookie);
  }

  // Remember-me flag (readable by JS to show/hide "Remember Me" checkbox)
  if (session.rememberMe) {
    const rememberCookie = `${COOKIE_NAMES.REMEMBER_ME}=1; ${domain}Path=/; ${secure}SameSite=${sameSite}; Max-Age=${maxAge}`;
    response.headers.append('Set-Cookie', rememberCookie);
  }
}

export function clearSessionCookies(response: Response): void {
  const isDev = process.env.NODE_ENV === 'development';
  const domain = isDev ? '' : `Domain=.avsshield.com; `;
  const secure = isDev ? '' : 'Secure; ';
  const sameSite = isDev ? 'Lax' : 'Strict';

  for (const name of Object.values(COOKIE_NAMES)) {
    response.headers.append(
      'Set-Cookie',
      `${name}=; ${domain}Path=/; ${secure}HttpOnly; SameSite=${sameSite}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  }
}

export function getTokensFromRequest(request: NextRequest): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  const accessToken = request.cookies.get(COOKIE_NAMES.ACCESS_TOKEN)?.value ?? null;
  const refreshToken = request.cookies.get(COOKIE_NAMES.REFRESH_TOKEN)?.value ?? null;
  return { accessToken, refreshToken };
}
