import { useMemo } from 'react';
import { Order } from '@/data/orderTypes';
import { buildOrderSearchText } from '@/features/inbox/utils/orderFormatting';
import { normalizeOrderNumberInput } from '@/lib/orderNumber';

export const INBOX_FILTERS = ['all', 'needs_review', 'new', 'ready'] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const FILTER_LABEL: Record<InboxFilter, string> = {
  all: 'ทั้งหมด',
  needs_review: 'ต้องตรวจ',
  new: 'ใหม่',
  ready: 'พร้อม',
};

export const INBOX_STATUSES: Order['status'][] = ['new', 'parsing', 'needs_review', 'ready'];

export function useOrderFiltering(orders: Order[], filter: InboxFilter, query: string) {
  const inboxOrders = useMemo(
    () => orders.filter((order) => INBOX_STATUSES.includes(order.status)),
    [orders],
  );

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    // รองรับพิมพ์เลขออเดอร์แบบย่อ เช่น mvord42 → MV-ORD-000042
    const normalizedOrderNo = normalizeOrderNumberInput(query).toLowerCase();

    return inboxOrders.filter((order) => {
      const matchesFilter = filter === 'all' ? true : order.status === filter;
      const searchText = buildOrderSearchText(order);
      const matchesQuery =
        !normalizedQuery ||
        searchText.includes(normalizedQuery) ||
        (normalizedOrderNo !== normalizedQuery && searchText.includes(normalizedOrderNo));

      return matchesFilter && matchesQuery;
    });
  }, [filter, inboxOrders, query]);

  const filterCounts = useMemo(() => {
    return INBOX_FILTERS.reduce(
      (counts, currentFilter) => {
        counts[currentFilter] = inboxOrders.filter((order) =>
          currentFilter === 'all' ? true : order.status === currentFilter,
        ).length;
        return counts;
      },
      {} as Record<InboxFilter, number>,
    );
  }, [inboxOrders]);

  const inboxValue = useMemo(
    () => inboxOrders.reduce((sum, order) => sum + order.totalValue, 0),
    [inboxOrders],
  );

  return {
    inboxOrders,
    filteredOrders,
    filterCounts,
    inboxValue,
  };
}
