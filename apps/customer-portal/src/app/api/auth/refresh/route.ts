import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-client';
import { getTokensFromRequest, setSessionCookies, clearSessionCookies } from '@/lib/token-storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { accessToken, refreshToken } = getTokensFromRequest(request);

    if (!refreshToken) {
      return NextResponse.json(
        { detail: 'No refresh token available.' },
        { status: 401 },
      );
    }

    const resp = await fetch(`${API_BASE_URL}/api/customer/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!resp.ok) {
      // Clear cookies on refresh failure
      const response = NextResponse.json(
        { detail: 'Session expired. Please log in again.' },
        { status: 401 },
      );
      clearSessionCookies(response);
      return response;
    }

    const data = await resp.json();

    // Refresh the cookies with new tokens
    const response = NextResponse.json(data);
    const rememberMe = request.cookies.get('avs_remember')?.value === '1';
    setSessionCookies(response, {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      rememberMe,
    });

    return response;
  } catch {
    return NextResponse.json(
      { detail: 'Unable to connect to the AVS AI Shield server.' },
      { status: 503 },
    );
  }
}
