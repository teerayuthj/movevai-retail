import { APP_API_BASE, request } from './client';

// ── โปรไฟล์ลูกค้าสะสม (RetailCustomer) — หน้า "ลูกค้า" ฝั่ง admin ──
export type CustomerSummary = {
  id: string;
  phone: string;
  name: string;
  address: string;
  idCard?: string;
  /** มีพิกัดยืนยันจากการส่งสำเร็จจริงแล้ว (ใช้แทน geocode ตอนจัดเส้นทาง) */
  geoVerified: boolean;
  geoVerifiedAt?: string;
  ordersCount: number;
  deliveredCount: number;
  totalValue: number;
  firstOrderAt: string;
  lastOrderAt: string;
};

export type CustomerListSort = 'recent' | 'name' | 'orders' | 'value';
export type CustomerGeoFilter = 'all' | 'verified' | 'unverified';

export type CustomerOrderSummary = {
  id: string;
  orderNo: string;
  code: string;
  status: string;
  source: string;
  receivedAt: string;
  totalValue: number;
  payment: string;
  shippingMethod?: string;
  address: string;
};

export type CustomerDetail = {
  customer: CustomerSummary & {
    geo?: { lat: number; lng: number; address?: string; verifiedAt?: string };
  };
  stats: { totalOrders: number; deliveredOrders: number; totalValue: number };
  orders: CustomerOrderSummary[];
};

export async function fetchCustomers(params?: {
  q?: string;
  sort?: CustomerListSort;
  geo?: CustomerGeoFilter;
  /** เฉพาะลูกค้าที่สั่งภายใน N วันล่าสุด */
  days?: number;
  /** เฉพาะลูกค้าที่มีออเดอร์ตั้งแต่ N ขึ้นไป */
  minOrders?: number;
  /** keyset cursor จาก response ก่อนหน้า — ไม่ส่ง = หน้าแรก */
  cursor?: string;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params?.q?.trim()) search.set('q', params.q.trim());
  if (params?.sort) search.set('sort', params.sort);
  if (params?.geo && params.geo !== 'all') search.set('geo', params.geo);
  if (params?.days != null) search.set('days', String(params.days));
  if (params?.minOrders != null) search.set('minOrders', String(params.minOrders));
  if (params?.cursor) search.set('cursor', params.cursor);
  if (params?.limit != null) search.set('limit', String(params.limit));
  const query = search.toString();
  return request<{
    total: number;
    limit: number;
    sort: CustomerListSort;
    hasMore: boolean;
    nextCursor?: string;
    customers: CustomerSummary[];
  }>(`${APP_API_BASE}/customers${query ? `?${query}` : ''}`);
}

export function fetchCustomer(customerId: string) {
  return request<CustomerDetail>(`${APP_API_BASE}/customers/${encodeURIComponent(customerId)}`);
}
