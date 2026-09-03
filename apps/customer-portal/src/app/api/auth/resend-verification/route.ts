import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-client';
import { sendVerificationEmail } from '@/lib/email-service';

export const runtime = 'nodejs';

// Simple in-memory rate limiting (per email, per IP)
const resendAttempts = new Map<string, { count: number; firstAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { detail: 'Email address is required.' },
        { status: 400 },
      );
    }

    // Rate limiting
    const clientIp = request.headers.get('x-forwarded-for') ?? 'unknown';
    const rateKey = `${email}:${clientIp}`;
    const now = Date.now();
    const attempts = resendAttempts.get(rateKey);
    if (attempts && now - attempts.firstAt < RATE_LIMIT_WINDOW) {
      if (attempts.count >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          { detail: 'Too many verification email requests. Please try again later.' },
          { status: 429 },
        );
      }
      attempts.count++;
    } else {
      resendAttempts.set(rateKey, { count: 1, firstAt: now });
    }

    // Request new verification token from license server
    const resp = await fetch(`${API_BASE_URL}/api/customer/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ detail: 'Failed to resend verification email' }));
      return NextResponse.json(errData, { status: resp.status });
    }

    const data = await resp.json();

    // Send verification email if the server returned a token
    if (data.verification_token && data.customer) {
      try {
        await sendVerificationEmail({
          to: data.customer.email ?? email,
          name: data.customer.first_name
            ? `${data.customer.first_name} ${data.customer.last_name ?? ''}`
            : email,
          token: data.verification_token,
        });
      } catch {
        // Non-fatal
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { detail: 'Unable to connect to the AVS AI Shield server.' },
      { status: 503 },
    );
  }
}
