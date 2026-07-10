import type { Order } from '@/data/orderTypes';

export function normalizeOrderNumberInput(value: string): string {
  const compact = value
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, '');
  const match = compact.match(/^MVORD(\d+)$/);
  if (!match) return value.trim();
  return `MV-ORD-${match[1].padStart(6, '0')}`;
}

export function matchesOrderReference(order: Order, value: string): boolean {
  const query = normalizeOrderNumberInput(value).toUpperCase();
  return order.orderNo.toUpperCase() === query || order.code.toUpperCase() === query;
}
