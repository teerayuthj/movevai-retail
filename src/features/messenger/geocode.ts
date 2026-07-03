// พิกัดสำหรับวาดหมุด/นำทางบนแผนที่ messenger + admin
//
// ใช้ `order.customer.geo` จาก backend เท่านั้น (กรองด้วย isPlausibleThaiCoord กันพิกัดเสีย)
// ไม่มี client-side fallback (anchor lookup / Nominatim) แล้ว — ที่อยู่ที่ backend ไม่มีพิกัด
// จะไม่ถูกวาดหมุด แทนที่จะเดาพิกัดผิด ๆ (การเดาเคยทำให้ระยะทางบน native เพี้ยนหลักหมื่น กม.
// เพราะ OSRM ฝั่ง client snap ไปคนละทวีป — ดู memory messenger-distance-native)

export type LatLng = { lat: number; lng: number };

// จุดกึ่งกลางแผนที่เริ่มต้น (ไม่ใช่ fallback ของหมุด) — ใช้ตั้ง center ตอนยังไม่มีพิกัดใด ๆ ให้โฟกัส
export const BANGKOK_CENTER: LatLng = { lat: 13.7456, lng: 100.5331 };

// กรอบคร่าว ๆ ของประเทศไทย (เผื่อขอบ) — ใช้กรองพิกัดเสีย เช่น (0,0), lat/lng สลับกัน
// หรือ placeholder ที่ backend ส่งมา ไม่ให้ไปคำนวณระยะ/วาดหมุดผิดที่
const THAILAND_BOUNDS = { minLat: 5.5, maxLat: 20.6, minLng: 97.3, maxLng: 105.7 };

/** true เมื่อพิกัดเป็นเลขจริงและอยู่ในกรอบประเทศไทย — ใช้กันพิกัดเสียจาก backend/GPS */
export function isPlausibleThaiCoord<T extends LatLng>(coords: T | null | undefined): coords is T {
  if (!coords) return false;
  const { lat, lng } = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= THAILAND_BOUNDS.minLat &&
    lat <= THAILAND_BOUNDS.maxLat &&
    lng >= THAILAND_BOUNDS.minLng &&
    lng <= THAILAND_BOUNDS.maxLng
  );
}

/** deep link เปิด navigation ในแอปแผนที่ของเครื่อง (Google Maps) */
export function navigationUrl(address: string, geo?: LatLng | null): string {
  const destination = geo ? `${geo.lat},${geo.lng}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
