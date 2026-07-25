/**
 * React Query keys — centralized for cache invalidation.
 */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  products: ['products'] as const,
  product: (code: string) => ['products', code] as const,
  licenses: ['licenses'] as const,
  devices: ['devices'] as const,
  downloads: (code: string) => ['downloads', code] as const,
  profile: ['profile'] as const,
  sessions: ['sessions'] as const,
  notifications: ['notifications'] as const,
  activity: ['activity'] as const,
};
