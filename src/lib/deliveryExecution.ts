import type { Order } from '@/data/mock';

export type DriverQueueTab = 'ready' | 'assigned';
export type DeliveryTrackingTab = 'in_transit' | 'returning' | 'closed';

export const driverQueueTabLabels: Record<DriverQueueTab, string> = {
  ready: 'รอมอบหมาย',
  assigned: 'รอสร้าง Route',
};

export const deliveryTrackingTabLabels: Record<DeliveryTrackingTab, string> = {
  in_transit: 'กำลังจัดส่ง',
  returning: 'ส่งกลับ',
  closed: 'ปิดงานแล้ว',
};

export function getDriverQueueTab(order: Order): DriverQueueTab | null {
  if (order.status === 'ready') return 'ready';
  if (order.status === 'assigned') return 'assigned';
  return null;
}

export function getDeliveryTrackingTab(order: Order): DeliveryTrackingTab | null {
  if (order.status === 'in_transit') return 'in_transit';
  if (order.status === 'returning') return 'returning';
  if (['delivered', 'failed', 'cancelled', 'returned'].includes(order.status)) return 'closed';
  return null;
}
