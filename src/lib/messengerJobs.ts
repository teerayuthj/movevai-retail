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
  if (!driverCode) return false;
  return order.assignedDriverId === driverCode || (order.coDriverIds ?? []).includes(driverCode);
}
