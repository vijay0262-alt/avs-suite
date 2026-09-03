/**
 * LoginDialog — production-ready AVS AI Shield account login.
 *
 * Features:
 * - Email or Phone field
 * - Password field with show/hide toggle
 * - Remember Me checkbox
 * - Sign In button with loading state
 * - Create Account link (opens website)
 * - Forgot Password link (opens website)
 * - Error state with user-friendly messages
 * - Success state (parent handles redirect)
 *
 * @vitest-environment happy-dom
 */
import { useState, useCallback, type FormEvent } from 'react';
import { Button } from '@avs/ui';
import {
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from './authStore';

const CREATE_ACCOUNT_URL = 'https://www.avsshield.com/register';
const FORGOT_PASSWORD_URL = 'https://www.avsshield.com/forgot-password';

export function LoginDialog() {
  const { login, loading, error, clearError } = useAuthStore();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!identifier.trim() || !password) return;
      await login(identifier.trim(), password);
    },
    [identifier, password, login],
  );

  const openExternal = (url: string) => {
    if (typeof window !== 'undefined' && window.avs?.app?.openExternal) {
      void window.avs.app.openExternal(url);
    }
  };

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    if (error) clearError();
  };

  const handlePasswordChange = (value: string) => {
    setPassword(value);
    if (error) clearError();
  };

  return (
    <div
      className="flex h-full items-center justify-center bg-bg"
      data-testid="login-dialog"
    >
      <div className="w-full max-w-sm space-y-6 px-8">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-primary flex items-center justify-center">
              <ShieldCheckIcon className="h-5 w-5 text-white" aria-hidden />
            </div>
            <span className="text-section-title font-semibold tracking-tight text-text-primary">
              AVS AI Shield
            </span>
          </div>
          <p className="text-small text-text-muted">
            Sign in to your AVS AI Shield account to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="login-form">
          {/* Identifier */}
          <div>
            <label
              htmlFor="login-identifier"
              className="block text-caption font-medium text-text-secondary mb-1"
            >
              Email or Phone
            </label>
            <input
              id="login-identifier"
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              placeholder="you@avsshield.com"
              disabled={loading}
              className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary placeholder-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
              data-testid="login-identifier"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-caption font-medium text-text-secondary mb-1"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2 pr-10 text-small text-text-primary placeholder-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
                data-testid="login-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                tabIndex={-1}
                data-testid="login-toggle-password"
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-4 w-4" aria-hidden />
                ) : (
                  <EyeIcon className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </div>

          {/* Remember Me + Forgot Password */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-caption text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[var(--avs-border)] accent-brand-primary"
                data-testid="login-remember-me"
              />
              Remember me
            </label>
            <button
              type="button"
              onClick={() => openExternal(FORGOT_PASSWORD_URL)}
              className="text-caption text-brand-primary hover:underline"
              data-testid="login-forgot-password"
            >
              Forgot password?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 px-3 py-2 text-caption text-semantic-danger"
              data-testid="login-error"
              role="alert"
            >
              <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {/* Sign In */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!identifier.trim() || !password}
            className="w-full"
            data-testid="login-submit"
            rightIcon={!loading ? <ArrowRightIcon className="h-4 w-4" /> : undefined}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        {/* Create Account */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => openExternal(CREATE_ACCOUNT_URL)}
            className="inline-flex items-center gap-1.5 text-caption text-text-secondary hover:text-text-primary"
            data-testid="login-create-account"
          >
            <UserPlusIcon className="h-3.5 w-3.5" aria-hidden />
            Don&apos;t have an account? Create one
          </button>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-micro text-text-muted">
            By signing in, you agree to the AVS AI Shield Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
