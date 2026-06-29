import { Capacitor } from '@capacitor/core';
import type { Driver, Order, PlanningCancelReason, ShippingMethod } from '@/data/mock';
import type { DeliveryTrackingTab } from '@/lib/deliveryExecution';
import type { SubmitDeliveryInput } from '@/state/retail/types';

// running inside a Capacitor native shell (iOS/Android) — there is no vite/reverse proxy here
const IS_NATIVE_APP = Capacitor.isNativePlatform();

function normalizeApiBase(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

const MESSENGER_API_BASE = normalizeApiBase(
  import.meta.env.VITE_MESSENGER_API_BASE_URL as string | undefined,
  IS_NATIVE_APP ? 'http://localhost:4000/v1/rider' : '/api/messenger',
);
const APP_API_BASE = normalizeApiBase(
  import.meta.env.VITE_APP_API_BASE_URL as string | undefined,
  IS_NATIVE_APP ? 'http://localhost:4000/v1/app' : '/api/app',
);

// vite proxy (dev) แนบ x-internal-key ให้ทุก /api/* request; ใน native ไม่มี proxy จึงต้องแนบเองจาก env.
// ⚠️ การฝัง internal key ลงแอปที่ ship จริงสกัดออกได้ — ใช้กับ build ภายใน/ทดสอบเท่านั้น
// production จริงควรให้ backend รับ rider Bearer token ตรงๆ โดยไม่ต้องใช้ internal key
const INTERNAL_API_KEY = import.meta.env.VITE_INTERNAL_API_KEY as string | undefined;

// native app ไม่มี proxy: base ที่เป็น path ล้วน (/api/...) จะถูก resolve เป็น
// capacitor://localhost/api/... ซึ่งไม่มีเซิร์ฟเวอร์รองรับ → ต้องตั้ง absolute URL ตอน build
// (ดู .env.capacitor.example + `npm run cap:*`). เตือนแต่เนิ่นๆ แทนที่จะปล่อยให้ fetch fail เงียบๆ
if (IS_NATIVE_APP && (MESSENGER_API_BASE.startsWith('/') || APP_API_BASE.startsWith('/'))) {
  console.error(
    '[retailApi] กำลังรันใน native app แต่ API base ยังเป็น relative path. ' +
      'ตั้ง VITE_MESSENGER_API_BASE_URL / VITE_APP_API_BASE_URL เป็น absolute backend URL ตอน build ' +
      '(เช่นใน .env.capacitor) ไม่งั้น request จะยิงไปที่ capacitor://localhost แล้ว fail.',
  );
}

const MESSENGER_TOKEN_KEY = 'movevai:messenger-token';
const ROAD_ROUTE_TIMEOUT_MS = 7_000;
export const MESSENGER_AUTH_EXPIRED_EVENT = 'movevai:messenger-auth-expired';

export type ApiDriver = Omit<Driver, 'id'> & { id: string; code: string };
type ApiOrder = Order & { assignedDriver?: ApiDriver };

function proofPayload(input: SubmitDeliveryInput) {
  const { editorRole: _editorRole, recordedBy: _recordedBy, ...proof } = input;
  return proof;
}

export class MessengerAuthError extends Error {
  constructor(message = 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่') {
    super(message);
    this.name = 'MessengerAuthError';
  }
}

export function isMessengerAuthError(error: unknown): error is MessengerAuthError {
  return error instanceof MessengerAuthError;
}

function clearLocalMessengerSession(notify = false) {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.removeItem('movevai:messenger-code');
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MESSENGER_AUTH_EXPIRED_EVENT));
  }
}

function assertNativeRequestUrl(url: string) {
  if (!IS_NATIVE_APP || !url.startsWith('/')) return;
  throw new Error(
    'ตั้งค่า API สำหรับ iOS native ไม่ถูกต้อง: ต้องใช้ backend URL แบบเต็ม เช่น http://localhost:4000/v1/rider หรือรัน npm run build:cap ก่อน npx cap sync ios',
  );
}

function networkErrorMessage(url: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (IS_NATIVE_APP && /expected pattern/i.test(message)) {
    return 'URL ของ API ไม่ถูกต้องสำหรับ iOS native กรุณา build ใหม่ด้วย backend URL แบบเต็ม';
  }
  if (IS_NATIVE_APP && url.startsWith('http://localhost:4000')) {
    return `เชื่อมต่อ backend ที่ http://localhost:4000 ไม่ได้ — ตรวจว่า backend รันอยู่บนเครื่อง Mac แล้วลองใหม่ (${message})`;
  }
  return message;
}

