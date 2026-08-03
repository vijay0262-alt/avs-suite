/**
 * Cookie configuration — shared session cookie settings for SSO
 * across avsshield.com subdomains.
 *
 * Cookies are set on `.avsshield.com` so they are shared between:
 *   - avsshield.com
 *   - www.avsshield.com
 *   - dashboard.avsshield.com
 *
 * In development (localhost), cookies are set on localhost with
 * SameSite=Lax since cross-origin is not needed.
 */

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain?: string;
  path: string;
  maxAge?: number;
  expires?: Date;
}

const IS_DEV = process.env.NODE_ENV === 'development';
const COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? (IS_DEV ? undefined : '.avsshield.com');

export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'avs_access',
  REFRESH_TOKEN: 'avs_refresh',
  REMEMBER_ME: 'avs_remember',
  SESSION_ID: 'avs_session',
  CSRF_TOKEN: 'avs_csrf',
} as const;

export const SESSION_DURATIONS = {
  SHORT: 30 * 60,
  REMEMBER: 30 * 24 * 60 * 60,
  VERIFICATION_TOKEN: 24 * 60 * 60,
} as const;

export function getCookieOptions(maxAge: number, httpOnly = true): CookieOptions {
  return {
    httpOnly,
    secure: !IS_DEV,
    sameSite: IS_DEV ? 'lax' : 'strict',
    domain: COOKIE_DOMAIN,
    path: '/',
    maxAge,
  };
}

export function getReadableCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: false,
    secure: !IS_DEV,
    sameSite: IS_DEV ? 'lax' : 'strict',
    domain: COOKIE_DOMAIN,
    path: '/',
    maxAge,
  };
}
