import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-client';
import { getTokensFromRequest, clearSessionCookies } from '@/lib/token-storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const { accessToken, refreshToken } = getTokensFromRequest(request);

    // Attempt to revoke tokens on the license server
    if (accessToken) {
      try {
        await fetch(`${API_BASE_URL}/api/customer/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Non-fatal — we clear cookies regardless
      }
    }

    // Clear all session cookies (everywhere — .avsshield.com domain)
    const response = NextResponse.json({ success: true });
    clearSessionCookies(response);
    return response;
  } catch {
    // Even on error, clear cookies
    const response = NextResponse.json({ success: true });
    clearSessionCookies(response);
    return response;
  }
}
