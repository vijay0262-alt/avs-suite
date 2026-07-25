/**
 * API services — typed functions for all AVS License Server endpoints.
 * Components and hooks call these, never axios directly.
 */
import { apiClient } from './api-client';
import type {
  Product,
  License,
  Device,
  ProductManifest,
  DashboardData,
  ActivityEntry,
  Notification,
  Customer,
} from './types';

export const dashboardApi = {
  get: () => apiClient.get<DashboardData>('/api/customer/dashboard'),
};

export const productsApi = {
  list: () => apiClient.get<Product[]>('/api/products'),
  get: (code: string) => apiClient.get<Product>(`/api/products/${code}`),
  provision: (code: string) =>
    apiClient.post<{ entitlement: unknown; created: boolean }>(
      `/api/customer/products/${code}/provision`,
    ),
};

export const licensesApi = {
  list: () => apiClient.get<License[]>('/api/customer/licenses'),
  refresh: (uuid: string) => apiClient.post<License>(`/api/customer/licenses/${uuid}/refresh`),
  revoke: (uuid: string) => apiClient.post<{ success: boolean }>(`/api/customer/licenses/${uuid}/revoke`),
};

export const devicesApi = {
  list: () => apiClient.get<Device[]>('/api/customer/devices'),
  rename: (uuid: string, name: string) =>
    apiClient.put<Device>(`/api/customer/devices/${uuid}`, { device_name: name }),
  remove: (uuid: string) => apiClient.delete<{ success: boolean }>(`/api/customer/devices/${uuid}`),
};

export const downloadsApi = {
  getManifest: (productCode: string) =>
    apiClient.get<ProductManifest>(`/api/products/${productCode}/manifest`),
};

export const profileApi = {
  get: () => apiClient.get<Customer>('/api/customer/profile'),
  update: (data: Partial<Customer>) => apiClient.put<Customer>('/api/customer/profile', data),
};

export const securityApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ success: boolean }>('/api/customer/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),
  getSessions: () =>
    apiClient.get<Array<{ id: string; device: string; ip: string; last_active: string }>>(
      '/api/customer/sessions',
    ),
  revokeSession: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/api/customer/sessions/${id}`),
};

export const notificationsApi = {
  list: () => apiClient.get<Notification[]>('/api/customer/notifications'),
  markRead: (id: string) =>
    apiClient.put<Notification>(`/api/customer/notifications/${id}`, { read: true }),
  markAllRead: () => apiClient.post<{ success: boolean }>('/api/customer/notifications/read-all'),
};

export const activityApi = {
  list: () => apiClient.get<ActivityEntry[]>('/api/customer/activity'),
};
