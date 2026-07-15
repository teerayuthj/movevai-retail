// RT-20260707-D-02-mra9re2q → ส่วนกลางคือรหัสคนขับ/รอบ (D-02) ที่หน้างานใช้เรียกกัน
// ใช้ย่อรหัสเที่ยวให้ตรงกันทุก surface (admin timeline + messenger trip card)
const ROUTE_SHORT_RE = /^RT-\d{8}-(.+?)-[a-z0-9]+$/i;

export function shortRouteCode(code: string): string {
  return ROUTE_SHORT_RE.exec(code)?.[1] ?? code;
}
