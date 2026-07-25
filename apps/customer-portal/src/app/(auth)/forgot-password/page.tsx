'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Loader2, Mail, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authService } from '@/lib/auth-service';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSent(true);
    } catch {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="shadow-lg" data-testid="forgot-password-card">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <CardTitle className="text-2xl">Forgot password</CardTitle>
          <CardDescription className="mt-1">
            {sent
              ? 'Check your email for a reset link'
              : 'Enter your email to receive a reset link'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-center" data-testid="forgot-success">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <Mail className="h-6 w-6 text-success" />
            </div>
            <p className="text-sm text-muted-foreground">
              If an account exists for {email}, you will receive a password reset link shortly.
            </p>
            <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
              Back to Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="forgot-form">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="forgot-email"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" data-testid="forgot-error">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading} data-testid="forgot-submit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Reset Link'}
            </Button>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to login
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
