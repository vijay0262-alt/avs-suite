import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-client';
import { setSessionCookies } from '@/lib/token-storage';
import { generateCsrfToken } from '@/lib/csrf';

export const runtime = 'nodejs';

// Simple in-memory rate limiting for login attempts
const loginAttempts = new Map<string, { count: number; firstAt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max 10 attempts per window

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for') ?? 'unknown';
    const now = Date.now();
    const attempts = loginAttempts.get(clientIp);
    if (attempts && now - attempts.firstAt < RATE_LIMIT_WINDOW) {
      if (attempts.count >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          { detail: 'Too many login attempts. Please try again later.' },
          { status: 429 },
        );
      }
      attempts.count++;
    } else {
      loginAttempts.set(clientIp, { count: 1, firstAt: now });
    }

    const body = await request.json();
    const { identifier, password, remember_me } = body;

    if (!identifier || !password) {
      return NextResponse.json(
        { detail: 'Email/phone and password are required.' },
        { status: 400 },
      );
    }

    const resp = await fetch(`${API_BASE_URL}/api/customer/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ detail: 'Login failed' }));
      return NextResponse.json(errData, { status: resp.status });
    }

    const data = await resp.json();

    // Set HTTPOnly cookies for SSO
    const response = NextResponse.json(data);
    setSessionCookies(response, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      rememberMe: remember_me ?? false,
    });

    // Set CSRF token cookie (readable by JS, used in headers for mutations)
    const csrfToken = generateCsrfToken();
    const isDev = process.env.NODE_ENV === 'development';
    const domain = isDev ? '' : `Domain=.avsshield.com; `;
    const secure = isDev ? '' : 'Secure; ';
    response.headers.append(
      'Set-Cookie',
      `avs_csrf=${csrfToken}; ${domain}Path=/; ${secure}SameSite=${isDev ? 'Lax' : 'Strict'}; Max-Age=${remember_me ? 30 * 24 * 60 * 60 : 30 * 60}`,
    );

    return response;
  } catch {
    return NextResponse.json(
      { detail: 'Unable to connect to the AVS AI Shield server.' },
      { status: 503 },
    );
  }
}
