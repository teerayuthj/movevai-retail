// Source of truth ของ rider tab — ผูก tab กับ order status และ URL segment
// แต่ละ tab = filter ของ order.status ตัวเดียว (UI/logic เหมือนกัน ต่างแค่ status)
import type { OrderStatus } from '@/data/mock';

export type RiderTab = 'assigned' | 'in_transit' | 'pending_confirmation' | 'delivered';

type RiderTabDef = {
  key: RiderTab;
  /** segment ต่อท้าย /rider/ บน URL */
  segment: string;
  label: string;
};

export const RIDER_TABS: RiderTabDef[] = [
  { key: 'assigned', segment: 'assigned', label: 'งานใหม่' },
  { key: 'in_transit', segment: 'in-transit', label: 'กำลังส่ง' },
  { key: 'pending_confirmation', segment: 'pending-confirmation', label: 'รอ CS' },
  { key: 'delivered', segment: 'delivered', label: 'สำเร็จ' },
];

/** order status ที่ rider เห็นได้ (ตรงกับ tab ทั้งหมด) */
export const RIDER_JOB_STATUSES: OrderStatus[] = RIDER_TABS.map((tab) => tab.key);

export const RIDER_BASE_PATH = '/rider';

const tabBySegment = new Map(RIDER_TABS.map((tab) => [tab.segment, tab.key]));
const segmentByTab = new Map(RIDER_TABS.map((tab) => [tab.key, tab.segment]));

/** /rider/in-transit → 'in_transit' ; /rider หรือ segment ไม่รู้จัก → null */
export function getRiderTabFromPath(pathname: string): RiderTab | null {
  if (!pathname.startsWith(RIDER_BASE_PATH)) return null;
  const segment = pathname.slice(RIDER_BASE_PATH.length).replace(/^\/+|\/+$/g, '');
  if (!segment) return null;
  return tabBySegment.get(segment) ?? null;
}

/** 'in_transit' → '/rider/in-transit' */
export function getRiderTabPath(tab: RiderTab): string {
  return `${RIDER_BASE_PATH}/${segmentByTab.get(tab)}`;
}
