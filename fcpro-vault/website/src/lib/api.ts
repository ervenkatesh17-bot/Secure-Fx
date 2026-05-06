import axios, { AxiosError } from 'axios';

export type UserRole = 'customer' | 'admin';
export type LicenseStatus = 'active' | 'expired' | 'suspended' | 'revoked';
export type LicenseTier = 'standard' | 'professional' | 'enterprise';
export type Plan = LicenseTier;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface Device {
  id: string;
  fingerprintHash: string;
  deviceName: string | null;
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  lastSeenIp: string | null;
  registeredAt: string;
}

export interface License {
  id: string;
  licenseKey: string;
  status: LicenseStatus;
  tier: LicenseTier;
  email: string | null;
  maxDevices: number;
  verificationCount: number;
  lastVerifiedAt: string | null;
  createdAt: string;
  devices?: Device[];
}
export type LicenseRecord = License;

export interface Project {
  id: string;
  title: string;
  encryptedFileName: string;
  encryptedChecksum: string | null;
  requiredTier: LicenseTier;
  fileSizeBytes: string | null;
  createdAt: string;
}

export interface DownloadToken {
  token: string;
  expiresAt: number;
  checksum: string;
}

export interface AdminStats {
  totalLicenses: number;
  activeLicenses: number;
  totalDevices: number;
  recentVerifications: number;
}

export interface AuditLog {
  id: string;
  licenseId: string | null;
  deviceId: string | null;
  action: string;
  ipAddress: string | null;
  details: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface RazorpayVerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: LicenseTier;
  email: string;
  name: string;
}

interface ApiErrorBody {
  message?: string | string[];
}

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
  timeout: 15_000,
});

export function setAuthToken(token: string | null): void {
  if (token === null) {
    delete api.defaults.headers.common.Authorization;
    return;
  }

  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('fcpro_token');

    if (token !== null) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

export const authApi = {
  register: (payload: { name: string; email: string; password: string }) =>
    api.post<AuthResponse>('/auth/register', payload).then((res) => res.data),
  login: (payload: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', payload).then((res) => res.data),
  me: () => api.get<AuthUser>('/auth/me').then((res) => res.data),
};

export const licenseApi = {
  getMy: () => api.get<License>('/license/my').then((res) => res.data),
  revokeDevice: (licenseId: string, deviceId: string) =>
    api.delete(`/license/${licenseId}/device/${deviceId}`).then((res) => res.data),
};

export const projectApi = {
  list: () => api.get<Project[]>('/project/list').then((res) => res.data),
  getDownloadUrl: (projectId: string) =>
    api
      .get<DownloadToken>('/project/download', { params: { projectId } })
      .then((res) => res.data),
};

export const adminApi = {
  getStats: () => api.get<AdminStats>('/admin/stats').then((res) => res.data),
  getLicenses: (params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: LicenseStatus | '';
  }) => api.get<Paginated<License>>('/admin/licenses', { params }).then((res) => res.data),
  getLicense: (id: string) =>
    api.get<License>(`/admin/licenses/${id}`).then((res) => res.data),
  revokeLicense: (id: string, reason: string) =>
    api.post(`/admin/licenses/${id}/revoke`, { reason }).then((res) => res.data),
  getAuditLogs: (params: { page?: number; limit?: number; licenseId?: string }) =>
    api.get<Paginated<AuditLog>>('/admin/audit', { params }).then((res) => res.data),
};

export const paymentApi = {
  createRazorpayOrder: (payload: {
    plan: LicenseTier;
    email: string;
    name: string;
  }) => api.post<RazorpayOrder>('/payment/razorpay/order', payload).then((res) => res.data),
  verifyPayment: (payload: RazorpayVerifyPayload) =>
    api.post<{ success: boolean; message: string }>('/payment/razorpay/verify', payload).then((res) => res.data),
};

export function getApiError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    return err instanceof Error ? err.message : 'Something went wrong';
  }

  const error = err as AxiosError<ApiErrorBody>;
  const message = error.response?.data?.message;

  if (Array.isArray(message)) {
    return message.join(', ');
  }

  return message ?? error.message ?? 'Request failed';
}
