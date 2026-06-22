import type { Driver, Order, PlanningCancelReason } from '@/data/mock';
import type { DeliveryTrackingTab } from '@/lib/deliveryExecution';
import type { SubmitDeliveryInput } from '@/state/retail/types';

const RIDER_API_BASE =
  (import.meta.env.VITE_RIDER_API_BASE_URL as string | undefined) ?? '/api/rider';
const APP_API_BASE = (import.meta.env.VITE_APP_API_BASE_URL as string | undefined) ?? '/api/app';
const RIDER_TOKEN_KEY = 'movevai:rider-token';

export type ApiDriver = Omit<Driver, 'id'> & { id: string; code: string };
type ApiOrder = Order & { assignedDriver?: ApiDriver };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null) headers.set('content-type', 'application/json');
  if (url.startsWith(RIDER_API_BASE)) {
    const token = localStorage.getItem(RIDER_TOKEN_KEY);
    if (token) headers.set('authorization', `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // response ไม่ใช่ JSON
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function normalizeDriver(driver: ApiDriver): Driver {
  return { ...driver, id: driver.code };
}

function normalizeOrder(order: ApiOrder): Order {
  return {
    ...order,
    assignedDriverId: order.assignedDriver?.code,
    proofOfDelivery: order.proofOfDelivery
      ? {
          ...order.proofOfDelivery,
          capturedByDriverId:
            order.assignedDriver?.code ?? order.proofOfDelivery.capturedByDriverId,
        }
      : undefined,
  };
}

function serializeOrderForBackend(order: Order) {
  return {
    id: order.id,
    code: order.code,
    source: order.source,
    status: order.status,
    receivedAt: new Date(order.receivedAt).toISOString(),
    lineContact: order.lineContact,
    handledBy: order.handledBy,
    confidence: order.confidence,
    customer: order.customer,
    items: order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      purity: item.purity,
      weight: item.weight,
      qty: item.qty,
      unitPrice: item.unitPrice,
      note: item.note,
    })),
    note: order.note,
    rawText: order.rawText,
    rawPreview: order.rawPreview,
    totalValue: order.totalValue,
    payment: order.payment,
    dispatchReadiness: order.dispatchReadiness,
    requiresIdCheck: order.requiresIdCheck,
    insured: order.insured,
    shippingMethod: order.shippingMethod,
  };
}

export type PlanningRoute = {
  id: string;
  code: string;
  plannedDate: string;
  plannedTime?: string;
  scheduledFor?: string;
  dispatchMode: 'scheduled' | 'urgent';
  acceptBy?: string;
  status: 'published' | 'active' | 'completed' | 'cancelled';
  note?: string;
  publishedAt: string;
  cancelledAt?: string;
  cancelReason?: PlanningCancelReason;
  cancelNote?: string;
  driver: ApiDriver;
  pushStatus: 'queued' | 'running' | 'succeeded' | 'failed';
  pushError?: string;
  reminderPushStatus?: 'queued' | 'running' | 'succeeded' | 'failed';
  reminderPushError?: string;
  stops: { id: string; sequence: number; status: string; order: ApiOrder }[];
};

function normalizeRoute(route: PlanningRoute): PlanningRoute {
  return {
    ...route,
    driver: { ...route.driver, id: route.driver.code },
    stops: route.stops.map((stop) => ({ ...stop, order: normalizeOrder(stop.order) })),
  };
}

// อ่าน orders จาก backend สำหรับ dashboard ฝั่ง web (ใช้ refresh/poll)
export async function fetchAppOrders(params?: { status?: string; take?: number }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.take != null) search.set('take', String(params.take));
  const query = search.toString();
  const result = await request<{ items: ApiOrder[]; total: number }>(
    `${APP_API_BASE}/orders${query ? `?${query}` : ''}`,
  );
  return { orders: result.items.map(normalizeOrder), total: result.total };
}

export type DeliveryTrackingCounts = Record<DeliveryTrackingTab, number>;

export async function fetchDeliveryTrackingOrders(params: {
  tab: DeliveryTrackingTab;
  query?: string;
  take: number;
  skip: number;
}) {
  const search = new URLSearchParams({
    tab: params.tab,
    take: String(params.take),
    skip: String(params.skip),
  });
  if (params.query?.trim()) search.set('q', params.query.trim());
  const result = await request<{ items: ApiOrder[]; total: number; take: number; skip: number }>(
    `${APP_API_BASE}/tracking/orders?${search.toString()}`,
  );
  return { ...result, orders: result.items.map(normalizeOrder) };
}

export function fetchDeliveryTrackingCounts() {
  return request<DeliveryTrackingCounts>(`${APP_API_BASE}/tracking/counts`);
}

export type LiveRiderTracking = {
  id: string;
  routeId: string | null;
  sessionType: string;
  label: string | null;
  startedAt: string;
  distanceMeters: number;
  driver: { code: string; name: string };
  route: { code: string; status: string } | null;
  latest: null | {
    lat: number | string;
    lng: number | string;
    accuracy: number;
    recordedAt: string;
    offRoute: boolean;
  };
};

export type RiderTrackingHistory = LiveRiderTracking & {
  endedAt?: string | null;
  endReason?: string | null;
  status: string;
  plannedGeometryJson?: { lat: number; lng: number }[];
  points: {
    id: string;
    lat: number | string;
    lng: number | string;
    accuracy: number;
    recordedAt: string;
    offRoute: boolean;
  }[];
};

// สรุป session ย้อนหลัง (ไม่มี points) สำหรับหน้า Tracking History
export type RiderTrackingSessionSummary = {
  id: string;
  routeId: string | null;
  sessionType: string;
  label: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  endReason: string | null;
  distanceMeters: number;
  offRouteCount: number;
  pointCount: number;
  driver: { code: string; name: string };
  route: { code: string } | null;
};

export function fetchLiveRiders() {
  return request<LiveRiderTracking[]>(`${APP_API_BASE}/tracking/riders/latest`);
}

export function fetchRiderTrackingHistory(sessionId: string) {
  return request<RiderTrackingHistory>(
    `${APP_API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function fetchTrackingSessions(params?: { date?: string; driverCode?: string }) {
  const search = new URLSearchParams();
  if (params?.date) search.set('date', params.date);
  if (params?.driverCode) search.set('driverCode', params.driverCode);
  const query = search.toString();
  return request<RiderTrackingSessionSummary[]>(
    `${APP_API_BASE}/tracking/sessions${query ? `?${query}` : ''}`,
  );
}

export async function fetchAppOrder(orderId: string) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/${encodeURIComponent(orderId)}`);
  return normalizeOrder(result);
}

export async function fetchAppDrivers() {
  const result = await request<ApiDriver[]>(`${APP_API_BASE}/drivers`);
  return result.map(normalizeDriver);
}

export function upsertRiderAccount(
  driverCode: string,
  input: { phone: string; pin: string; isActive?: boolean },
) {
  return request<{ id: string; driverCode: string; phone: string; isActive: boolean }>(
    `${APP_API_BASE}/drivers/${encodeURIComponent(driverCode)}/rider-account`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function syncAndAssignOrder(order: Order, driverCode: string) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/assign`, {
    method: 'POST',
    body: JSON.stringify({ order: serializeOrderForBackend(order), driverCode }),
  });
  return normalizeOrder(result);
}

export async function syncAppOrder(order: Order) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/sync`, {
    method: 'POST',
    body: JSON.stringify({ order: serializeOrderForBackend(order) }),
  });
  return normalizeOrder(result);
}

export async function savePlanning(input: {
  orderIds: string[];
  plannedDate: string;
  plannedTime?: string;
  driverCode?: string;
  dispatchReadiness?: Order['dispatchReadiness'];
  note?: string;
}) {
  const result = await request<{ items: ApiOrder[] }>(`${APP_API_BASE}/planning/plans`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return result.items.map(normalizeOrder);
}

export async function clearPlanning(
  orderIds: string[],
  input?: { reason?: PlanningCancelReason; note?: string },
) {
  return request<{ cleared: number }>(`${APP_API_BASE}/planning/plans/clear`, {
    method: 'POST',
    body: JSON.stringify({ orderIds, reason: input?.reason, note: input?.note }),
  });
}

export async function publishPlanningRoute(input: {
  orderIds: string[];
  plannedDate: string;
  plannedTime?: string;
  driverCode: string;
  note?: string;
}) {
  const route = await request<PlanningRoute>(`${APP_API_BASE}/planning/routes/publish`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeRoute(route);
}

export async function publishUrgentPlanningRoute(input: {
  orderId: string;
  driverCode: string;
  note?: string;
}) {
  const route = await request<PlanningRoute>(`${APP_API_BASE}/planning/routes/urgent`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeRoute(route);
}

export async function fetchPlanningRoutes(date?: string) {
  const search = date ? `?date=${encodeURIComponent(date)}` : '';
  const routes = await request<PlanningRoute[]>(`${APP_API_BASE}/planning/routes${search}`);
  return routes.map(normalizeRoute);
}

export async function retryPlanningRoutePush(routeId: string) {
  const route = await request<PlanningRoute>(
    `${APP_API_BASE}/planning/routes/${encodeURIComponent(routeId)}/push/retry`,
    { method: 'POST' },
  );
  return normalizeRoute(route);
}

export async function cancelPlanningRoute(
  routeId: string,
  input: { reason: PlanningCancelReason; note?: string },
) {
  const route = await request<PlanningRoute>(
    `${APP_API_BASE}/planning/routes/${encodeURIComponent(routeId)}/cancel`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return normalizeRoute(route);
}

export async function reassignPlanningRoute(
  routeId: string,
  input: { driverCode: string; note?: string },
) {
  const route = await request<PlanningRoute>(
    `${APP_API_BASE}/planning/routes/${encodeURIComponent(routeId)}/reassign`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return normalizeRoute(route);
}

export async function fetchRiderOrders(_driverCode: string) {
  const result = await request<{ driver: ApiDriver; items: ApiOrder[] }>(
    `${RIDER_API_BASE}/orders`,
  );
  return {
    driver: normalizeDriver(result.driver),
    orders: result.items.map(normalizeOrder),
  };
}

/**
 * รายการที่ rider ส่งสำเร็จแล้ว — projection แบบ privacy-minimal
 * (ไม่มีชื่อ/เบอร์/ที่อยู่ลูกค้า, ไม่มีมูลค่าสินค้า, ไม่มีระดับความเสี่ยง)
 */
export type RiderCompletedDelivery = {
  id: string;
  code: string;
  deliveredAt: string;
  itemCount: number;
  cod?: { collected: boolean; amount?: number };
  proof?: { photoCount: number; signatureCaptured: boolean; otpVerified: boolean };
};

export type RiderCompletedPage = {
  driver: ApiDriver;
  /** ส่งกลับเฉพาะหน้าแรก (cursor ว่าง) เพื่อลดภาระ count ฝั่ง DB */
  total?: number;
  items: RiderCompletedDelivery[];
  /** null = ไม่มีหน้าถัดไป */
  nextCursor: string | null;
};

export async function fetchRiderCompletedDeliveries(
  _driverCode: string,
  params?: { limit?: number; cursor?: string },
) {
  const search = new URLSearchParams();
  search.set('limit', String(params?.limit ?? 20));
  if (params?.cursor) search.set('cursor', params.cursor);
  return request<RiderCompletedPage>(`${RIDER_API_BASE}/completed?${search.toString()}`);
}

export async function startRiderOrder(orderId: string, _driverCode: string) {
  const result = await request<ApiOrder>(
    `${RIDER_API_BASE}/orders/${encodeURIComponent(orderId)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );
  return normalizeOrder(result);
}

