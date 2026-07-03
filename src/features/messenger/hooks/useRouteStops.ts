import { useMemo } from 'react';
import type { Order } from '@/data/orderTypes';
import { isPlausibleThaiCoord, type LatLng } from '../geocode';

export type RouteStop = {
  order: Order;
  /** ลำดับที่แสดงบนหมุด (1-based) — ตาม sequence ของ route ถ้ามี */
  label: number;
  /** พิกัดจาก backend (customer.geo) — null เมื่อ backend ไม่มีพิกัด/พิกัดเสีย */
  coords: LatLng | null;
};

/**
 * แปลงรายการ order → จุดส่งที่มีพิกัด สำหรับวาดบนแผนที่
 * ใช้ `customer.geo` จาก backend เท่านั้น (กรองด้วย isPlausibleThaiCoord) — ที่อยู่ที่ไม่มี
 * พิกัดจะได้ coords = null และไม่ถูกวาดหมุด (ไม่มีการเดาพิกัดฝั่ง client อีกต่อไป)
 */
export function useRouteStops(orders: Order[]): RouteStop[] {
  return useMemo(
    () =>
      orders.map((order, index) => ({
        order,
        label: order.deliveryRoute?.sequence ?? index + 1,
        coords: isPlausibleThaiCoord(order.customer.geo) ? order.customer.geo : null,
      })),
    [orders],
  );
}
