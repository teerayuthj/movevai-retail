import type { RouteStop } from '@/features/dispatch/types';

export type RoutePickupTask = {
  pickup: RouteStop;
  pickupIndex: number;
  dropoff: RouteStop;
  dropoffIndex: number;
};

/**
 * งานย่อยที่เลือกสั่งวิ่งได้ 1 งาน = จุดรับ 1 จุด → จุดส่งที่ผูกไว้ 1 จุด
 * จุดส่งเดียวกันสามารถรับของจากหลายจุดรับได้ โดยยังนับเป็นคนละงานย่อย
 */
export function getRoutePickupTasks(stops: RouteStop[]): RoutePickupTask[] {
  const indexById = new Map(stops.map((stop, index) => [stop.id, index]));

  return stops.flatMap((pickup, pickupIndex) => {
    if (pickup.kind !== 'pickup' || !pickup.deliverToStopId) return [];
    const dropoffIndex = indexById.get(pickup.deliverToStopId);
    if (dropoffIndex === undefined) return [];
    const dropoff = stops[dropoffIndex];
    if (dropoff.kind !== 'dropoff') return [];
    return [{ pickup, pickupIndex, dropoff, dropoffIndex }];
  });
}

/** รวมเฉพาะจุดรับที่เลือกกับจุดส่งปลายทางของงานเหล่านั้น แล้วคงลำดับสายเดิม */
export function stopsForSelectedPickupTasks(stops: RouteStop[], pickupStopIds: string[]) {
  const selected = new Set(pickupStopIds);
  const included = new Set<string>();

  for (const stop of stops) {
    if (stop.kind !== 'pickup' || !selected.has(stop.id)) continue;
    included.add(stop.id);
    if (stop.deliverToStopId) included.add(stop.deliverToStopId);
  }

  return stops.filter((stop) => included.has(stop.id));
}
