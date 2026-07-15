import type { Driver, Order } from '@/data/orderTypes';
import type { DeliveryTrackingTab } from '@/lib/deliveryExecution';
import { APP_API_BASE, request } from './client';
import { type ApiDriver, type ApiOrder, normalizeDriver, normalizeOrder } from './shared';

export type DeliveryTrackingCounts = Record<DeliveryTrackingTab, number>;

export type DeliveryReportStatus = 'all' | 'delivered' | 'failed' | 'returned';

export type DeliveryReportItem = {
  order: Order;
  driver: Driver | null;
  route: {
    id?: string | null;
    code?: string | null;
    plannedDate?: string | null;
    plannedTime?: string | null;
  } | null;
  proof: Order['proofOfDelivery'];
  proofHistory?: Order['proofHistory'];
  resolution?: Order['resolution'];
  timestamps: {
    receivedAt?: string | null;
    plannedAt?: string | null;
    inTransitAt?: string | null;
    submittedAt?: string | null;
    closedAt?: string | null;
  };
};

type ApiDeliveryReportItem = Omit<DeliveryReportItem, 'order' | 'driver'> & {
  order: ApiOrder;
  driver: ApiDriver | null;
};

export type DeliveryReportPage = {
  items: DeliveryReportItem[];
  total: number;
  take: number;
  skip: number;
};

export async function fetchDeliveryReport(params: {
  dateFrom: string;
  dateTo: string;
  status: DeliveryReportStatus;
  driverCode?: string;
  query?: string;
  take: number;
  skip: number;
}) {
  const search = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    status: params.status,
    take: String(params.take),
    skip: String(params.skip),
  });
  if (params.driverCode) search.set('driverCode', params.driverCode);
  if (params.query?.trim()) search.set('q', params.query.trim());
  const result = await request<
    Omit<DeliveryReportPage, 'items'> & { items: ApiDeliveryReportItem[] }
  >(`${APP_API_BASE}/reports/deliveries?${search.toString()}`);
  return {
    ...result,
    items: result.items.map((item) => ({
      ...item,
      order: normalizeOrder(item.order),
      driver: item.driver ? normalizeDriver(item.driver) : null,
    })),
  };
}

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

export type MessengerPresence = {
  driver: {
    code: string;
    name: string;
    status: string;
    activeOrders: number;
  };
  presence: null | {
    deviceId: string;
    platform: 'web' | 'ios' | 'android';
    appState: 'foreground' | 'background';
    locationPermission: 'granted' | 'denied' | 'prompt' | 'unavailable' | 'error' | null;
    lastHeartbeatAt: string;
    deviceCount: number;
    activeDeviceCount: number;
    location: null | {
      lat: number | string;
      lng: number | string;
      accuracy: number | null;
      recordedAt: string;
      deviceId: string;
    };
  };
  tracking: {
    active: boolean;
    sessionId?: string;
    routeId?: string | null;
    sessionType?: string;
    startedAt?: string;
  };
  assignment: null | {
    id: string;
    code: string;
    status: string;
    requiresAcceptance: boolean;
    acceptedAt: string | null;
    acceptBy: string | null;
    acceptOverdue: boolean;
    startPolicy: 'manual' | 'accept_starts';
    openStopCount: number;
    stage: 'assigned' | 'awaiting_acceptance' | 'accepted' | 'in_transit';
  };
};

export function fetchMessengerPresences() {
  return request<MessengerPresence[]>(`${APP_API_BASE}/tracking/riders/presence`);
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
