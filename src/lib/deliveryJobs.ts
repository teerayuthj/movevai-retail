import type { Order } from '@/data/orderTypes';

export type TrackingJob = {
  id: string;
  stops: Order[];
};

export type DeliveryTrip = {
  id: string;
  orders: Order[];
};

/** รวม order ที่อยู่ Route เดียวกันเป็นหนึ่งเที่ยว; งานที่ไม่มี Route ยังคงเป็นเที่ยวเดี่ยว */
export function groupOrdersIntoDeliveryTrips(orders: Order[]): DeliveryTrip[] {
  const groups = new Map<string, DeliveryTrip>();
  for (const order of orders) {
    const key = order.deliveryRoute?.id ? `route:${order.deliveryRoute.id}` : `order:${order.id}`;
    const trip = groups.get(key) ?? { id: key, orders: [] };
    trip.orders.push(order);
    groups.set(key, trip);
  }
  return [...groups.values()].sort((a, b) => {
    const firstA = a.orders[0];
    const firstB = b.orders[0];
    return (firstA?.deliveryRoute?.plannedDate ?? '').localeCompare(
      firstB?.deliveryRoute?.plannedDate ?? '',
    );
  });
}

/**
 * แยก stop ในหนึ่ง Route เป็น "งาน" ที่ผู้ใช้อ่านเข้าใจได้:
 * จุดรับที่มี deliverTo.stopId เดียวกันจะอยู่กับจุดส่งปลายทางเดียวกัน;
 * จุดส่งที่ไม่มีคู่รับเป็นงานเดี่ยวของตัวเอง. จึงไม่ต้องเดาจากตำแหน่งก่อน/หลัง
 * และยังรองรับหนึ่งงานที่มีหลายจุดรับได้.
 */
export function groupRouteOrdersIntoJobs(orders: Order[]): TrackingJob[] {
  const sortedOrders = [...orders].sort(
    (a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0),
  );
  const groups = new Map<string, TrackingJob>();

  for (const order of sortedOrders) {
    const dispatch = order.metadataJson?.dispatch;
    const kind = dispatch?.routeLeg ?? 'dropoff';
    const stopId = dispatch?.stopId ?? order.id;
    const key =
      kind === 'pickup' && dispatch?.deliverTo?.stopId
        ? `dropoff:${dispatch.deliverTo.stopId}`
        : kind === 'dropoff'
          ? `dropoff:${stopId}`
          : `pickup:${stopId}`;
    const job = groups.get(key) ?? { id: key, stops: [] };
    job.stops.push(order);
    groups.set(key, job);
  }

  return [...groups.values()].sort(
    (a, b) =>
      (a.stops[0]?.deliveryRoute?.sequence ?? 0) - (b.stops[0]?.deliveryRoute?.sequence ?? 0),
  );
}
