import type { Order } from '@/data/orderTypes';

export function hasCsvImportSource(order: Order) {
  const importMeta = order.metadataJson?.import;
  return Boolean(importMeta?.batchId && importMeta.fileName);
}

export function buildInboxOrderEditSearch(order: Order) {
  const importMeta = order.metadataJson?.import;
  if (!importMeta?.batchId) {
    return `?tab=orders&order=${encodeURIComponent(order.id)}&edit=1`;
  }

  return `?tab=line_import&batch=${encodeURIComponent(importMeta.batchId)}&order=${encodeURIComponent(order.id)}&edit=1`;
}
