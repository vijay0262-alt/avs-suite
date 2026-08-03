/**
 * API types — mirror the AVS License Server API response shapes.
 * All fields use snake_case to match the server JSON exactly.
 */

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  email: string;
  phone_number: string;
  account_status: string;
  email_verified: boolean;
  phone_verified: boolean;
  country?: string | null;
  timezone?: string | null;
  language?: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
  customer: Customer;
  email_verification_required?: boolean;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
}

export interface RegisterRequest {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  password: string;
}

export interface RegisterResponse {
  customer: Customer;
  verification_required: boolean;
  verification_token?: string;
}

export interface VerifyEmailResponse {
  success: boolean;
  access_token?: string;
  refresh_token?: string | null;
  expires_in?: number;
  customer?: Customer;
  error?: string;
}

export interface ResendVerificationResponse {
  success: boolean;
  message?: string;
}

export interface Order {
  id: string;
  order_number: string;
  product_code: string;
  product_name: string;
  edition: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
  invoice_url?: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  download_url: string;
}

export interface AccountStatus {
  email_verified: boolean;
  account_status: string;
  edition: string;
  license_status: string;
  license_key?: string;
  expires_at?: string | null;
  device_count: number;
  max_devices: number;
  subscription_active: boolean;
  subscription_renews_at?: string | null;
}

export interface Product {
  code: string;
  name: string;
  description: string;
  category: string;
  edition: string;
  status: string;
  icon?: string;
  download_url?: string;
}

export interface License {
  uuid: string;
  license_key: string;
  product_code: string;
  product_name: string;
  edition: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  last_refreshed: string | null;
}

export interface Device {
  uuid: string;
  device_name: string;
  platform: string;
  app_version: string;
  last_seen: string;
  status: string;
  product_code: string;
}

export interface ProductManifest {
  product_code: string;
  current_version: string;
  minimum_supported_version: string;
  release_channel: string;
  platform: string;
  download_url: string;
  sha256: string;
  file_size: number;
  release_notes: string;
  force_update: boolean;
  published_at: string;
}

export interface DashboardData {
  customer: Customer;
  products: Product[];
  licenses: License[];
  devices: Device[];
  recent_activity: ActivityEntry[];
  update_available: boolean;
}

export interface ActivityEntry {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}
