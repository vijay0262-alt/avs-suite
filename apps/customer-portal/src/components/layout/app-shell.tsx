'use client';

import { type ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { TopNav } from './top-nav';
import { ErrorBoundary } from '@/components/error-boundary';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="app-shell">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary>
            <div className="mx-auto max-w-7xl">{children}</div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
