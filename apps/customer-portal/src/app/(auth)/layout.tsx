import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4"
      data-testid="auth-layout"
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
