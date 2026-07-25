'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Save, AlertCircle, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { profileApi } from '@/lib/api-services';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/lib/auth-store';
import type { Customer } from '@/lib/types';

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { customer } = useAuthStore();
  const { data: profile, isLoading } = useQuery({
    queryKey: queryKeys.profile,
    queryFn: profileApi.get,
    initialData: customer,
  });
  const [form, setForm] = useState<Partial<Customer>>({});
  const [saved, setSaved] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => profileApi.update(data),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setSaved(true);
      setForm({});
      setTimeout(() => setSaved(false), 3000);
      useAuthStore.setState({ customer: updated });
    },
  });

  const handleChange = (field: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  if (isLoading || !profile) {
    return (
      <div className="space-y-6" data-testid="profile-loading">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full max-w-2xl" />
      </div>
    );
  }

  const current = { ...profile, ...form };

  return (
    <div className="space-y-6" data-testid="profile-page">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account information.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {profile.first_name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div>
              <CardTitle>{profile.first_name} {profile.last_name}</CardTitle>
              <CardDescription>{profile.email}</CardDescription>
              <div className="mt-1 flex gap-2">
                <Badge variant={profile.account_status === 'ACTIVE' ? 'success' : 'warning'}>
                  {profile.account_status}
                </Badge>
                {profile.email_verified && <Badge variant="success">Email Verified</Badge>}
                {profile.phone_verified && <Badge variant="success">Phone Verified</Badge>}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate(form);
            }}
            className="space-y-4"
            data-testid="profile-form"
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={current.first_name ?? ''}
                  onChange={handleChange('first_name')}
                  data-testid="profile-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={current.last_name ?? ''}
                  onChange={handleChange('last_name')}
                  data-testid="profile-last-name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={current.email ?? ''}
                onChange={handleChange('email')}
                data-testid="profile-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number</Label>
              <Input
                id="phone_number"
                type="tel"
                value={current.phone_number ?? ''}
                onChange={handleChange('phone_number')}
                data-testid="profile-phone"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={current.country ?? ''}
                  onChange={handleChange('country')}
                  placeholder="United States"
                  data-testid="profile-country"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={current.timezone ?? ''}
                  onChange={handleChange('timezone')}
                  placeholder="America/New_York"
                  data-testid="profile-timezone"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={current.language ?? ''}
                onChange={handleChange('language')}
                placeholder="en"
                data-testid="profile-language"
              />
            </div>

            {updateMutation.isError && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                Failed to update profile. Please try again.
              </div>
            )}

            {saved && (
              <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
                <Check className="h-4 w-4" />
                Profile updated successfully.
              </div>
            )}

            <Button
              type="submit"
              disabled={Object.keys(form).length === 0 || updateMutation.isPending}
              loading={updateMutation.isPending}
              data-testid="profile-save"
            >
              <Save className="h-4 w-4" /> Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
