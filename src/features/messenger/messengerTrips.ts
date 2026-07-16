import type { Order } from '@/data/orderTypes';
import { shortRouteCode } from '@/lib/routeCode';

export type MessengerTrip = {
  key: string;
  routeId?: string;
  routeCode?: string;
  title: string;
  orders: Order[];
};

function dispatchRunKey(order: Order) {
  const dispatch = order.metadataJson?.dispatch;
  return (
    order.deliveryRoute?.id ??
    dispatch?.adHocRouteRunId ??
    dispatch?.routeTemplateRunId ??
    dispatch?.routeRunKey ??
    order.id
  );
}

export function cleanMessengerStopName(name: string) {
  return name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim();
}

// ชื่อย่อสำหรับ title บนการ์ดเที่ยว — ตัดคำนำหน้า/ท้ายนิติบุคคล ใช้ชื่อเล่นในวงเล็บ
// หรือชื่อสาขา เพื่อให้ "จุดแรก → จุดสุดท้าย" จบในบรรทัดเดียว
export function shortMessengerPlaceName(name: string) {
  const cleaned = cleanMessengerStopName(name);
  const alias = cleaned.match(/\(([^()]+)\)\s*$/u)?.[1]?.trim();
  const base = cleaned
    .replace(/\([^()]*\)\s*$/u, '')
    .replace(/^(บริษัท|บจก\.?|หจก\.?|ห้างหุ้นส่วนจำกัด)\s*/u, '')
    .replace(/\s*จำกัด\s*(\(มหาชน\))?\s*$/u, '')
    .trim();
  const aliasIsHq = alias != null && /สำนักงานใหญ่/u.test(alias);
  if (alias && !aliasIsHq) return alias;
  const branch = base.match(/สาขา\s*(.+)$/u)?.[1]?.trim();
  if (branch) return branch;
  if (alias && aliasIsHq) return `${base} (สนง.ใหญ่)`;
  return base || cleaned;
}

export function messengerTripTitle(order: Order) {
  const dispatch = order.metadataJson?.dispatch;
  const routeShort = order.deliveryRoute?.code
    ? `รอบ ${shortRouteCode(order.deliveryRoute.code)}`
    : undefined;
  return (
    dispatch?.messengerTitle?.trim() ||
    dispatch?.title?.trim() ||
    dispatch?.routeTemplateName?.trim() ||
    routeShort ||
    order.orderNo ||
    order.code
  );
}

// title สั้นบรรทัดเดียวบนการ์ดเที่ยว: ชื่อที่ admin ตั้ง > ชื่อ template > "จุดแรก → จุดสุดท้าย"
// (ไม่ใช้ dispatch.title รูปแบบ "เที่ยว A → B" เพราะซ้ำกับลิสต์จุดใต้การ์ด)
export function messengerTripShortTitle(trip: MessengerTrip) {
  const first = trip.orders[0];
  const dispatch = first.metadataJson?.dispatch;
  const custom = dispatch?.messengerTitle?.trim() || dispatch?.routeTemplateName?.trim();
  if (custom) return custom;
  if (trip.orders.length > 1) {
    const start = shortMessengerPlaceName(first.customer.name);
    const end = shortMessengerPlaceName(trip.orders[trip.orders.length - 1].customer.name);
    if (start && end) return `${start} → ${end}`;
  }
  return messengerTripTitle(first);
}

export function groupMessengerTrips(orders: Order[]): MessengerTrip[] {
  const groups = new Map<string, Order[]>();
  for (const order of orders) {
    const key = dispatchRunKey(order);
    const current = groups.get(key);
    if (current) current.push(order);
    else groups.set(key, [order]);
  }

  return [...groups.entries()].map(([key, items]) => {
    const sorted = [...items].sort(
      (a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0),
    );
    const first = sorted[0];
    return {
      key,
      routeId: first.deliveryRoute?.id,
      routeCode: first.deliveryRoute?.code,
      title: messengerTripTitle(first),
      orders: sorted,
    };
  });
}

export function isMultiStopMessengerTrip(trip: MessengerTrip) {
  return (
    trip.orders.length > 1 ||
    (trip.orders[0]?.deliveryRoute?.stopCount ?? 0) > 1 ||
    (trip.orders[0]?.metadataJson?.dispatch?.stopCount ?? 0) > 1
  );
}

// จุดรับเป็นขั้นย่อยของงาน ไม่ใช่ "งาน" แยกใบ — count ระดับงาน/เที่ยวทั้งระบบจึงไม่นับ leg รับ
// (ลำดับวิ่งจริงยังโชว์ครบทุกจุดทางกายภาพ) ให้ตรงกับฝั่ง admin ที่นับเป็นเที่ยว/งานส่ง
export function isMessengerCustomerJob(order: Order) {
  return (order.metadataJson?.dispatch?.routeLeg ?? 'dropoff') !== 'pickup';
}

export function messengerTripProgress(trip: MessengerTrip) {
  const jobs = trip.orders.filter(isMessengerCustomerJob);
  const completed = jobs.filter((order) =>
    ['pending_confirmation', 'delivered'].includes(order.status),
  ).length;
  return { completed, total: jobs.length };
}

export function messengerTripCurrentOrder(trip: MessengerTrip) {
  return (
    trip.orders.find((order) => order.status === 'in_transit') ??
    trip.orders.find((order) => order.status === 'assigned') ??
    trip.orders[0]
  );
}
