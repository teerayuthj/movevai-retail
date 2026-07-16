import type { Driver } from '@/data/orderTypes';
import { APP_API_BASE, request } from './client';
import { type ApiDriver, type DriverApprovalStatus, normalizeDriver } from './shared';

export type DriverMutationInput = {
  code?: string;
  name: string;
  phone: string;
  avatarKey?: string;
  vehicle: Driver['vehicle'];
  vehicleColor?: string;
  status?: Driver['status'];
  approvalStatus?: DriverApprovalStatus;
  capacity?: number;
  highValueCertified?: boolean;
  licensePlate?: string;
  idCardNumber?: string;
  idCardPhotoDataUrl?: string;
  profilePhotoDataUrl?: string;
  addressLine?: string;
  addressSubdistrict?: string;
  addressDistrict?: string;
  addressProvince?: string;
  addressPostalCode?: string;
};

// field ที่ messenger แก้เองได้จากหน้า "บัญชี messenger" — ต้องตรงกับ whitelist
// ของ backend (riderProfileUpdateSchema): ชื่อ/บัตรประชาชน/ยานพาหนะ แก้ได้เฉพาะ admin
export type MessengerProfileUpdateInput = {
  phone?: string;
  profilePhotoDataUrl?: string;
  addressLine?: string;
  addressSubdistrict?: string;
  addressDistrict?: string;
  addressProvince?: string;
  addressPostalCode?: string;
};

export type AcceptanceSummary = {
  totalRoutes: number;
  acceptedRoutes: number;
  onTimeRoutes: number;
  lateRoutes: number;
  overdueUnacceptedRoutes: number;
  pendingRoutes: number;
  onTimeRatePercent: number | null;
  averageResponseMinutes: number | null;
  averageLateMinutes: number | null;
};

export type AcceptanceHistoryItem = {
  routeId: string;
  routeCode: string;
  publishedAt: string;
  acceptBy: string;
  acceptedAt: string | null;
  state: 'on_time' | 'late' | 'overdue_unaccepted' | 'pending';
  responseMinutes: number | null;
  lateMinutes: number;
};

export type DriverStats = {
  driver: Driver;
  totals: {
    trackingSessions: number;
    distanceMeters: number;
    offRouteCount: number;
    completedOrders: number;
    routes: number;
  };
  acceptance: AcceptanceSummary;
  recentAcceptances: AcceptanceHistoryItem[];
  frequentDestinations: { label: string; count: number }[];
  recentSessions: {
    id: string;
    routeId?: string | null;
    sessionType?: 'delivery' | 'test';
    label?: string | null;
    status: string;
    startedAt: string;
    endedAt?: string | null;
    distanceMeters: number;
    offRouteCount: number;
  }[];
};

export async function fetchAppDrivers(params?: {
  approvalStatus?: DriverApprovalStatus;
  includeArchived?: boolean;
}) {
  const search = new URLSearchParams();
  if (params?.approvalStatus) search.set('approvalStatus', params.approvalStatus);
  if (params?.includeArchived) search.set('includeArchived', 'true');
  const query = search.toString();
  const result = await request<ApiDriver[]>(`${APP_API_BASE}/drivers${query ? `?${query}` : ''}`);
  return result.map(normalizeDriver);
}

export async function createDriver(input: DriverMutationInput) {
  const result = await request<ApiDriver>(`${APP_API_BASE}/drivers`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeDriver(result);
}

export async function updateDriver(driverId: string, input: Partial<DriverMutationInput>) {
  const result = await request<ApiDriver>(
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
  return normalizeDriver(result);
}

export async function archiveDriver(driverId: string) {
  const result = await request<ApiDriver>(
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverId)}/archive`,
    { method: 'POST' },
  );
  return normalizeDriver(result);
}

export async function approveDriver(driverId: string, input?: { approvedBy?: string }) {
  const result = await request<ApiDriver>(
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverId)}/approve`,
    { method: 'POST', body: JSON.stringify(input ?? {}) },
  );
  return normalizeDriver(result);
}

export async function rejectDriver(driverId: string, reason: string) {
  const result = await request<ApiDriver>(
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverId)}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
  return normalizeDriver(result);
}

export async function fetchDriverStats(driverId: string): Promise<DriverStats> {
  const result = await request<Omit<DriverStats, 'driver'> & { driver: ApiDriver }>(
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverId)}/stats`,
  );
  return { ...result, driver: normalizeDriver(result.driver) };
}

export function upsertMessengerAccount(
  driverCode: string,
  input: { phone: string; pin: string; isActive?: boolean },
) {
  return request<{ id: string; driverCode: string; phone: string; isActive: boolean }>(
    // backend endpoint ยังเป็น .../rider-account
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverCode)}/rider-account`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}
