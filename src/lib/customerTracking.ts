import type { Order, OrderActivityEventType, OrderStatus, ProofOfDelivery } from '@/data/mock';

const CUSTOMER_TRACKING_BASE_PATH = '/customer-track';

// สถานะที่ถือว่าออเดอร์เดินเข้าสู่ flow จัดส่งแล้ว (ผ่าน Planning/ปล่อยคิว/ส่งจริง)
const SCHEDULED_STATUSES = new Set<OrderStatus>([
  'assigned',
  'in_transit',
  'pending_confirmation',
  'delivered',
  'failed',
  'returning',
  'returned',
]);

export function getCustomerTrackingPath(orderId: string) {
  return `${CUSTOMER_TRACKING_BASE_PATH}/${encodeURIComponent(orderId)}`;
}

export function isCustomerTrackingPath(pathname: string) {
  return (
    pathname === CUSTOMER_TRACKING_BASE_PATH ||
    pathname.startsWith(`${CUSTOMER_TRACKING_BASE_PATH}/`)
  );
}

export function getCustomerTrackingOrderId(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '');
  const prefix = `${CUSTOMER_TRACKING_BASE_PATH}/`;
  if (!normalized.startsWith(prefix)) return '';
  return decodeURIComponent(normalized.slice(prefix.length));
}

export function buildCustomerTrackingUrl(orderId: string, origin = window.location.origin) {
  return `${origin}${getCustomerTrackingPath(orderId)}`;
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, 'x')}${digits.slice(-4)}`;
}

export function maskAddress(address: string) {
  const trimmed = address.trim();
  if (trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 24)}...`;
}

/**
 * ออเดอร์ผ่านการ "จัดรอบส่ง" (Planning) แล้วหรือยัง — ใช้ตัดสินว่าจะเปิดหน้า tracking
 * ให้ลูกค้าหรือยัง. ถือว่าผ่านแล้วเมื่อมีแผนล่วงหน้า/อยู่ในรอบส่ง หรือเดินสถานะจัดส่งไปแล้ว
 */
export function isOrderScheduled(order: Order): boolean {
  if (order.deliveryPlan) return true;
  if (order.deliveryRoute) return true;
  return SCHEDULED_STATUSES.has(order.status);
}

/** ออเดอร์ถูกปล่อยเข้าคิว/มอบหมายแล้ว (released) ไม่ใช่แค่ร่างแผน (planned) */
export function isOrderReleased(order: Order): boolean {
  if (order.deliveryPlan?.releaseState === 'released') return true;
  if (order.deliveryRoute) return true;
  return SCHEDULED_STATUSES.has(order.status);
}

/** กำหนดวัน/เวลาส่งที่จะโชว์ให้ลูกค้า — รอบส่งจริง (deliveryRoute) มาก่อนแผนร่าง */
export function getPlannedDelivery(order: Order): { date: string; time?: string } | null {
  if (order.deliveryRoute?.plannedDate) {
    return { date: order.deliveryRoute.plannedDate, time: order.deliveryRoute.plannedTime };
  }
  if (order.deliveryPlan?.plannedDate) {
    return { date: order.deliveryPlan.plannedDate, time: order.deliveryPlan.plannedTime };
  }
  return null;
}

type LatLng = { lat: number; lng: number };

/** ระยะเส้นตรง (เมตร) ระหว่างสองพิกัด — ใช้ประเมินคร่าวๆ ว่าคนส่งใกล้ปลายทางแค่ไหน */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** จัดรูประยะทางคร่าวๆ ให้ลูกค้าอ่านง่าย (เมตร/กิโลเมตร) */
export function formatApproxDistance(meters: number): string {
  if (meters < 1_000) return `${Math.round(meters / 10) * 10} ม.`;
  return `${(meters / 1_000).toFixed(meters < 10_000 ? 1 : 0)} กม.`;
}

export type CustomerTimelineEntry = {
  id: string;
  label: string;
  at: string;
  tone: 'default' | 'success' | 'problem';
  proof?: CustomerProofEvidence;
};

export type CustomerProofEvidence = {
  capturedAt: string;
  photoCount: number;
  photos: string[];
  signatureCaptured: boolean;
  signatureDataUrl?: string;
  locationLabel?: string;
  locationMapsUrl?: string;
};

