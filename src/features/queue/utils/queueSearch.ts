import type { DriverQueueTab } from '@/lib/deliveryExecution';

export function parseQueueSearch(locationSearch: string) {
  const params = new URLSearchParams(locationSearch);
  const tab = params.get('tab');
  const orderId = params.get('order');
  const mode = params.get('mode');

  return {
    tab: tab === 'ready' || tab === 'assigned' ? (tab as DriverQueueTab) : null,
    orderId: orderId || null,
    mode: mode === 'fast' ? 'fast' : null,
  };
}

export function buildTrackingSearch(orderId?: string) {
  const params = new URLSearchParams({ tab: 'in_transit' });
  if (orderId) params.set('order', orderId);
  return `?${params.toString()}`;
}
