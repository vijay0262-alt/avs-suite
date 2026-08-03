'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuthStore } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loading, error, errorCode, clearError, phase } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const returnUrl = searchParams.get('returnUrl');

  // Redirect authenticated users to dashboard (or return URL)
  useEffect(() => {
    if (phase === 'authenticated') {
      router.replace(returnUrl ?? '/dashboard');
    }
  }, [phase, router, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const success = await login(identifier, password, rememberMe);
    if (success) {
      router.push(returnUrl ?? '/dashboard');
    }
  };

  return (
    <Card className="shadow-lg" data-testid="login-card">
      <CardHeader className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription className="mt-1">
            Sign in to your AVS Shield account
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or Phone</Label>
            <Input
              id="identifier"
              type="text"
              placeholder="you@avsshield.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
              data-testid="login-identifier"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={() => router.push('/forgot-password')}
                className="text-xs text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              data-testid="login-password"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-me"
              checked={rememberMe}
              onCheckedChange={(checked: boolean | 'indeterminate') => setRememberMe(checked === true)}
              data-testid="login-remember-me"
            />
            <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
              Remember me for 30 days
            </Label>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              data-testid="login-error"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
            data-testid="login-submit"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="font-medium text-primary hover:underline"
            >
              Create one
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