/**
 * map event ภายในระบบ → ข้อความที่ลูกค้าอ่านเข้าใจ พร้อม `key` สำหรับยุบ event ซ้ำ
 * (เช่น เผยแพร่ Route หลายรอบ = milestone "จัดเข้ารอบจัดส่ง" ครั้งเดียว).
 * event ที่ไม่อยู่ใน map นี้ = งานภายใน ไม่ต้องโชว์ให้ลูกค้า
 */
const CUSTOMER_TIMELINE_MILESTONES: Partial<
  Record<OrderActivityEventType, { key: string; label: string; tone?: 'success' | 'problem' }>
> = {
  order_received: { key: 'received', label: 'รับคำสั่งซื้อเรียบร้อยแล้ว' },
  order_confirmed: { key: 'confirmed', label: 'ยืนยันคำสั่งซื้อแล้ว' },
  delivery_planned: { key: 'scheduled', label: 'นัดหมายวันจัดส่งเรียบร้อย' },
  delivery_plan_updated: { key: 'scheduled', label: 'นัดหมายวันจัดส่งเรียบร้อย' },
  driver_assigned: { key: 'dispatch_ready', label: 'จัดเข้ารอบจัดส่งแล้ว' },
  driver_auto_assigned: { key: 'dispatch_ready', label: 'จัดเข้ารอบจัดส่งแล้ว' },
  delivery_plan_released: { key: 'dispatch_ready', label: 'จัดเข้ารอบจัดส่งแล้ว' },
  delivery_urgent_route_published: { key: 'dispatch_ready', label: 'จัดเข้ารอบจัดส่งแล้ว' },
  delivery_started: { key: 'out_for_delivery', label: 'พนักงานรับสินค้าและออกเดินทางไปส่ง' },
  delivery_submitted: { key: 'handed_over', label: 'ส่งมอบสินค้าแล้ว กำลังยืนยันการรับ' },
  delivery_confirmed: { key: 'completed', label: 'จัดส่งสำเร็จ', tone: 'success' },
  delivery_completed: { key: 'completed', label: 'จัดส่งสำเร็จ', tone: 'success' },
  postal_handed_over: { key: 'postal_handed', label: 'ส่งมอบพัสดุให้ไปรษณีย์แล้ว' },
  postal_tracking_saved: { key: 'postal_tracking', label: 'ได้รับเลขพัสดุสำหรับติดตาม' },
  delivery_failed: { key: 'failed', label: 'จัดส่งไม่สำเร็จ', tone: 'problem' },
  delivery_retried: { key: 'retried', label: 'นัดหมายจัดส่งใหม่อีกครั้ง' },
  return_started: { key: 'return_started', label: 'เริ่มนำสินค้ากลับ', tone: 'problem' },
  return_completed: { key: 'return_completed', label: 'นำสินค้ากลับเรียบร้อย' },
};

function buildCustomerProofEvidence(pod: ProofOfDelivery): CustomerProofEvidence {
  const lat = pod.location?.lat;
  const lng = pod.location?.lng;
  const hasCoordinate = Number.isFinite(lat) && Number.isFinite(lng);

  return {
    capturedAt: pod.capturedAt,
    photoCount: pod.photoCount,
    photos: pod.photos ?? [],
    signatureCaptured: pod.signatureCaptured,
    signatureDataUrl: pod.signatureDataUrl,
    locationLabel: pod.location?.label,
    locationMapsUrl: hasCoordinate
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : undefined,
  };
}

export function getPublicTimelineEvents(order: Order): CustomerTimelineEntry[] {
  const sorted = [...(order.activityLog ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  const seen = new Set<string>();
  const entries: CustomerTimelineEntry[] = [];

  for (const event of sorted) {
    const milestone = CUSTOMER_TIMELINE_MILESTONES[event.type];
    if (!milestone || seen.has(milestone.key)) continue;
    seen.add(milestone.key);
    entries.push({
      id: event.id,
      label: milestone.label,
      at: event.at,
      tone: milestone.tone ?? 'default',
    });
  }

  if (order.proofOfDelivery) {
    entries.push({
      id: `${order.id}-latest-proof-${order.proofOfDelivery.capturedAt}`,
      label: 'หลักฐานการส่งมอบล่าสุด',
      at: order.proofOfDelivery.capturedAt,
      tone: 'success',
      proof: buildCustomerProofEvidence(order.proofOfDelivery),
    });
  }

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
