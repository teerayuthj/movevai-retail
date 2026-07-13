import type { Order, OrderStatus } from '@/data/orderTypes';

export const MESSENGER_JOB_STATUSES: OrderStatus[] = [
  'assigned',
  'in_transit',
  'pending_confirmation',
  'delivered',
];

export function isMessengerOrderParticipant(
  order: Pick<Order, 'assignedDriverId' | 'coDriverIds'>,
  driverCode: string | null | undefined,
) {
  return getMessengerOrderRole(order, driverCode) !== null;
}

/** บทบาทของ messenger คนนี้ในงาน — main = คนขับหลัก (เริ่มงาน/ปิดงานได้), co = คนขับร่วม (ดูอย่างเดียว) */
export type MessengerOrderRole = 'main' | 'co';

export function getMessengerOrderRole(
  order: Pick<Order, 'assignedDriverId' | 'coDriverIds'>,
  driverCode: string | null | undefined,
): MessengerOrderRole | null {
  if (!driverCode) return null;
  if (order.assignedDriverId === driverCode) return 'main';
  if ((order.coDriverIds ?? []).includes(driverCode)) return 'co';
  return null;
}
