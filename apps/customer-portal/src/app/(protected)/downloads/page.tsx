'use client';

import { useQuery } from '@tanstack/react-query';
import {
  Download,
  AlertCircle,
  FileDown,
  Hash,
  Calendar,
  FileBox,
  KeyRound,
  FileText,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { dashboardApi, downloadsApi, licensesApi } from '@/lib/api-services';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, formatBytes } from '@/lib/utils';
import Link from 'next/link';

const PRODUCT_CODES = ['optimizer', 'security', 'driver-updater', 'file-recovery', 'vpn'];

export default function DownloadsPage() {
  const { data: dashboardData } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: dashboardApi.get,
  });

  const { data: licenses } = useQuery({
    queryKey: queryKeys.licenses,
    queryFn: licensesApi.list,
  });

  const queries = PRODUCT_CODES.map((code) =>
    useQuery({
      queryKey: queryKeys.downloads(code),
      queryFn: () => downloadsApi.getManifest(code),
      retry: false,
    }),
  );

  const isLoading = queries.some((q) => q.isLoading);
  const manifests = queries
    .map((q, i) => ({ data: q.data, code: PRODUCT_CODES[i] }))
    .filter((m): m is { data: NonNullable<typeof m.data>; code: string } => m.data != null);

  // Filter to only show products the customer owns
  const ownedProductCodes = new Set(
    dashboardData?.products.map((p) => p.code).filter(Boolean) ?? [],
  );
  const ownedManifests = manifests.filter((m) => ownedProductCodes.has(m.code));
  const ownedLicenses = licenses?.filter((l) => l.status === 'active') ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="downloads-loading">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (ownedManifests.length === 0) {
    return (
      <div className="space-y-6" data-testid="downloads-page">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Downloads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Download the latest versions of your AVS Shield products.
          </p>
        </div>
        <EmptyState
          icon={<Download className="h-8 w-8" />}
          title="No downloads available"
          description="Product downloads will appear here once you purchase a product."
          action={<Link href="/products"><Button size="sm">Browse Products</Button></Link>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="downloads-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Downloads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download the latest versions of your AVS Shield products.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {ownedManifests.map(({ data, code }) => {
          const productLicense = ownedLicenses.find((l) => l.product_code === code);
          return (
            <Card key={code} data-testid={`download-card-${code}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <FileDown className="h-5 w-5 text-primary" />
                  </div>
                  {data.force_update && (
                    <Badge variant="warning">Force Update</Badge>
                  )}
                </div>
                <CardTitle className="text-base capitalize">{code.replace(/-/g, ' ')}</CardTitle>
                <p className="text-sm text-muted-foreground">Version {data.current_version}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Released: {formatDate(data.published_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileBox className="h-3.5 w-3.5" />
                    <span>Size: {formatBytes(data.file_size)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Hash className="h-3.5 w-3.5" />
                    <code className="text-xs">{data.sha256.slice(0, 16)}…</code>
                  </div>
                </div>

                {/* License Key */}
                {productLicense && (
                  <div className="rounded-md bg-muted p-3" data-testid={`download-license-${code}`}>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <KeyRound className="h-3 w-3" /> License Key
                    </p>
                    <code className="mt-1 block text-sm text-foreground break-all">
                      {productLicense.license_key}
                    </code>
                  </div>
                )}

                {/* Activation Instructions */}
                <div className="rounded-md bg-primary/5 p-3" data-testid={`download-activation-${code}`}>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Info className="h-3 w-3" /> Activation Instructions
                  </p>
                  <ol className="mt-1 list-decimal list-inside space-y-0.5 text-xs text-muted-foreground">
                    <li>Download and install the application</li>
                    <li>Launch the application</li>
                    <li>Enter your license key when prompted</li>
                    <li>Click &quot;Activate&quot; to complete activation</li>
                  </ol>
                </div>

                {data.release_notes && (
                  <div className="rounded-md bg-muted p-3">
                    <p className="text-xs font-medium text-muted-foreground">Release Notes</p>
                    <p className="mt-1 text-sm text-foreground whitespace-pre-line">{data.release_notes}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => window.open(data.download_url, '_blank')}
                    data-testid={`download-button-${code}`}
                  >
                    <Download className="h-4 w-4" /> Download
                  </Button>
                  <Link href="/invoices">
                    <Button variant="outline" size="icon" data-testid={`download-invoice-${code}`}>
                      <FileText className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
