import { APP_API_BASE, request } from './client';

export type GeoCoordinate = { lat: number; lng: number };
export type RouteOrigin = GeoCoordinate;

/** ทำคำค้นที่อยู่ไทยให้เป็นคำเต็ม โดยเก็บข้อความต้นฉบับไว้สำหรับแสดง/บันทึกเสมอ */
function normalizeThaiAddressForGeocode(address: string) {
  return address
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)ถ\.\s*/g, '$1ถนน ')
    .replace(/(^|\s)ซ\.\s*/g, '$1ซอย ')
    .replace(/(^|\s)แขวง\.\s*/g, '$1แขวง ')
    .replace(/(^|\s)เขต\.\s*/g, '$1เขต ')
    .replace(/(^|\s)ต\.\s*/g, '$1ตำบล ')
    .replace(/(^|\s)อ\.\s*/g, '$1อำเภอ ')
    .replace(/(^|\s)จ\.\s*/g, '$1จังหวัด ')
    .replace(/(^|\s)กทม\.\s*/g, '$1กรุงเทพมหานคร ')
    .replace(/กรุงเทพฯ/g, 'กรุงเทพมหานคร')
    .replace(/\s+/g, ' ')
    .trim();
}

function geocodeQueries(address: string) {
  const original = address.trim().replace(/\s+/g, ' ');
  const normalized = normalizeThaiAddressForGeocode(original);
  const withCountry = /ประเทศไทย/.test(normalized) ? normalized : `${normalized} ประเทศไทย`;
  return [...new Set([original, normalized, withCountry].filter(Boolean))];
}

/**
 * geocode ที่อยู่เดี่ยว → พิกัด ผ่าน backend (provider เดียวกับ route planning)
 * - ลองข้อความเดิมก่อนเพื่อไม่สูญเสียเลขที่/ชื่ออาคาร
 * - หากไม่พบ จะแปลงคำย่อที่อยู่ไทยเป็นคำเต็ม และเติม "ประเทศไทย" เพื่อช่วย geocoder
 * ใช้ทำ preview ปลายทางฝั่ง admin ก่อนจัดคิว — null = หาพิกัดไม่ได้ทุกคำค้น
 */
export async function geocodeAddress(address: string): Promise<GeoCoordinate | null> {
  for (const query of geocodeQueries(address)) {
    const result = await request<{ coordinate: GeoCoordinate | null }>(
      `${APP_API_BASE}/geocode?q=${encodeURIComponent(query)}`,
    );
    if (result.coordinate) return result.coordinate;
  }
  return null;
}

// ── Thai address autocomplete (จังหวัด → อำเภอ → ตำบล → รหัสไปรษณีย์) ──
// ข้อมูลจาก backend (jquery.Thailand.js / Thaipost) โหลดใน memory ฝั่ง api
export type ThaiAddressRecord = {
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  subdistrictCode: number;
  districtCode: number;
  provinceCode: number;
};

export async function fetchAddressProvinces(): Promise<string[]> {
  const result = await request<{ results: Array<{ province: string }> }>(
    `${APP_API_BASE}/address/provinces`,
  );
  return result.results.map((r) => r.province);
}

export async function fetchAddressDistricts(province: string): Promise<string[]> {
  const trimmed = province.trim();
  if (!trimmed) return [];
  const result = await request<{ results: Array<{ district: string }> }>(
    `${APP_API_BASE}/address/districts?province=${encodeURIComponent(trimmed)}`,
  );
  return result.results.map((r) => r.district);
}

export type ParsedThaiAddress = {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
  matched: { province: boolean; district: boolean; subdistrict: boolean; postalCode: boolean };
  score: number;
};

// แยกที่อยู่ยาว ๆ 1 บรรทัด → เดา จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์ อัตโนมัติ (null = เดาไม่ได้)
export async function parseAddress(raw: string): Promise<ParsedThaiAddress | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const result = await request<{ result: ParsedThaiAddress | null }>(
    `${APP_API_BASE}/address/parse?q=${encodeURIComponent(trimmed)}`,
  );
  return result.result;
}

export async function fetchAddressSubdistricts(
  province: string,
  district: string,
): Promise<Array<{ subdistrict: string; postalCode: string }>> {
  const p = province.trim();
  const d = district.trim();
  if (!p || !d) return [];
  const result = await request<{ results: Array<{ subdistrict: string; postalCode: string }> }>(
    `${APP_API_BASE}/address/subdistricts?province=${encodeURIComponent(p)}&district=${encodeURIComponent(d)}`,
  );
  return result.results;
}
