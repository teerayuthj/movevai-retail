import type { DeliveryTrackingTab } from '@/lib/deliveryExecution';

// มุมมองหน้า map ตรงกับ DeliveryTrackingTab ของ backend
export type TrackingView = DeliveryTrackingTab;

export function parseTrackingSearch(locationSearch: string): {
  view: TrackingView | null;
  orderId: string | null;
} {
  const params = new URLSearchParams(locationSearch);
  const tab = params.get('tab');
  const orderId = params.get('order');

  const view: TrackingView | null =
    tab === 'awaiting_acceptance' ||
    tab === 'overdue' ||
    tab === 'in_transit' ||
    tab === 'pending' ||
    tab === 'returning' ||
    tab === 'closed'
      ? (tab as DeliveryTrackingTab)
      : tab === 'needs_action'
        ? 'pending'
        : null;

  return { view, orderId: orderId || null };
}

export function buildQueueSearch(orderId?: string) {
  const params = new URLSearchParams({ tab: 'assigned' });
  if (orderId) params.set('order', orderId);
  return `?${params.toString()}`;
}
