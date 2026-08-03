import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-client';
import { setSessionCookies } from '@/lib/token-storage';
import { generateCsrfToken } from '@/lib/csrf';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { detail: 'Verification token is required.' },
        { status: 400 },
      );
    }

    // Validate token and verify email on the license server
    const resp = await fetch(`${API_BASE_URL}/api/customer/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ detail: 'Verification failed' }));
      return NextResponse.json(errData, { status: resp.status });
    }

    const data = await resp.json();

    // If the server returned tokens, set cookies for auto-login
    if (data.access_token) {
      const response = NextResponse.json(data);
      setSessionCookies(response, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        rememberMe: true,
      });

      // Set CSRF token
      const csrfToken = generateCsrfToken();
      const isDev = process.env.NODE_ENV === 'development';
      const domain = isDev ? '' : `Domain=.avsshield.com; `;
      const secure = isDev ? '' : 'Secure; ';
      response.headers.append(
        'Set-Cookie',
        `avs_csrf=${csrfToken}; ${domain}Path=/; ${secure}SameSite=${isDev ? 'Lax' : 'Strict'}; Max-Age=${30 * 24 * 60 * 60}`,
      );

      return response;
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { detail: 'Unable to connect to the AVS Shield server.' },
      { status: 503 },
    );
  }
}
