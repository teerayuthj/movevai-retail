import type { DeliveryTrackingTab } from '@/lib/deliveryExecution';

// มุมมองหน้า — 'needs_action' คือ union ของ pending + returning (งานที่ admin ต้องลงมือ)
// ส่วนที่เหลือ map ตรงกับ DeliveryTrackingTab ของ backend
export type TrackingView = 'needs_action' | DeliveryTrackingTab;

export function parseTrackingSearch(locationSearch: string): {
  view: TrackingView | null;
  orderId: string | null;
} {
  const params = new URLSearchParams(locationSearch);
  const tab = params.get('tab');
  const orderId = params.get('order');

  const view: TrackingView | null =
    tab === 'in_transit' || tab === 'pending' || tab === 'returning' || tab === 'closed'
      ? (tab as DeliveryTrackingTab)
      : tab === 'needs_action'
        ? 'needs_action'
        : null;

  return { view, orderId: orderId || null };
}

export function buildQueueSearch(orderId?: string) {
  const params = new URLSearchParams({ tab: 'assigned' });
  if (orderId) params.set('order', orderId);
  return `?${params.toString()}`;
}
