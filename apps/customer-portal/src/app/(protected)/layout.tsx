'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { useAuthStore } from '@/lib/auth-store';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { phase } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (phase === 'unauthenticated') {
      const returnUrl = searchParams.get('returnUrl') ?? window.location.pathname;
      router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
    if (phase === 'unverified') {
      router.push('/verify-email');
    }
  }, [phase, router, searchParams]);

  if (phase !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
