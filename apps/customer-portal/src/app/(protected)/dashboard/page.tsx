'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Package,
  KeyRound,
  Monitor,
  Download,
  Activity,
  TrendingUp,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { dashboardApi } from '@/lib/api-services';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function DashboardPage() {
  const { customer } = useAuthStore();
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardApi.get,
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="dashboard-loading">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load dashboard"
        description="Please try again later."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  const stats = [
    {
      label: 'Products Owned',
      value: data.products.length,
      icon: Package,
      href: '/products',
    },
    {
      label: 'Active Licenses',
      value: data.licenses.filter((l) => l.status === 'active').length,
      icon: KeyRound,
      href: '/licenses',
    },
    {
      label: 'Registered Devices',
      value: data.devices.length,
      icon: Monitor,
      href: '/devices',
    },
    {
      label: 'Latest Downloads',
      value: data.products.filter((p) => p.download_url).length,
      icon: Download,
      href: '/downloads',
    },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Welcome */}
      <Card>
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Welcome, {customer?.first_name ?? 'User'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your AVS Shield products, licenses, and devices.
            </p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Badge
              variant={customer?.account_status === 'ACTIVE' ? 'success' : 'warning'}
              data-testid="account-status-badge"
            >
              {customer?.account_status ?? 'UNKNOWN'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Update Available Banner */}
      {data.update_available && (
        <Card className="border-primary/30 bg-primary/5" data-testid="update-banner">
          <CardContent className="flex items-center gap-3 p-4">
            <TrendingUp className="h-5 w-5 text-primary" />
            <p className="text-sm font-medium text-foreground">
              An update is available for one of your products.
            </p>
            <Link href="/downloads" className="ml-auto">
              <Button size="sm">View Updates</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href}>
              <Card className="transition-shadow hover:shadow-md" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">{stat.value}</p>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Recent Activity + Products */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="dashboard-recent-activity">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_activity.length === 0 ? (
              <EmptyState title="No recent activity" description="Activity will appear here." />
            ) : (
              <ul className="space-y-3">
                {data.recent_activity.slice(0, 5).map((activity) => (
                  <li key={activity.id} className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(activity.timestamp)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card data-testid="dashboard-products">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" /> Your Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.products.length === 0 ? (
              <EmptyState
                title="No products yet"
                description="Browse available products to get started."
                action={<Link href="/products"><Button size="sm">Browse Products</Button></Link>}
              />
            ) : (
              <ul className="space-y-2">
                {data.products.slice(0, 5).map((product) => (
                  <li
                    key={product.code}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.category} • {product.edition}</p>
                    </div>
                    <Badge variant={product.status === 'active' ? 'success' : 'secondary'}>
                      {product.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
