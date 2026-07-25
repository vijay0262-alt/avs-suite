'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, RefreshCw, Ban, AlertCircle, Copy, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { licensesApi } from '@/lib/api-services';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';
import type { License } from '@/lib/types';

export default function LicensesPage() {
  const queryClient = useQueryClient();
  const { data: licenses, isLoading, isError } = useQuery({
    queryKey: queryKeys.licenses,
    queryFn: licensesApi.list,
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<License | null>(null);

  const refreshMutation = useMutation({
    mutationFn: (uuid: string) => licensesApi.refresh(uuid),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.licenses }),
  });

  const revokeMutation = useMutation({
    mutationFn: (uuid: string) => licensesApi.revoke(uuid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.licenses });
      setRevokeTarget(null);
    },
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="licenses-loading">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !licenses) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load licenses"
        description="Please try again later."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="licenses-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Licenses</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage your product licenses.
        </p>
      </div>

      {licenses.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title="No licenses yet"
          description="Activate a product to get a license."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="licenses-table">
              <TableHeader>
                <TableRow>
                  <TableHead>License Key</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Edition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenses.map((license) => (
                  <TableRow key={license.uuid} data-testid={`license-row-${license.uuid}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {license.license_key.slice(0, 8)}••••
                        </code>
                        <button
                          onClick={() => copyKey(license.license_key)}
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Copy license key"
                        >
                          {copiedKey === license.license_key ? (
                            <Check className="h-3 w-3 text-success" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{license.product_name}</TableCell>
                    <TableCell>{license.edition}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          license.status === 'active' ? 'success' :
                          license.status === 'expired' ? 'destructive' :
                          license.status === 'suspended' ? 'warning' : 'secondary'
                        }
                      >
                        {license.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(license.issued_at)}</TableCell>
                    <TableCell>{formatDate(license.expires_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Refresh license"
                          loading={refreshMutation.isPending}
                          onClick={() => refreshMutation.mutate(license.uuid)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Revoke license"
                            onClick={() => setRevokeTarget(license)}
                          >
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        </DialogTrigger>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Revoke Confirmation Dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke License</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this license? This action cannot be undone.
              The license key will be permanently deactivated.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={revokeMutation.isPending}
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.uuid)}
            >
              Revoke License
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
