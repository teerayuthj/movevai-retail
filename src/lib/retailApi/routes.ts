import type { Order, PlanningCancelReason } from '@/data/orderTypes';
import type { RouteStop, RouteStopKind, RouteTemplate } from '@/features/dispatch/types';
import {
  APP_API_BASE,
  MESSENGER_API_BASE,
  ROAD_ROUTE_TIMEOUT_MS,
  request,
  withTimeout,
} from './client';
import { type ApiDriver, type ApiOrder, normalizeOrder } from './shared';
import type { RouteOrigin } from './geo';

export type PlanningRoute = {
  id: string;
  code: string;
  plannedDate: string;
  plannedTime?: string;
  scheduledFor?: string;
  dispatchMode: 'scheduled' | 'urgent';
  acceptBy?: string;
  requiresAcceptance?: boolean;
  acceptedAt?: string;
  startBy?: string;
  acceptWithinMinutes?: number;
  startWithinMinutes?: number;
  startPolicy?: 'manual' | 'accept_starts';
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

export type RouteTemplateRun = {
  id: string;
  plannedDate: string;
  orderIds: string[];
  status: 'planned' | 'dispatched' | 'failed' | 'creating';
  routeId?: string;
};

export type RouteAddress = Omit<RouteStop, 'deliverToStopId'> & {
  routeGroup: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export async function fetchRouteTemplates() {
  return request<RouteTemplate[]>(`${APP_API_BASE}/route-templates`);
}

export async function fetchRouteAddresses() {
  return request<RouteAddress[]>(`${APP_API_BASE}/route-addresses`);
}

export async function createRouteAddress(
  input: Omit<RouteAddress, 'id' | 'active' | 'sortOrder' | 'createdAt' | 'updatedAt'>,
) {
  return request<RouteAddress>(`${APP_API_BASE}/route-addresses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRouteAddress(
  addressId: string,
  input: Partial<Omit<RouteAddress, 'id' | 'active' | 'sortOrder' | 'createdAt' | 'updatedAt'>>,
) {
  return request<RouteAddress>(`${APP_API_BASE}/route-addresses/${encodeURIComponent(addressId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function deleteRouteAddress(addressId: string) {
  return request<{ deleted: true }>(
    `${APP_API_BASE}/route-addresses/${encodeURIComponent(addressId)}`,
    { method: 'DELETE' },
  );
}

// จัดลำดับคลังที่อยู่ใหม่ภายในกลุ่ม kind เดียว (drag-and-drop) — คืนคลังทั้งหมดที่เรียงใหม่แล้ว
export async function reorderRouteAddresses(input: { kind: RouteStopKind; orderedIds: string[] }) {
  return request<RouteAddress[]>(`${APP_API_BASE}/route-addresses/reorder`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createRouteTemplate(
  input: Omit<RouteTemplate, 'id' | 'createdAt' | 'updatedAt'>,
) {
  return request<RouteTemplate>(`${APP_API_BASE}/route-templates`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateRouteTemplate(
  templateId: string,
  input: Partial<Omit<RouteTemplate, 'id' | 'createdAt' | 'updatedAt'>>,
) {
  return request<RouteTemplate>(
    `${APP_API_BASE}/route-templates/${encodeURIComponent(templateId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export async function deleteRouteTemplate(templateId: string) {
  return request<{ deleted: true }>(
    `${APP_API_BASE}/route-templates/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
  );
}

export async function createRouteTemplateRun(
  templateId: string,
  input: {
    /** เลือกเฉพาะงานรับ → ส่งที่จะวิ่งในเที่ยวนี้ ป้องกันการส่งทั้งสายโดยไม่ตั้งใจ */
    selectedPickupStopIds: string[];
    plannedDate?: string;
    plannedTime?: string;
    driverId?: string;
    dispatchMode?: 'planning' | 'scheduled' | 'immediate';
    messengerTitle?: string;
    note?: string;
  },
) {
  return request<RouteTemplateRun>(
    `${APP_API_BASE}/route-templates/${encodeURIComponent(templateId)}/runs`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function createAdHocRouteRun(input: {
  name: string;
  messengerTitle?: string;
  stops: RouteTemplate['stops'];
  plannedDate: string;
  plannedTime?: string;
  driverId?: string;
  dispatchMode: 'planning' | 'scheduled' | 'immediate';
  note?: string;
  jobType?: RouteTemplate['jobType'];
  acceptWithinMinutes?: number;
  startWithinMinutes?: number;
  startPolicy?: RouteTemplate['startPolicy'];
}) {
  return request<RouteTemplateRun>(`${APP_API_BASE}/route-runs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
  const preview = await request<RoutePreview>(`${APP_API_BASE}/planning/routes/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (preview.geometry.length < 2 || preview.distanceMeters == null) {
    throw new Error('หาพิกัดปลายทางหรือเส้นทางถนนไม่พบ กรุณาตรวจสอบที่อยู่แล้วลองใหม่');
  }
  return preview;
}

export async function publishPlanningRoute(input: {
  orderIds: string[];
  plannedDate: string;
  plannedTime?: string;
  driverCode: string;
  note?: string;
  origin?: RouteOrigin;
  requiresAcceptance?: boolean;
  acceptWithinMinutes?: number;
  startWithinMinutes?: number;
  startPolicy?: 'manual' | 'accept_starts';
}) {
  const route = await request<PlanningRoute>(`${APP_API_BASE}/planning/routes/publish`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeRoute(route);
}

export async function publishUrgentPlanningRoute(input: {
  orderId?: string;
  orderIds?: string[];
  driverCode: string;
  coDriverCodes?: string[];
  note?: string;
  origin?: RouteOrigin;
  acceptWithinMinutes?: number;
  startWithinMinutes?: number;
  startPolicy?: 'manual' | 'accept_starts';
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
  input: { driverCode: string; coDriverCodes?: string[]; note?: string },
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
