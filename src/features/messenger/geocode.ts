// แปลง address → พิกัด สำหรับวาดหมุดบนแผนที่ messenger
//
// ลำดับการ resolve:
//   1) order.customer.geo  → ใช้เลย (มาจาก backend ในอนาคต)
//   2) anchor lookup        → ย่านในกรุงเทพ จับจาก keyword ใน address (instant, offline)
//   3) Nominatim (OSM)      → geocode จริงแบบฟรี (async) + cache ลง localStorage
//
// Nominatim ฟรีแต่จำกัด ~1 req/วินาที — เหมาะกับ prototype เท่านั้น

export type LatLng = { lat: number; lng: number };

// ย่าน/เขตในกรุงเทพ + เมืองหลักต่างจังหวัด — พิกัดโดยประมาณ พอให้หมุดลงถูกย่าน
// match = substring ที่พบใน address (เรียงจากเฉพาะเจาะจง → กว้าง)
const ANCHORS: { match: string; lat: number; lng: number }[] = [
  // POI ที่ใช้งานส่งจริงต้องอยู่ก่อน anchor ระดับย่าน เพื่อไม่ให้ "สีลม" ดักไปปักกลางย่าน
  { match: 'silom complex', lat: 13.7281, lng: 100.5351 },
  { match: 'สีลมคอมเพล็กซ์', lat: 13.7281, lng: 100.5351 },
  { match: 'สีลม คอมเพล็กซ์', lat: 13.7281, lng: 100.5351 },
  { match: 'เยาวราช', lat: 13.7404, lng: 100.5095 },
  { match: 'สัมพันธวงศ์', lat: 13.7398, lng: 100.5135 },
  { match: 'สุขุมวิท 61', lat: 13.7332, lng: 100.5872 },
  { match: 'ทองหล่อ', lat: 13.7308, lng: 100.5825 },
  { match: 'คลองตันเหนือ', lat: 13.7295, lng: 100.5805 },
  { match: 'วัฒนา', lat: 13.7401, lng: 100.5847 },
  { match: 'วิทยุ', lat: 13.7338, lng: 100.5462 },
  { match: 'ลุมพินี', lat: 13.7305, lng: 100.5418 },
  { match: 'ปทุมวัน', lat: 13.7444, lng: 100.5331 },
  { match: 'สาทร', lat: 13.7187, lng: 100.5293 },
  { match: 'ยานนาวา', lat: 13.7115, lng: 100.5418 },
  { match: 'สีลม', lat: 13.7256, lng: 100.5337 },
  { match: 'บางรัก', lat: 13.7286, lng: 100.5241 },
  { match: 'สุริยวงศ์', lat: 13.7268, lng: 100.5303 },
  { match: 'รัชดา', lat: 13.7997, lng: 100.5743 },
  { match: 'จตุจักร', lat: 13.8005, lng: 100.5538 },
  { match: 'จันทรเกษม', lat: 13.8161, lng: 100.5697 },
  { match: 'บางนา', lat: 13.668, lng: 100.6045 },
  { match: 'บางพลี', lat: 13.601, lng: 100.708 },
  { match: 'สมุทรปราการ', lat: 13.5991, lng: 100.5998 },
  { match: 'หางดง', lat: 18.6889, lng: 98.9234 },
  { match: 'เชียงใหม่', lat: 18.7883, lng: 98.9853 },
  { match: 'หาดใหญ่', lat: 7.0084, lng: 100.4747 },
  { match: 'สงขลา', lat: 7.1896, lng: 100.5954 },
];

// fallback กลางกรุงเทพ เมื่อไม่เจอ anchor และยังไม่ได้ผลจาก Nominatim
export const BANGKOK_CENTER: LatLng = { lat: 13.7456, lng: 100.5331 };

// กรอบคร่าว ๆ ของประเทศไทย (เผื่อขอบ) — ใช้กรองพิกัดเสีย เช่น (0,0), lat/lng สลับกัน
// หรือ placeholder ที่ backend ส่งมา ไม่ให้ไปคำนวณระยะ/วาดหมุดผิดที่ (เคยทำให้ระยะขึ้น
// หมื่นกว่า กม. เพราะ OSRM snap จุดเสียไปถนนคนละทวีป)
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

const CACHE_KEY = 'movevai:geocode-cache';

function readCache(): Record<string, LatLng> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Record<string, LatLng>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, LatLng>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage เต็ม/ปิด — ข้ามไป
  }
}

/** หาพิกัดทันทีจาก anchor lookup (sync, ไม่มี network) — null ถ้าไม่เจอย่านที่รู้จัก */
export function localGeocode(address: string): LatLng | null {
  const normalizedAddress = address.toLocaleLowerCase('th-TH');
  for (const anchor of ANCHORS) {
    if (normalizedAddress.includes(anchor.match)) {
      return { lat: anchor.lat, lng: anchor.lng };
    }
  }
  return null;
}

/** geocode จริงผ่าน Nominatim (OSM) + cache — ใช้เมื่อ anchor lookup ไม่เจอ */
export async function geocodeViaNominatim(address: string): Promise<LatLng | null> {
  const cache = readCache();
  if (isPlausibleThaiCoord(cache[address])) return cache[address];

  try {
    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      countrycodes: 'th',
      q: address,
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'Accept-Language': 'th' },
    });
    if (!response.ok) return null;
    const results = (await response.json()) as { lat: string; lon: string }[];
    const hit = results[0];
    if (!hit) return null;
    const coords: LatLng = { lat: Number(hit.lat), lng: Number(hit.lon) };
    if (!isPlausibleThaiCoord(coords)) return null;
    cache[address] = coords;
    writeCache(cache);
    return coords;
  } catch {
    return null;
  }
}

/** deep link เปิด navigation ในแอปแผนที่ของเครื่อง (Google Maps) */
export function navigationUrl(address: string, geo?: LatLng | null): string {
  const destination = geo ? `${geo.lat},${geo.lng}` : address;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
