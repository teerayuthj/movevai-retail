import { useEffect, useMemo, useState } from 'react';
import type { Order } from '@/data/mock';
import { geocodeViaNominatim, isPlausibleThaiCoord, localGeocode, type LatLng } from '../geocode';

export type RouteStop = {
  order: Order;
  /** ลำดับที่แสดงบนหมุด (1-based) — ตาม sequence ของ route ถ้ามี */
  label: number;
  coords: LatLng | null;
  /** true = พิกัดยังกำลัง resolve ผ่าน Nominatim */
  pending: boolean;
};

function resolveSync(order: Order): LatLng | null {
  // ไว้ใจ geo จาก backend เฉพาะเมื่อเป็นพิกัดที่สมเหตุสมผล (อยู่ในไทย) — ถ้าเป็นค่าเสีย
  // เช่น (0,0)/สลับ lat-lng/placeholder ให้ตกไป localGeocode แทน ไม่งั้น OSRM จะ snap
  // ไปคนละทวีปแล้วระยะพุ่งเป็นหมื่น กม. (เห็นชัดบน native ที่ใช้ public OSRM ฝั่ง client)
  if (isPlausibleThaiCoord(order.customer.geo)) return order.customer.geo;
  return localGeocode(order.customer.address);
}

/**
 * แปลงรายการ order → จุดส่งที่มีพิกัด สำหรับวาดบนแผนที่
 * - geo จาก backend / anchor lookup ขึ้นทันที
 * - ที่อยู่ที่ไม่รู้จัก → geocode async ผ่าน Nominatim แล้ว fill เข้ามาทีหลัง
 */
export function useRouteStops(orders: Order[]): RouteStop[] {
  const [resolved, setResolved] = useState<Record<string, LatLng>>({});

  // ที่อยู่ที่ resolve sync ไม่ได้ — ต้องยิง Nominatim
  const needsLookup = useMemo(
    () => orders.filter((order) => !resolveSync(order) && !resolved[order.id]),
    [orders, resolved],
  );

  useEffect(() => {
    if (needsLookup.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const order of needsLookup) {
        const coords = await geocodeViaNominatim(order.customer.address);
        if (cancelled || !coords) continue;
        setResolved((prev) => ({ ...prev, [order.id]: coords }));
        // เว้นจังหวะตาม usage policy ของ Nominatim (~1 req/วินาที)
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [needsLookup]);

  return useMemo(
    () =>
      orders.map((order, index) => {
        const coords = resolveSync(order) ?? resolved[order.id] ?? null;
        return {
          order,
          label: order.deliveryRoute?.sequence ?? index + 1,
          coords,
          pending: !coords,
        };
      }),
    [orders, resolved],
  );
}
