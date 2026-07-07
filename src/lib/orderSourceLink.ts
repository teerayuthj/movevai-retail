import type { Order } from '@/data/orderTypes';

export function hasCsvImportSource(order: Order) {
  const importMeta = order.metadataJson?.import;
  return Boolean(importMeta?.batchId && importMeta.fileName);
}

export function buildInboxOrderEditSearch(orderId: string) {
  return `?tab=orders&order=${encodeURIComponent(orderId)}&edit=1`;
}