function validationFieldSummary(details: unknown) {
  if (!details || typeof details !== 'object') return '';
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return '';

  return Object.entries(fieldErrors)
    .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join(' · ');
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  assertNativeRequestUrl(url);
  const headers = new Headers(init?.headers);
  if (init?.body != null) headers.set('content-type', 'application/json');
  // native build: แนบ internal key เองแทน vite proxy (web/dev ปล่อยให้ proxy จัดการ)
  if (IS_NATIVE_APP && INTERNAL_API_KEY && !headers.has('x-internal-key')) {
    headers.set('x-internal-key', INTERNAL_API_KEY);
  }
  const isMessengerRequest = url.startsWith(MESSENGER_API_BASE);
  let messengerToken: string | null = null;
  if (isMessengerRequest) {
    messengerToken = localStorage.getItem(MESSENGER_TOKEN_KEY);
    if (messengerToken) headers.set('authorization', `Bearer ${messengerToken}`);
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    throw new Error(networkErrorMessage(url, error));
  }
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        error?: { message?: string; details?: unknown };
      };
      message = body.error?.message ?? message;
      const fieldSummary = validationFieldSummary(body.error?.details);
      if (fieldSummary) message = `${message}: ${fieldSummary}`;
    } catch {
      // response ไม่ใช่ JSON
    }
    const messengerTokenExpired =
      isMessengerRequest &&
      messengerToken &&
      // backend ยังใช้ path /v1/rider — ข้อความ error ฝั่ง server ยังเป็น "rider token"
      (response.status === 401 || /invalid or expired rider token/i.test(message));
    if (messengerTokenExpired) {
      clearLocalMessengerSession(true);
      throw new MessengerAuthError(message);
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('คำนวณระยะตามถนนใช้เวลานานเกินไป');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export type GeoCoordinate = { lat: number; lng: number };
export type RouteOrigin = GeoCoordinate;

/**
 * geocode ที่อยู่เดี่ยว → พิกัด ผ่าน backend (provider เดียวกับ route planning)
 * ใช้ทำ preview ปลายทางฝั่ง admin ก่อนจัดคิว — null = หาพิกัดไม่ได้
 */
export async function geocodeAddress(address: string): Promise<GeoCoordinate | null> {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const result = await request<{ coordinate: GeoCoordinate | null }>(
    `${APP_API_BASE}/geocode?q=${encodeURIComponent(trimmed)}`,
  );
  return result.coordinate;
}

// ── Thai address autocomplete (จังหวัด → อำเภอ → ตำบล → รหัสไปรษณีย์) ──
// ข้อมูลจาก backend (jquery.Thailand.js / Thaipost) โหลดใน memory ฝั่ง api
export type ThaiAddressRecord = {
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  subdistrictCode: number;
  districtCode: number;
  provinceCode: number;
};

export async function fetchAddressProvinces(): Promise<string[]> {
  const result = await request<{ results: Array<{ province: string }> }>(
    `${APP_API_BASE}/address/provinces`,
  );
  return result.results.map((r) => r.province);
}

export async function fetchAddressDistricts(province: string): Promise<string[]> {
  const trimmed = province.trim();
  if (!trimmed) return [];
  const result = await request<{ results: Array<{ district: string }> }>(
    `${APP_API_BASE}/address/districts?province=${encodeURIComponent(trimmed)}`,
  );
  return result.results.map((r) => r.district);
}

export type ParsedThaiAddress = {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
  matched: { province: boolean; district: boolean; subdistrict: boolean; postalCode: boolean };
  score: number;
};

// แยกที่อยู่ยาว ๆ 1 บรรทัด → เดา จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ อัตโนมัติ (null = เดาไม่ได้)
export async function parseAddress(raw: string): Promise<ParsedThaiAddress | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const result = await request<{ result: ParsedThaiAddress | null }>(
    `${APP_API_BASE}/address/parse?q=${encodeURIComponent(trimmed)}`,
  );
  return result.result;
}

