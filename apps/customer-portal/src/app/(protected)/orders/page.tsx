'use client';

import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, AlertCircle, Download, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';
import type { Order } from '@/lib/types';

export default function OrdersPage() {
  const { data: orders, isLoading, isError } = useQuery({
    queryKey: queryKeys.orders,
    queryFn: () => apiClient.get<Order[]>('/api/customer/orders'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="orders-loading">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load orders"
        description="Please try again later."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="orders-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View your purchase history and download invoices.
        </p>
      </div>

      {!orders || orders.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-8 w-8" />}
          title="No orders yet"
          description="Your purchase history will appear here once you buy a product."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id} data-testid={`order-card-${order.order_number}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {order.order_number} — {order.product_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.edition} • {formatDate(order.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">
                      {order.currency} {order.amount.toFixed(2)}
                    </p>
                    <Badge variant={order.status === 'completed' ? 'success' : 'warning'}>
                      {order.status}
                    </Badge>
                  </div>
                  {order.invoice_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(order.invoice_url!, '_blank')}
                      data-testid={`order-invoice-${order.order_number}`}
                    >
                      <Download className="h-3.5 w-3.5" /> Invoice
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