export async function submitRiderOrder(
  orderId: string,
  _driverCode: string,
  proof: SubmitDeliveryInput,
) {
  const result = await request<ApiOrder>(
    `${RIDER_API_BASE}/orders/${encodeURIComponent(orderId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({ proof }),
    },
  );
  return normalizeOrder(result);
}

export type RiderSession = {
  token: string;
  rider: { id: string; code: string; name: string; phone: string };
};

export async function loginRider(phone: string, pin: string, deviceId: string) {
  const session = await request<RiderSession>(`${RIDER_API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ phone, pin, deviceId }),
  });
  localStorage.setItem(RIDER_TOKEN_KEY, session.token);
  localStorage.setItem('movevai:rider-code', session.rider.code);
  return session;
}

export function hasRiderSession() {
  return Boolean(localStorage.getItem(RIDER_TOKEN_KEY));
}

export async function logoutRider() {
  try {
    await request<{ ok: boolean }>(`${RIDER_API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    /* clear local session even when offline/expired */
  }
  localStorage.removeItem(RIDER_TOKEN_KEY);
  localStorage.removeItem('movevai:rider-code');
}

export type RiderTrackingSession = {
  id: string;
  routeId: string;
  startedAt: string;
  status: string;
};
export function startRiderRoute(routeId: string, deviceId: string) {
  return request<RiderTrackingSession>(
    `${RIDER_API_BASE}/routes/${encodeURIComponent(routeId)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({ deviceId }),
    },
  );
}

export function sendRiderLocations(sessionId: string, points: RiderLocationPayload[]) {
  return request<{ accepted: number; received: number }>(`${RIDER_API_BASE}/tracking/locations`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, points }),
  });
}

export function endRiderRoute(routeId: string, reason?: string) {
  return request<RiderTrackingSession>(
    `${RIDER_API_BASE}/routes/${encodeURIComponent(routeId)}/end`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

// Test Route: เริ่ม/จบ การบันทึกเส้นทางโดยไม่ผูกกับงานลูกค้า (ทดสอบ GPS)
export function startRiderTestRoute(deviceId: string, label?: string) {
  return request<RiderTrackingSession>(`${RIDER_API_BASE}/tracking/test/start`, {
    method: 'POST',
    body: JSON.stringify({ deviceId, label }),
  });
}

export function endRiderTestSession(sessionId: string, reason?: string) {
  return request<RiderTrackingSession>(
    `${RIDER_API_BASE}/tracking/test/${encodeURIComponent(sessionId)}/end`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );
}

export type RiderLocationPayload = {
  clientPointId: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  recordedAt: string;
};

export async function confirmAppDelivery(
  orderId: string,
  input?: { note?: string; recordedBy?: { name: string; department: string; role?: string } },
) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/confirm-delivery`,
    {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    },
  );
  return normalizeOrder(result);
}
