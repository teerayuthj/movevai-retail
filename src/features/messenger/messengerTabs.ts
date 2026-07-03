// Source of truth ของ messenger tab — ผูก tab กับ order status และ URL segment
// แต่ละ tab = filter ของ order.status ตัวเดียว (UI/logic เหมือนกัน ต่างแค่ status)
import type { OrderStatus } from '@/data/orderTypes';

export type MessengerTab = 'assigned' | 'in_transit' | 'pending_confirmation' | 'delivered';

type MessengerTabDef = {
  key: MessengerTab;
  /** segment ต่อท้าย /messenger/ บน URL */
  segment: string;
  label: string;
};

export const MESSENGER_TABS: MessengerTabDef[] = [
  { key: 'assigned', segment: 'assigned', label: 'งานใหม่' },
  { key: 'in_transit', segment: 'in-transit', label: 'กำลังส่ง' },
  { key: 'pending_confirmation', segment: 'pending-confirmation', label: 'รอตรวจสอบ' },
  { key: 'delivered', segment: 'delivered', label: 'สำเร็จ' },
];

/** order status ที่ messenger เห็นได้ (ตรงกับ tab ทั้งหมด) */
export const MESSENGER_JOB_STATUSES: OrderStatus[] = MESSENGER_TABS.map((tab) => tab.key);

export const MESSENGER_BASE_PATH = '/messenger';

const tabBySegment = new Map(MESSENGER_TABS.map((tab) => [tab.segment, tab.key]));
const segmentByTab = new Map(MESSENGER_TABS.map((tab) => [tab.key, tab.segment]));

/** /messenger/in-transit → 'in_transit' ; /messenger หรือ segment ไม่รู้จัก → null */
export function getMessengerTabFromPath(pathname: string): MessengerTab | null {
  if (!pathname.startsWith(MESSENGER_BASE_PATH)) return null;
  const segment = pathname
    .slice(MESSENGER_BASE_PATH.length)
    .replace(/^\/+|\/+$/g, '')
    .split('/')[0];
  if (!segment) return null;
  return tabBySegment.get(segment) ?? null;
}

/** 'in_transit' → '/messenger/in-transit' */
export function getMessengerTabPath(tab: MessengerTab): string {
  return `${MESSENGER_BASE_PATH}/${segmentByTab.get(tab)}`;
}

export function getMessengerOrderMapPath(orderId: string): string {
  return `${MESSENGER_BASE_PATH}/pending-confirmation/${encodeURIComponent(orderId)}/map`;
}

export function getMessengerOrderMapId(pathname: string): string | null {
  if (!pathname.startsWith(`${MESSENGER_BASE_PATH}/pending-confirmation/`)) return null;
  const [rawOrderId, leaf] = pathname
    .slice(`${MESSENGER_BASE_PATH}/pending-confirmation`.length)
    .replace(/^\/+|\/+$/g, '')
    .split('/');
  if (leaf !== 'map' || !rawOrderId) return null;

  try {
    return decodeURIComponent(rawOrderId);
  } catch {
    return null;
  }
}
