'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, Pencil, Trash2, AlertCircle, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { devicesApi } from '@/lib/api-services';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';
import type { Device } from '@/lib/types';

export default function DevicesPage() {
  const queryClient = useQueryClient();
  const { data: devices, isLoading, isError } = useQuery({
    queryKey: queryKeys.devices,
    queryFn: devicesApi.list,
  });
  const [editing, setEditing] = useState<Device | null>(null);
  const [editName, setEditName] = useState('');
  const [removing, setRemoving] = useState<Device | null>(null);

  const renameMutation = useMutation({
    mutationFn: ({ uuid, name }: { uuid: string; name: string }) => devicesApi.rename(uuid, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      setEditing(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (uuid: string) => devicesApi.remove(uuid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices });
      setRemoving(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="devices-loading">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !devices) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-8 w-8" />}
        title="Failed to load devices"
        description="Please try again later."
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="devices-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Devices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage devices registered to your account.
        </p>
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon={<Monitor className="h-8 w-8" />}
          title="No devices registered"
          description="Install an AVS AI Shield product to register a device."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table data-testid="devices-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Device Name</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>App Version</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.uuid} data-testid={`device-row-${device.uuid}`}>
                    <TableCell className="font-medium">{device.device_name}</TableCell>
                    <TableCell>{device.platform}</TableCell>
                    <TableCell>{device.app_version}</TableCell>
                    <TableCell>{formatDateTime(device.last_seen)}</TableCell>
                    <TableCell>
                      <Badge variant={device.status === 'online' ? 'success' : 'secondary'}>
                        {device.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Rename device"
                          onClick={() => {
                            setEditing(device);
                            setEditName(device.device_name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove device"
                          onClick={() => setRemoving(device)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Rename Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Device</DialogTitle>
            <DialogDescription>Enter a new name for this device.</DialogDescription>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Device name"
            data-testid="device-rename-input"
          />
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              loading={renameMutation.isPending}
              onClick={() => editing && renameMutation.mutate({ uuid: editing.uuid, name: editName })}
            >
              <Check className="h-4 w-4" /> Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Device</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &ldquo;{removing?.device_name}&rdquo;? This will
              deactivate the license on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setRemoving(null)}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              variant="destructive"
              loading={removeMutation.isPending}
              onClick={() => removing && removeMutation.mutate(removing.uuid)}
            >
              <Trash2 className="h-4 w-4" /> Remove Device
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
