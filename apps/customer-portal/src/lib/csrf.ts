/**
 * CSRF token generation and validation.
 *
 * The CSRF token is stored in a readable cookie (avs_csrf) and must
 * be sent as the X-CSRF-Token header on all state-changing requests
 * (POST, PUT, DELETE). The API routes validate this header against
 * the cookie value to prevent cross-site request forgery.
 */

export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function validateCsrfToken(headerToken: string | null, cookieToken: string | null): boolean {
  if (!headerToken || !cookieToken) return false;
  return headerToken === cookieToken;
}
