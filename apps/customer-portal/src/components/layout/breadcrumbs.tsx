'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const labelMap: Record<string, string> = {
  dashboard: 'Dashboard',
  products: 'Products',
  downloads: 'Downloads',
  licenses: 'Licenses',
  devices: 'Devices',
  profile: 'Profile',
  security: 'Security',
  notifications: 'Notifications',
  settings: 'Settings',
  support: 'Support',
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  return (
    <nav className="flex items-center text-sm" aria-label="Breadcrumb" data-testid="breadcrumbs">
      <ol className="flex items-center gap-1">
        {segments.map((seg, i) => {
          const href = '/' + segments.slice(0, i + 1).join('/');
          const isLast = i === segments.length - 1;
          const label = labelMap[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);

          return (
            <li key={href} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              {isLast ? (
                <span className="font-medium text-foreground">{label}</span>
              ) : (
                <Link
                  href={href}
                  className={cn('text-muted-foreground hover:text-foreground')}
                >
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
