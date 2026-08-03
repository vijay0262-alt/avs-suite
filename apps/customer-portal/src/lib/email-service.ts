/**
 * Email service — sends transactional emails via the AVS Shield
 * email provider (configured via AVS_EMAIL_PROVIDER env var).
 *
 * Supports:
 *   - Email verification
 *   - Password reset
 *
 * The HTML template is designed to match the AVS Shield brand:
 *   - Logo
 *   - Welcome message
 *   - Verify button
 *   - Fallback URL
 *   - Expiration notice
 *   - Support information
 *   - Security note
 */

const VERIFICATION_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
  'https://dashboard.avsshield.com';

const SUPPORT_EMAIL = process.env.AVS_SUPPORT_EMAIL ?? 'support@avsshield.com';
const SUPPORT_URL = process.env.AVS_SUPPORT_URL ?? 'https://avsshield.com/support';

interface VerificationEmailParams {
  to: string;
  name: string;
  token: string;
}

export async function sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
  const verifyUrl = `${VERIFICATION_BASE_URL}/verify-email?token=${params.token}`;
  const expiryHours = 24;

  const html = renderVerificationEmail({
    name: params.name,
    verifyUrl,
    expiryHours,
    supportEmail: SUPPORT_EMAIL,
    supportUrl: SUPPORT_URL,
  });

  const text = `Welcome to AVS Shield!

Hi ${params.name},

Please verify your email address by clicking the link below:
${verifyUrl}

This link will expire in ${expiryHours} hours.

If you didn't create an account, please ignore this email.

Need help? Contact us at ${SUPPORT_EMAIL}

— AVS Shield Team`;

  await sendEmail({
    to: params.to,
    subject: 'Verify your AVS Shield email address',
    html,
    text,
  });
}

interface PasswordResetEmailParams {
  to: string;
  name: string;
  token: string;
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const resetUrl = `${VERIFICATION_BASE_URL}/reset-password?token=${params.token}`;
  const expiryHours = 1;

  const html = renderPasswordResetEmail({
    name: params.name,
    resetUrl,
    expiryHours,
    supportEmail: SUPPORT_EMAIL,
    supportUrl: SUPPORT_URL,
  });

  const text = `Reset your AVS Shield password

Hi ${params.name},

Click the link below to reset your password:
${resetUrl}

This link will expire in ${expiryHours} hour(s).

If you didn't request a password reset, please ignore this email and your password will remain unchanged.

Need help? Contact us at ${SUPPORT_EMAIL}

— AVS Shield Team`;

  await sendEmail({
    to: params.to,
    subject: 'Reset your AVS Shield password',
    html,
    text,
  });
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const provider = process.env.AVS_EMAIL_PROVIDER ?? 'console';

  if (provider === 'console' || process.env.NODE_ENV === 'development') {
    console.log('[Email Service] Sending email:');
    console.log(`  To: ${opts.to}`);
    console.log(`  Subject: ${opts.subject}`);
    console.log(`  Preview: ${opts.text.slice(0, 200)}...`);
    return;
  }

  // Production: use configured provider (SendGrid, SES, Postmark, etc.)
  const endpoint = process.env.AVS_EMAIL_API_ENDPOINT;
  const apiKey = process.env.AVS_EMAIL_API_KEY;

  if (!endpoint || !apiKey) {
    console.warn('[Email Service] No email provider configured — falling back to console log');
    console.log(`  To: ${opts.to}, Subject: ${opts.subject}`);
    return;
  }

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.AVS_EMAIL_FROM ?? 'noreply@avsshield.com',
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });
}

/* ── HTML Templates ───────────────────────────────────────────── */

function renderVerificationEmail(opts: {
  name: string;
  verifyUrl: string;
  expiryHours: number;
  supportEmail: string;
  supportUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your AVS Shield email</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">

          <!-- Header / Logo -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a56db 0%,#1e40af 100%);padding:32px 40px;text-align:center;">
              <img src="https://avsshield.com/logo.png" alt="AVS Shield" width="180" style="display:inline-block;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Welcome to AVS Shield!</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
                Hi ${escapeHtml(opts.name)},
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
                Thank you for creating your AVS Shield account. To get started, please verify your email address by clicking the button below.
              </p>

              <!-- Verify Button -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${escapeHtml(opts.verifyUrl)}" style="display:inline-block;background-color:#1a56db;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Fallback URL -->
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#6b7280;word-break:break-all;background-color:#f3f4f6;padding:12px 16px;border-radius:6px;">
                ${escapeHtml(opts.verifyUrl)}
              </p>

              <!-- Expiration Notice -->
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b7280;">
                <strong>⏱ This link will expire in ${opts.expiryHours} hours.</strong> If it expires, you can request a new verification email from your account.
              </p>

              <!-- Divider -->
              <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0;" />

              <!-- Support Info -->
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#374151;">
                <strong>Need help?</strong>
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;">
                Email: <a href="mailto:${escapeHtml(opts.supportEmail)}" style="color:#1a56db;text-decoration:none;">${escapeHtml(opts.supportEmail)}</a><br />
                Support: <a href="${escapeHtml(opts.supportUrl)}" style="color:#1a56db;text-decoration:none;">${escapeHtml(opts.supportUrl)}</a>
              </p>

              <!-- Security Note -->
              <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;background-color:#f9fafb;padding:16px;border-radius:6px;">
                <strong>Security note:</strong> AVS Shield will never ask for your password via email. If you didn't create an account, please ignore this email or contact support immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} AVS Shield. All rights reserved.<br />
                This is an automated email — please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderPasswordResetEmail(opts: {
  name: string;
  resetUrl: string;
  expiryHours: number;
  supportEmail: string;
  supportUrl: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your AVS Shield password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);overflow:hidden;">

          <tr>
            <td style="background:linear-gradient(135deg,#1a56db 0%,#1e40af 100%);padding:32px 40px;text-align:center;">
              <img src="https://avsshield.com/logo.png" alt="AVS Shield" width="180" style="display:inline-block;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>

          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;">Reset your password</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#374151;">
                Hi ${escapeHtml(opts.name)},
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#374151;">
                We received a request to reset your AVS Shield password. Click the button below to choose a new password.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${escapeHtml(opts.resetUrl)}" style="display:inline-block;background-color:#1a56db;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#6b7280;word-break:break-all;background-color:#f3f4f6;padding:12px 16px;border-radius:6px;">
                ${escapeHtml(opts.resetUrl)}
              </p>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#6b7280;">
                <strong>⏱ This link will expire in ${opts.expiryHours} hour(s).</strong>
              </p>

              <hr style="border:0;border-top:1px solid #e5e7eb;margin:32px 0;" />

              <p style="margin:0;font-size:13px;line-height:1.6;color:#9ca3af;background-color:#f9fafb;padding:16px;border-radius:6px;">
                <strong>Security note:</strong> If you didn't request a password reset, please ignore this email and your password will remain unchanged. Never share your password with anyone.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f9fafb;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} AVS Shield. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
