import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchImportEntries,
  type ImportBatchDetail,
  type ImportEntry,
  type ImportEntryStats,
  type ImportEntryTab,
} from '@/lib/retailApi';
import type { Order } from '@/data/orderTypes';

const PAGE_SIZE = 50;
const EMPTY_STATS: ImportEntryStats = {
  review: 0,
  approved: 0,
  cancelled: 0,
  rejected: 0,
  error: 0,
  value: 0,
  total: 0,
  totalRows: 0,
  batchCount: 0,
};

type WindowParams = { days?: number; from?: string; to?: string };

function entryKey(entry: ImportEntry) {
  return entry.order?.id ?? entry.rows[0]?.id ?? entry.batch.id;
}

export function useImportEntries({
  batchId,
  tab,
  query,
  windowParams,
}: {
  batchId?: string;
  tab: ImportEntryTab;
  query: string;
  windowParams?: WindowParams;
}) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [stats, setStats] = useState<ImportEntryStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [groupSuggestions, setGroupSuggestions] = useState<
    NonNullable<ImportBatchDetail['groupSuggestions']>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(1);
  const requestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const paramsKey = JSON.stringify({ batchId, tab, q: debouncedQuery, windowParams });

  const fetchPage = useCallback(
    async (page: number, append: boolean) => {
      const requestId = ++requestRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchImportEntries({
          page,
          limit: PAGE_SIZE,
          tab,
          q: debouncedQuery || undefined,
          batchId,
          ...windowParams,
        });
        if (requestId !== requestRef.current) return;
        setEntries((current) => {
          if (!append) return result.entries;
          const seen = new Set(current.map(entryKey));
          return [...current, ...result.entries.filter((entry) => !seen.has(entryKey(entry)))];
        });
        setStats(result.stats);
        setTotal(result.total);
        setHasMore(result.hasMore);
        setGroupSuggestions(result.groupSuggestions);
        pageRef.current = page;
        setPage(page);
      } catch (cause) {
        if (requestId === requestRef.current) {
          setError(cause instanceof Error ? cause.message : 'โหลดรายการนำเข้าไม่สำเร็จ');
        }
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // paramsKey captures all request inputs with stable primitive equality.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paramsKey],
  );

  useEffect(() => {
    setEntries([]);
    setHasMore(false);
    pageRef.current = 1;
    void fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore) return;
    void fetchPage(pageRef.current + 1, false);
  }, [fetchPage, hasMore, loading, loadingMore]);

  const loadPrevious = useCallback(() => {
    if (pageRef.current <= 1 || loading || loadingMore) return;
    void fetchPage(pageRef.current - 1, false);
  }, [fetchPage, loading, loadingMore]);

  const reload = useCallback(async () => {
    await fetchPage(1, false);
  }, [fetchPage]);

  const details = useMemo<ImportBatchDetail[]>(
    () =>
      entries.map((entry, index) => ({
        ...entry.batch,
        rows: entry.rows,
        ...(index === 0 ? { groupSuggestions } : {}),
      })),
    [entries, groupSuggestions],
  );
  const entryOrders = useMemo<Order[]>(
    () => entries.flatMap((entry) => (entry.order ? [entry.order] : [])),
    [entries],
  );

  return {
    details,
    entryOrders,
    stats,
    loading,
    loadingMore,
    hasMore,
    loaded: entries.length,
    total,
    page,
    error,
    loadMore,
    loadPrevious,
    reload,
  };
}
