import { type Order, type PostalService } from '@/data/mock';

export type PostalTab = 'ready' | 'assigned' | 'in_transit' | 'returning' | 'closed';

export const DEFAULT_POSTAL_SERVICE: PostalService = 'ems';

export const tabLabels: Record<PostalTab, string> = {
  ready: 'รอจัดแบทช์',
  assigned: 'ฝากไปรษณีย์',
  in_transit: 'กำลังจัดส่ง',
  returning: 'ส่งกลับ',
  closed: 'ปิดงาน',
};

export function getPostalTab(order: Order): PostalTab | null {
  if (order.status === 'ready') return 'ready';
  if (order.status === 'assigned') return 'assigned';
  if (order.status === 'in_transit') return 'in_transit';
  if (order.status === 'returning') return 'returning';
  if (
    order.status === 'delivered' ||
    order.status === 'failed' ||
    order.status === 'cancelled' ||
    order.status === 'returned'
  )
    return 'closed';
  return null;
}
