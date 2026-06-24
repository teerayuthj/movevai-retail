import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order } from '@/data/mock';
import { localGeocode } from '@/features/messenger/geocode';
import { geocodeAddress, type GeoCoordinate } from '@/lib/retailApi';

export type OrderGeo = { coords: GeoCoordinate | null; pending: boolean };

/**
 * แปลงรายการ order → พิกัดปลายทาง สำหรับวาดหมุดบนแผนที่ฝั่ง admin
 * - ใช้ `customer.geo` ถ้ามี (พิกัดที่ backend ยืนยันแล้ว)
 * - ที่อยู่ที่ยังไม่มีพิกัด → geocode ผ่าน backend ทีละจุด (ตามลำดับ เพื่อเป็นมิตรกับ rate limit)
 * - cache ตาม "ที่อยู่" เพื่อไม่ยิงซ้ำเมื่อหลาย order ปลายทางเดียวกัน/สลับวัน
 */
export function useOrdersGeo(orders: Order[]): Record<string, OrderGeo> {
  const cacheRef = useRef<Map<string, GeoCoordinate | null>>(new Map());
  // bump เพื่อ re-render + recompute ผลลัพธ์เมื่อ cache มีพิกัดใหม่ (cache อยู่ใน ref จึงต้อง trigger เอง)
  const [tick, setTick] = useState(0);

  const addressesToLookup = useMemo(() => {
    const pending = new Set<string>();
    for (const order of orders) {
      if (order.customer.geo) continue;
      const address = order.customer.address?.trim();
      if (address && !cacheRef.current.has(address)) pending.add(address);
    }
    return [...pending];
  }, [orders]);

  useEffect(() => {
    if (addressesToLookup.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const address of addressesToLookup) {
        if (cancelled) return;
        if (cacheRef.current.has(address)) continue;
        let coords: GeoCoordinate | null = null;
        try {
          coords = (await geocodeAddress(address)) ?? localGeocode(address);
        } catch {
          // backend geocode ล้มเหลว — ใช้ anchor เดียวกับหน้า Messenger เป็น fallback
          coords = localGeocode(address);
        }
        if (cancelled) return;
        cacheRef.current.set(address, coords);
        setTick((value) => value + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addressesToLookup]);

  return useMemo(() => {
    const result: Record<string, OrderGeo> = {};
    for (const order of orders) {
      if (order.customer.geo) {
        result[order.id] = { coords: order.customer.geo, pending: false };
        continue;
      }
      const address = order.customer.address?.trim();
      if (!address) {
        result[order.id] = { coords: null, pending: false };
        continue;
      }
      const resolved = cacheRef.current.has(address);
      result[order.id] = {
        coords: cacheRef.current.get(address) ?? null,
        pending: !resolved,
      };
    }
    return result;
    // tick เปลี่ยนเมื่อ cache (ref) มีพิกัดใหม่ → บังคับ recompute
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, addressesToLookup, tick]);
}
