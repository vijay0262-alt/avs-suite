'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Download, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { productsApi } from '@/lib/api-services';
import { queryKeys } from '@/lib/query-keys';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { data: products, isLoading, isError } = useQuery({
    queryKey: queryKeys.products,
    queryFn: productsApi.list,
  });

  const provisionMutation = useMutation({
    mutationFn: (code: string) => productsApi.provision(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="products-loading">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !products) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load products"
        description="Please try again later."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="products-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Products</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and manage your AVS Shield products.
        </p>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="No products available"
          description="Products will appear here when they become available."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.code} data-testid={`product-card-${product.code}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant={product.status === 'active' ? 'success' : 'secondary'}>
                    {product.status}
                  </Badge>
                </div>
                <CardTitle className="text-base">{product.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{product.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Category</span>
                  <span className="font-medium text-foreground">{product.category}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Edition</span>
                  <span className="font-medium text-foreground">{product.edition}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  {product.download_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => window.open(product.download_url, '_blank')}
                    >
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    loading={provisionMutation.isPending}
                    onClick={() => provisionMutation.mutate(product.code)}
                  >
                    Activate
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
