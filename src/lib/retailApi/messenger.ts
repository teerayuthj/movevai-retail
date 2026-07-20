import type { Driver } from '@/data/orderTypes';
import type { SubmitDeliveryInput } from '@/state/retail/types';
import { Capacitor } from '@capacitor/core';
import {
  MESSENGER_API_BASE,
  MESSENGER_TOKEN_KEY,
  clearMessengerSession,
  proofPayload,
  request,
} from './client';
import { storeMessengerRefreshSession } from './messengerSessionStorage';
import { type ApiDriver, type ApiOrder, normalizeDriver, normalizeOrder } from './shared';
import type { DriverApprovalStatus } from './shared';
import type { MessengerProfileUpdateInput } from './drivers';
import type { MessengerTrackingHistory } from './deliveryTracking';

export async function fetchMessengerProfile() {
  const result = await request<ApiDriver>(`${MESSENGER_API_BASE}/me`);
  return normalizeDriver(result);
}

export async function updateMessengerProfile(input: MessengerProfileUpdateInput) {
  const result = await request<ApiDriver>(`${MESSENGER_API_BASE}/me`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return normalizeDriver(result);
}

export async function fetchMessengerOrders(_driverCode: string) {
  const result = await request<{ driver: ApiDriver; items: ApiOrder[] }>(
    `${MESSENGER_API_BASE}/orders`,
  );
  return {
    driver: normalizeDriver(result.driver),
    orders: result.items.map(normalizeOrder),
  };
}

/**
 * รายการที่ messenger ส่งสำเร็จแล้ว — projection แบบ privacy-minimal
 * (ไม่มีชื่อ/เบอร์/ที่อยู่ลูกค้า, ไม่มีมูลค่าสินค้า, ไม่มีระดับความเสี่ยง)
 */
export type MessengerCompletedDelivery = {
  id: string;
  orderNo: string;
  code: string;
  deliveredAt: string;
  /** เวลาเริ่มส่ง — ใช้โชว์ "ใช้เวลา X นาที" หลังจบงาน (undefined = งานเก่าก่อนมีข้อมูลนี้) */
  inTransitAt?: string;
  itemCount: number;
  cod?: { collected: boolean; amount?: number };
  proof?: { photoCount: number; signatureCaptured: boolean; otpVerified: boolean };
};

export type MessengerCompletedPage = {
  driver: ApiDriver;
  /** ส่งกลับเฉพาะหน้าแรก (cursor ว่าง) เพื่อลดภาระ count ฝั่ง DB */
  total?: number;
  items: MessengerCompletedDelivery[];
  /** null = ไม่มีหน้าถัดไป */
  nextCursor: string | null;
};

export async function fetchMessengerCompletedDeliveries(
  _driverCode: string,
  params?: { limit?: number; cursor?: string },
) {
  const search = new URLSearchParams();
  search.set('limit', String(params?.limit ?? 20));
  if (params?.cursor) search.set('cursor', params.cursor);
  return request<MessengerCompletedPage>(`${MESSENGER_API_BASE}/completed?${search.toString()}`);
}

export async function startMessengerOrder(orderId: string, _driverCode: string) {
  const result = await request<ApiOrder>(
    `${MESSENGER_API_BASE}/orders/${encodeURIComponent(orderId)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  return normalizeOrder(result);
}

export async function acceptMessengerOrder(orderId: string, _driverCode: string) {
  const result = await request<ApiOrder>(
    `${MESSENGER_API_BASE}/orders/${encodeURIComponent(orderId)}/accept`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return normalizeOrder(result);
}

type MessengerTripActionResult = {
  routeId: string;
  items: ApiOrder[];
};

export async function acceptMessengerTrip(routeId: string) {
  const result = await request<MessengerTripActionResult>(
    `${MESSENGER_API_BASE}/routes/${encodeURIComponent(routeId)}/accept`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return result.items.map(normalizeOrder);
}

export async function startMessengerTrip(routeId: string) {
  const result = await request<MessengerTripActionResult>(
    `${MESSENGER_API_BASE}/routes/${encodeURIComponent(routeId)}/start-delivery`,
    { method: 'POST', body: JSON.stringify({}) },
  );
  return result.items.map(normalizeOrder);
}

export async function submitMessengerOrder(
  orderId: string,
  _driverCode: string,
  proof: SubmitDeliveryInput,
) {
  const result = await request<ApiOrder>(
    `${MESSENGER_API_BASE}/orders/${encodeURIComponent(orderId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({ proof: proofPayload(proof) }),
    },
  );
  return normalizeOrder(result);
}

export type MessengerSession = {
  token: string;
  refreshToken: string;
  refreshExpiresAt: string;
  // backend response field ยังเป็น "rider"
  rider: { id: string; code: string; name: string; phone: string };
};

export type MessengerRegisterInput = {
  name: string;
  phone: string;
  pin: string;
  vehicle: Driver['vehicle'];
  vehicleColor?: string;
  licensePlate: string;
  idCardNumber: string;
  idCardPhotoDataUrl: string;
  profilePhotoDataUrl: string;
};

export type MessengerRegisterResult = {
  driver: {
    id: string;
    code: string;
    name: string;
    phone: string;
    approvalStatus: DriverApprovalStatus;
  };
};

export async function loginMessenger(phone: string, pin: string, deviceId: string) {
  const session = await request<MessengerSession>(`${MESSENGER_API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ phone, pin, deviceId, platform: Capacitor.getPlatform() }),
  });
  await storeMessengerRefreshSession({ refreshToken: session.refreshToken, deviceId });
  localStorage.setItem(MESSENGER_TOKEN_KEY, session.token);
  localStorage.setItem('movevai:messenger-code', session.rider.code);
  return session;
}

export function registerMessengerDriver(input: MessengerRegisterInput) {
  return request<MessengerRegisterResult>(`${MESSENGER_API_BASE}/register`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function hasMessengerSession() {
  return Boolean(localStorage.getItem(MESSENGER_TOKEN_KEY));
}

export type MessengerPresenceUpdate = {
  deviceId: string;
  platform: 'web' | 'ios' | 'android';
  appState: 'foreground' | 'background';
  locationPermission?: 'granted' | 'denied' | 'prompt' | 'unavailable' | 'error';
  location?: { lat: number; lng: number; accuracy: number; recordedAt: string };
};

export function updateMessengerPresence(input: MessengerPresenceUpdate) {
  return request<{ ok: boolean; lastHeartbeatAt: string; locationAt: string | null }>(
    `${MESSENGER_API_BASE}/presence`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function logoutMessenger() {
  try {
    await request<{ ok: boolean }>(`${MESSENGER_API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    /* clear local session even when offline/expired */
  }
  await clearMessengerSession();
}

export type MessengerTrackingSession = {
  id: string;
  routeId?: string | null;
  sessionType?: 'delivery' | 'test';
  label?: string | null;
  startedAt: string;
  status: string;
  isOwner?: boolean;
};

export type ActiveMessengerTrackingSession = MessengerTrackingSession & {
  route: { code: string } | null;
  isOwner: boolean;
  latest: null | {
    lat: number | string;
    lng: number | string;
    accuracy: number;
    speed?: number | null;
    heading?: number | null;
    recordedAt: string;
  };
};

export function fetchActiveMessengerTracking(deviceId: string) {
  return request<ActiveMessengerTrackingSession | null>(
    `${MESSENGER_API_BASE}/tracking/active?deviceId=${encodeURIComponent(deviceId)}`,
  );
}

export type MessengerOrderRouteHistory = {
  order: {
    id: string;
    orderNo: string;
    code: string;
    status: string;
    routeSequence: number | null;
  };
  route: {
    id: string;
    code: string;
    status: string;
    plannedGeometryJson?: { lat: number | string; lng: number | string }[] | null;
  } | null;
  proofLocation: {
    lat: number | string;
    lng: number | string;
    label?: string | null;
    capturedAt: string;
  } | null;
  /** เส้นทาง GPS ที่ messenger วิ่งจริง snap ให้เกาะถนนแล้ว (map matching) — null ถ้า match ไม่ได้ */
  matchedGeometryJson?: { lat: number | string; lng: number | string }[] | null;
  session: MessengerTrackingHistory | null;
};

export function fetchMessengerOrderRouteHistory(orderId: string) {
  return request<MessengerOrderRouteHistory>(
    `${MESSENGER_API_BASE}/orders/${encodeURIComponent(orderId)}/route-history`,
  );
}
export function startMessengerRoute(routeId: string, deviceId: string) {
  return request<MessengerTrackingSession>(
    `${MESSENGER_API_BASE}/routes/${encodeURIComponent(routeId)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    },
  );
}

export function sendMessengerLocations(
  sessionId: string,
  deviceId: string,
  points: MessengerLocationPayload[],
) {
  return request<{ accepted: number; received: number }>(
    `${MESSENGER_API_BASE}/tracking/locations`,
    {
      method: 'POST',
      body: JSON.stringify({ sessionId, deviceId, points }),
    },
  );
}

export function endMessengerRoute(routeId: string, reason?: string) {
  return request<MessengerTrackingSession>(
    `${MESSENGER_API_BASE}/routes/${encodeURIComponent(routeId)}/end`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

// Test Route: เริ่ม/จบ การบันทึกเส้นทางโดยไม่ผูกกับงานลูกค้า (ทดสอบ GPS)
export function startMessengerTestRoute(deviceId: string, label?: string) {
  return request<MessengerTrackingSession>(`${MESSENGER_API_BASE}/tracking/test/start`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, label }),
  });
}

export function endMessengerTestSession(sessionId: string, reason?: string) {
  return request<MessengerTrackingSession>(
    `${MESSENGER_API_BASE}/tracking/test/${encodeURIComponent(sessionId)}/end`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

export type MessengerLocationPayload = {
  clientPointId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  recordedAt: string;
};
