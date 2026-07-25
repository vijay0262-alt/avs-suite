'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { authService } from '@/lib/auth-service';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { phase, restoreSession } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  useEffect(() => {
    authService.onExpired(() => {
      useAuthStore.setState({ phase: 'unauthenticated', customer: null });
      router.push('/login');
    });
  }, [router]);

  if (phase === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
