'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/auth-store';
import { Breadcrumbs } from './breadcrumbs';

export function TopNav() {
  const { theme, setTheme } = useTheme();
  const { logout, customer } = useAuthStore();

  return (
    <header
      className="flex h-16 items-center justify-between border-b border-border bg-card px-6"
      data-testid="top-nav"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </Button>
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
          data-testid="theme-toggle"
        >
          <Sun className="h-5 w-5 dark:hidden" />
          <Moon className="hidden h-5 w-5 dark:block" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void logout()}
          className="gap-2"
          data-testid="logout-button"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}
