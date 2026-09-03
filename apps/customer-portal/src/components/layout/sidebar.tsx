'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  LayoutDashboard,
  Package,
  Download,
  KeyRound,
  Monitor,
  User,
  Shield,
  Bell,
  Settings,
  LifeBuoy,
  ShieldCheck,
  ShoppingCart,
  FileText,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { Badge } from '@/components/ui/badge';

const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL ?? 'https://avsshield.com';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/downloads', label: 'Downloads', icon: Download },
  { href: '/licenses', label: 'Licenses', icon: KeyRound },
  { href: '/devices', label: 'Devices', icon: Monitor },
  { href: '/orders', label: 'Orders', icon: ShoppingCart },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/profile', label: 'Account', icon: User },
  { href: '/security', label: 'Security', icon: Shield },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/support', label: 'Support', icon: LifeBuoy },
];

export function Sidebar() {
  const pathname = usePathname();
  const { customer, logout } = useAuthStore();

  return (
    <aside
      className="flex h-screen w-64 flex-col border-r border-border bg-card"
      data-testid="sidebar"
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-foreground">AVS AI Shield</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {/* External links */}
        <ul className="space-y-1 mb-2">
          <li>
            <a
              href={WEBSITE_URL}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              data-testid="sidebar-link-home"
            >
              <Home className="h-4 w-4" />
              Home
            </a>
          </li>
        </ul>

        <div className="my-2 border-t border-border" />

        {/* Dashboard nav items */}
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                  data-testid={`sidebar-link-${item.href.slice(1)}`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {customer?.first_name?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {customer?.first_name} {customer?.last_name}
            </p>
            <p className="truncate text-xs text-muted-foreground">{customer?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-3">
          {customer?.email_verified ? (
            <Badge variant="success" className="text-xs">Verified</Badge>
          ) : (
            <Badge variant="warning" className="text-xs">Email Pending</Badge>
          )}
          {customer?.account_status === 'ACTIVE' && (
            <Badge variant="success" className="text-xs">Active</Badge>
          )}
        </div>
        <button
          onClick={() => void logout()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          data-testid="sidebar-logout"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}
