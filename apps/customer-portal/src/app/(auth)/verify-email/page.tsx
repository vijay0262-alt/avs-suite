'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Mail, Loader2, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/lib/auth-store';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verifyEmail, resendVerification, loading, error, phase } = useAuthStore();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  const [emailInput, setEmailInput] = useState(email ?? '');
  const [resendSent, setResendSent] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Auto-verify if token is present in URL
  useEffect(() => {
    if (token && verifyStatus === 'idle') {
      setVerifyStatus('verifying');
      (async () => {
        const success = await verifyEmail(token);
        if (success) {
          setVerifyStatus('success');
          setTimeout(() => router.push('/dashboard'), 1500);
        } else {
          setVerifyStatus('error');
          setVerifyError(error ?? 'Verification failed. The link may have expired.');
        }
      })();
    }
  }, [token, verifyStatus, verifyEmail, router, error]);

  // Redirect if already authenticated
  useEffect(() => {
    if (phase === 'authenticated') {
      router.replace('/dashboard');
    }
  }, [phase, router]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendSent(false);
    const success = await resendVerification(emailInput);
    if (success) {
      setResendSent(true);
    }
  };

  // Token verification flow
  if (token) {
    return (
      <Card className="shadow-lg" data-testid="verify-token-card">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {verifyStatus === 'verifying' && <Loader2 className="h-6 w-6 text-primary animate-spin" />}
            {verifyStatus === 'success' && <CheckCircle className="h-6 w-6 text-success" />}
            {verifyStatus === 'error' && <AlertCircle className="h-6 w-6 text-destructive" />}
            {verifyStatus === 'idle' && <ShieldCheck className="h-6 w-6 text-primary" />}
          </div>
          <div>
            <CardTitle className="text-2xl">
              {verifyStatus === 'verifying' && 'Verifying your email...'}
              {verifyStatus === 'success' && 'Email verified!'}
              {verifyStatus === 'error' && 'Verification failed'}
              {verifyStatus === 'idle' && 'Verify email'}
            </CardTitle>
            <CardDescription className="mt-1">
              {verifyStatus === 'verifying' && 'Please wait while we confirm your email address.'}
              {verifyStatus === 'success' && 'Redirecting you to your dashboard...'}
              {verifyStatus === 'error' && (verifyError ?? 'The verification link may have expired.')}
              {verifyStatus === 'idle' && 'Confirming your email address.'}
            </CardDescription>
          </div>
        </CardHeader>
        {verifyStatus === 'error' && (
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              The verification link may have expired or already been used.
              Please request a new verification email.
            </p>
            <Button
              className="w-full"
              onClick={() => router.push(`/verify-email?email=${encodeURIComponent(email ?? '')}`)}
              data-testid="verify-request-new"
            >
              Request new verification email
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/login')}
            >
              Back to login
            </Button>
          </CardContent>
        )}
      </Card>
    );
  }

  // "Check your email" flow — shown after registration
  return (
    <Card className="shadow-lg" data-testid="verify-email-card">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <div>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription className="mt-1">
            We&apos;ve sent a verification link to{' '}
            {email ? (
              <strong className="text-foreground">{email}</strong>
            ) : (
              'your email address'
            )}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">Next steps:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Open the verification email from AVS AI Shield</li>
            <li>Click the &quot;Verify Email Address&quot; button</li>
            <li>You&apos;ll be automatically signed in to your dashboard</li>
          </ol>
        </div>

        <div className="rounded-md bg-warning/10 p-3 text-sm text-warning-foreground">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            The verification link expires in 24 hours.
          </p>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="verify-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {resendSent && (
          <div
            className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success"
            data-testid="verify-resend-success"
          >
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>Verification email sent! Check your inbox.</span>
          </div>
        )}

        <form onSubmit={handleResend} className="space-y-3" data-testid="verify-resend-form">
          <div className="space-y-2">
            <Label htmlFor="resend-email">Didn&apos;t receive an email?</Label>
            <div className="flex gap-2">
              <Input
                id="resend-email"
                type="email"
                placeholder="you@avsshield.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                data-testid="verify-resend-email"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={loading || !emailInput}
                data-testid="verify-resend-submit"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Resend</span>
              </Button>
            </div>
          </div>
        </form>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push('/login')}
          data-testid="verify-back-login"
        >
          Back to login
        </Button>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
