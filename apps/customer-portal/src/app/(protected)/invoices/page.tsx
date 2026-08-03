'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';
import type { Invoice } from '@/lib/types';

export default function InvoicesPage() {
  const { data: invoices, isLoading, isError } = useQuery({
    queryKey: queryKeys.invoices,
    queryFn: () => apiClient.get<Invoice[]>('/api/customer/invoices'),
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="invoices-loading">
        <Skeleton className="h-10 w-48" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load invoices"
        description="Please try again later."
        action={<Button onClick={() => window.location.reload()}>Retry</Button>}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="invoices-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download invoices for your purchases.
        </p>
      </div>

      {!invoices || invoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-8 w-8" />}
          title="No invoices yet"
          description="Your invoices will appear here once you make a purchase."
        />
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <Card key={invoice.id} data-testid={`invoice-card-${invoice.invoice_number}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {invoice.invoice_number}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(invoice.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">
                      {invoice.currency} {invoice.amount.toFixed(2)}
                    </p>
                    <Badge variant={invoice.status === 'paid' ? 'success' : 'warning'}>
                      {invoice.status}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(invoice.download_url, '_blank')}
                    data-testid={`invoice-download-${invoice.invoice_number}`}
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
