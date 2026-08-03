import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL } from '@/lib/api-client';
import { sendVerificationEmail } from '@/lib/email-service';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { first_name, last_name, email, phone_number, password } = body;

    if (!first_name || !last_name || !email || !password) {
      return NextResponse.json(
        { detail: 'All required fields must be provided.' },
        { status: 400 },
      );
    }

    const resp = await fetch(`${API_BASE_URL}/api/customer/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, email, phone_number, password }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ detail: 'Registration failed' }));
      return NextResponse.json(errData, { status: resp.status });
    }

    const data = await resp.json();

    // Generate verification token and send email
    const verificationToken = generateVerificationToken();
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Store verification token on the license server
    try {
      await fetch(`${API_BASE_URL}/api/customer/verification-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: data.customer.id,
          token: verificationToken,
          expires_at: verificationExpiry,
        }),
      });
    } catch {
      // If token storage fails, we still return success —
      // the user can request a resend
    }

    // Send verification email
    try {
      await sendVerificationEmail({
        to: data.customer.email,
        name: `${data.customer.first_name} ${data.customer.last_name}`,
        token: verificationToken,
      });
    } catch {
      // Email sending failure is non-fatal — user can resend
    }

    return NextResponse.json({
      customer: data.customer,
      verification_required: true,
    });
  } catch {
    return NextResponse.json(
      { detail: 'Unable to connect to the AVS Shield server.' },
      { status: 503 },
    );
  }
}

function generateVerificationToken(): string {
  const array = new Uint8Array(48);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