export async function fetchAddressSubdistricts(
  province: string,
  district: string,
): Promise<Array<{ subdistrict: string; postalCode: string }>> {
  const p = province.trim();
  const d = district.trim();
  if (!p || !d) return [];
  const result = await request<{ results: Array<{ subdistrict: string; postalCode: string }> }>(
    `${APP_API_BASE}/address/subdistricts?province=${encodeURIComponent(p)}&district=${encodeURIComponent(d)}`,
  );
  return result.results;
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
  plannedDistanceMeters?: number;
  plannedGeometryJson?: { lat: number; lng: number }[];
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
export async function fetchAppOrders(params?: { status?: string; take?: number; q?: string }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.take != null) search.set('take', String(params.take));
  if (params?.q?.trim()) search.set('q', params.q.trim());
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

// ปลายทางของ route ที่กำลังส่ง — มาจาก backend (geocode ฝั่ง server) เพื่อให้ทั้ง messenger
// และ admin อ้างพิกัดชุดเดียวกัน ไม่ต้องต่างคน geocode เอง
export type MessengerDestination = {
  orderId?: string;
  /** ชื่อลูกค้า/ป้ายกำกับสั้นๆ */
  label?: string | null;
  address?: string | null;
  lat: number | string;
  lng: number | string;
  /** สถานะ stop เช่น delivered — ใช้แยกสีหมุดที่ส่งแล้ว (optional) */
  status?: string | null;
  /** ลำดับ stop ในรอบส่ง (optional) */
  sequence?: number;
};

export type MessengerProofLocation = {
  orderId?: string;
  label?: string | null;
  lat: number | string;
  lng: number | string;
  capturedAt?: string | null;
  accuracy?: number | null;
  sequence?: number;
};

export type LiveMessengerTracking = {
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
  /** หมุดปลายทางของรอบนี้ — backend ส่งมาเมื่อพร้อม (ยังไม่มีก็ไม่วาด) */
  destinations?: MessengerDestination[];
};

export type MessengerTrackingHistory = LiveMessengerTracking & {
  endedAt?: string | null;
  endReason?: string | null;
  status: string;
  plannedGeometryJson?: { lat: number; lng: number }[];
  /** จุดส่งจริงจาก GPS ตอนปิดงานของแต่ละ order ใน route */
  proofLocations?: MessengerProofLocation[];
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
export type MessengerTrackingSessionSummary = {
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

export function fetchLiveMessengers() {
  // backend endpoint ยังเป็น /tracking/riders/latest
  return request<LiveMessengerTracking[]>(`${APP_API_BASE}/tracking/riders/latest`);
}

export function fetchMessengerTrackingHistory(sessionId: string) {
  return request<MessengerTrackingHistory>(
    `${APP_API_BASE}/tracking/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function fetchTrackingSessions(params?: { date?: string; driverCode?: string }) {
  const search = new URLSearchParams();
  if (params?.date) search.set('date', params.date);
  if (params?.driverCode) search.set('driverCode', params.driverCode);
  const query = search.toString();
  return request<MessengerTrackingSessionSummary[]>(
    `${APP_API_BASE}/tracking/sessions${query ? `?${query}` : ''}`,
  );
}

export async function fetchAppOrder(orderId: string) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/${encodeURIComponent(orderId)}`);
  return normalizeOrder(result);
}

/**
 * ดึง order สำหรับหน้าติดตามลูกค้า โดยรับได้ทั้ง order **code** (ORD-...) ที่ลูกค้ารู้จัก
 * และ order **id** (O-...) ของลิงก์เก่า — backend `/orders/:id` รับเฉพาะ id
 * จึง resolve code → id ผ่าน q-search ก่อน แล้วค่อยดึงรายละเอียดเต็มด้วย id
 */
export async function fetchCustomerOrder(idOrCode: string) {
  try {
    const { orders } = await fetchAppOrders({ q: idOrCode, take: 5 });
    const match = orders.find((order) => order.code === idOrCode || order.id === idOrCode);
    if (match) return fetchAppOrder(match.id);
  } catch {
    // q-search ใช้ไม่ได้ — fallback ไป lookup ด้วย id ตรงๆ ด้านล่าง
  }
  return fetchAppOrder(idOrCode);
}

/**
 * ตำแหน่งล่าสุดของคนส่งที่กำลังวิ่งไปส่งออเดอร์นี้ — projection แบบ privacy-minimal
 * สำหรับหน้าติดตามฝั่งลูกค้า. คืน null เมื่อยังไม่มีคนเริ่มวิ่ง/ไม่มีสัญญาณ GPS.
 *
 * NOTE (prototype): กรองจาก endpoint /tracking/riders/latest ฝั่ง client.
 * production ควรมี endpoint สาธารณะเฉพาะ order เดียว + ผูกกับ tracking token + OTP.
 */
export type CustomerLiveTracking = {
  /** ชื่อต้นของคนส่ง (ไม่เปิดเผยชื่อเต็ม/เบอร์) */
  messengerName: string;
  recordedAt: string;
  position: { lat: number; lng: number };
  destination: { lat: number; lng: number } | null;
};

function toLatLng(value: { lat: number | string; lng: number | string }) {
  const lat = typeof value.lat === 'string' ? Number(value.lat) : value.lat;
  const lng = typeof value.lng === 'string' ? Number(value.lng) : value.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export async function fetchCustomerLiveTracking(
  orderId: string,
): Promise<CustomerLiveTracking | null> {
  const sessions = await fetchLiveMessengers();
  for (const session of sessions) {
    const isForOrder = session.destinations?.some((dest) => dest.orderId === orderId);
    if (!isForOrder || !session.latest) continue;

    const position = toLatLng(session.latest);
    if (!position) continue;

    const destRaw = session.destinations?.find((dest) => dest.orderId === orderId);
    const destination = destRaw ? toLatLng(destRaw) : null;

    return {
      messengerName: session.driver.name.split(/\s+/)[0] ?? 'พนักงานจัดส่ง',
      recordedAt: session.latest.recordedAt,
      position,
      destination,
    };
  }
  return null;
}

export async function fetchAppDrivers() {
  const result = await request<ApiDriver[]>(`${APP_API_BASE}/drivers`);
  return result.map(normalizeDriver);
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

export type RoutePreview = {
  distanceMeters: number | null;
  durationSeconds: number | null;
  geometry: { lat: number; lng: number }[];
};

/**
 * พรีวิวเส้นทางตามถนน (ต้นทาง → จุดส่ง) ก่อน Publish — backend คำนวณผ่าน OSRM
 * ใช้ origin จาก GPS ของ admin ถ้ามี ไม่งั้น backend จะ fallback ไปต้นทางใน env
 */
export async function previewPlanningRoute(input: { orderIds: string[]; origin?: RouteOrigin }) {
  return request<RoutePreview>(`${APP_API_BASE}/planning/routes/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function publishPlanningRoute(input: {
  orderIds: string[];
  plannedDate: string;
  plannedTime?: string;
  driverCode: string;
  note?: string;
  origin?: RouteOrigin;
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
  origin?: RouteOrigin;
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

export type MessengerRoadRoute = {
  geometry: { lat: number; lng: number }[];
  distanceMeters: number | null;
  /** ระยะรายช่วง: legs[0] = จากจุดเริ่ม (ตำแหน่ง messenger) → จุดส่งถัดไป */
  legs: number[];
};

async function fetchPublicOsrmRoadRoute(points: { lat: number; lng: number }[]) {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');

  const response = await withTimeout(ROAD_ROUTE_TIMEOUT_MS, (signal) => fetch(url, { signal }));
  if (!response.ok) throw new Error(`OSRM route failed: ${response.status}`);
  const body = (await response.json()) as {
    routes?: {
      distance?: number;
      legs?: { distance?: number }[];
      geometry?: { coordinates?: [number, number][] };
    }[];
  };
  const route = body.routes?.[0];
  const geometry = route?.geometry?.coordinates?.map(([lng, lat]) => ({ lat, lng })) ?? [];

  return {
    geometry,
    distanceMeters: route?.distance ?? null,
    legs: route?.legs?.map((leg) => leg.distance ?? 0) ?? [],
  } satisfies MessengerRoadRoute;
}

function assertValidRoadRoute(route: MessengerRoadRoute) {
  if (route.geometry.length >= 2 && route.legs.length > 0) return route;
  throw new Error('ไม่พบเส้นทางถนนสำหรับตำแหน่งนี้');
}

async function fetchBackendMessengerRoadRoute(points: { lat: number; lng: number }[]) {
  const route = await withTimeout(ROAD_ROUTE_TIMEOUT_MS, (signal) =>
    request<MessengerRoadRoute>(`${MESSENGER_API_BASE}/route`, {
      method: 'POST',
      body: JSON.stringify({ points }),
      signal,
    }),
  );
  return assertValidRoadRoute(route);
}

async function firstValidRoadRoute(tasks: Promise<MessengerRoadRoute>[]) {
  return new Promise<MessengerRoadRoute>((resolve, reject) => {
    let pending = tasks.length;
    let lastError: unknown = new Error('คำนวณเส้นทางถนนไม่สำเร็จ');

    for (const task of tasks) {
      task
        .then((route) => {
          resolve(route);
        })
        .catch((error) => {
          lastError = error;
          pending -= 1;
          if (pending === 0) reject(lastError);
        });
    }
  });
}

/**
 * เส้นทางตามถนนระหว่างกำลังส่ง — points[0] = ตำแหน่ง messenger, ที่เหลือ = จุดส่ง
 * backend คำนวณผ่าน OSRM คืน geometry (วาดเส้นตามถนน) + legs (ระยะถึงจุดถัดไป)
 */
export async function fetchMessengerRoadRoute(points: { lat: number; lng: number }[]) {
  return firstValidRoadRoute([
    fetchBackendMessengerRoadRoute(points),
    fetchPublicOsrmRoadRoute(points).then(assertValidRoadRoute),
  ]);
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
  code: string;
  deliveredAt: string;
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

export async function submitAppDeliveryProof(orderId: string, input: SubmitDeliveryInput) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/submit-delivery-proof`,
    {
      method: 'POST',
      body: JSON.stringify({
        proof: proofPayload(input),
        recordedBy: input.recordedBy,
      }),
    },
  );
  return normalizeOrder(result);
}

export type MessengerSession = {
  token: string;
  // backend response field ยังเป็น "rider"
  rider: { id: string; code: string; name: string; phone: string };
};

export async function loginMessenger(phone: string, pin: string, deviceId: string) {
  const session = await request<MessengerSession>(`${MESSENGER_API_BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ phone, pin, deviceId }),
  });
  localStorage.setItem(MESSENGER_TOKEN_KEY, session.token);
  localStorage.setItem('movevai:messenger-code', session.rider.code);
  return session;
}

export function hasMessengerSession() {
  return Boolean(localStorage.getItem(MESSENGER_TOKEN_KEY));
}

export async function logoutMessenger() {
  try {
    await request<{ ok: boolean }>(`${MESSENGER_API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    /* clear local session even when offline/expired */
  }
  clearLocalMessengerSession();
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

export type ImportBatch = {
  id: string;
  source: string;
  sourceRef: string | null;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';
  totalRows: number;
  importedRows: number;
  errorRows: number;
  errorSummary: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatchRow = {
  id: string;
  rowIndex: number;
  rawData: Record<string, string>;
  status: 'PENDING' | 'IMPORTED' | 'ERROR';
  errorMessage: string | null;
  orderId: string | null;
  /** code ของออเดอร์อื่นที่เบอร์ตรงกัน (ข้ามไฟล์ได้) — null = ไม่ซ้ำ */
  duplicateOfCode: string | null;
};

export type ImportRejectReason = 'incomplete_data' | 'duplicate' | 'wrong_group' | 'other';

export type ImportModerationResult = { updated: number; skipped: number };

type ImportModerationInput = {
  orderIds: string[];
  shippingMethod?: ShippingMethod;
  reason?: ImportRejectReason;
  note?: string;
};

export type ImportOrderUpdateInput = {
  rawData?: Record<string, string>;
  customer: {
    name: string;
    phone: string;
    address: string;
    idCard?: string;
  };
  item: {
    sku: string;
    name: string;
    purity: string;
    weight: string;
    qty: number;
    unitPrice: number;
    note?: string;
  };
  totalValue: number;
  payment: Order['payment'];
  note?: string | null;
};

function importModeration(action: 'approve' | 'reject' | 'restore', input: ImportModerationInput) {
  return request<ImportModerationResult>(`${APP_API_BASE}/import-batches/orders/${action}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function approveImportOrders(orderIds: string[], shippingMethod?: ShippingMethod) {
  return importModeration('approve', { orderIds, shippingMethod });
}

export function rejectImportOrders(
  orderIds: string[],
  input?: { reason?: ImportRejectReason; note?: string },
) {
  return importModeration('reject', { orderIds, reason: input?.reason, note: input?.note });
}

export function restoreImportOrders(orderIds: string[]) {
  return importModeration('restore', { orderIds });
}

export function updateImportedOrder(orderId: string, input: ImportOrderUpdateInput) {
  return request<{ updated: true }>(
    `${APP_API_BASE}/import-batches/orders/${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export type ImportBatchDetail = ImportBatch & { rows: ImportBatchRow[] };

export async function fetchImportBatches(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.status) search.set('status', params.status);
  const qs = search.toString();
  return request<{ total: number; page: number; limit: number; batches: ImportBatch[] }>(
    `${APP_API_BASE}/import-batches${qs ? `?${qs}` : ''}`,
  );
}

export async function fetchImportBatch(id: string) {
  return request<ImportBatchDetail>(`${APP_API_BASE}/import-batches/${encodeURIComponent(id)}`);
}

function filenameFromContentDisposition(value: string | null) {
  const utf8Match = value?.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const asciiMatch = value?.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

export async function downloadImportBatchCsv(id: string) {
  const url = `${APP_API_BASE}/import-batches/${encodeURIComponent(id)}/raw-csv`;
  assertNativeRequestUrl(url);

  const headers = new Headers();
  if (IS_NATIVE_APP && INTERNAL_API_KEY) {
    headers.set('x-internal-key', INTERNAL_API_KEY);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new Error(networkErrorMessage(url, error));
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return {
    fileName: filenameFromContentDisposition(response.headers.get('content-disposition')),
    content: await response.text(),
  };
}
