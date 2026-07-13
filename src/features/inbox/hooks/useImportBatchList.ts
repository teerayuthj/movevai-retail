import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { fetchImportBatches, type ImportBatch } from '@/lib/retailApi';

// ดึงทีละหน้า แล้ว infinite scroll ต่อ — ค่า default 30 วันย้อนหลัง (0 = ทั้งหมด)
const BATCH_PAGE_SIZE = 20;
const DEFAULT_DAYS = 30;
// ค่าพิเศษใน dropdown = โหมดเลือกช่วงวันที่เอง (from–to)
export const CUSTOM_DAYS = -1;
export const DAY_WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30 วันล่าสุด' },
  { value: 90, label: '90 วันล่าสุด' },
  { value: 180, label: '180 วันล่าสุด' },
  { value: 365, label: '1 ปีล่าสุด' },
  { value: 0, label: 'ทั้งหมด' },
  { value: CUSTOM_DAYS, label: 'กำหนดช่วงเอง…' },
];

export type BatchWindowParams = { days?: number; from?: string; to?: string };

export type ImportBatchListState = ReturnType<typeof useImportBatchList>;

// โหลด/แบ่งหน้า/poll รายการ batch นำเข้าตามช่วงเวลาที่เลือก (days หรือ from–to)
export function useImportBatchList({ onPageLoaded }: { onPageLoaded?: () => void } = {}) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [range, setRange] = useState<DateRange | undefined>();
  // กันยิงซ้ำระหว่างกำลังโหลดหน้าใหม่ (ref อ่านได้ทันทีไม่ต้องรอ re-render)
  const loadingRef = useRef(false);
  const pageRef = useRef(1);
  const onPageLoadedRef = useRef(onPageLoaded);
  onPageLoadedRef.current = onPageLoaded;

  const customMode = days === CUSTOM_DAYS;
  const rangeReady = !!(range?.from && range?.to);
  // พารามิเตอร์ช่วงเวลาที่จะส่งให้ backend — null = โหมดกำหนดเองแต่ยังเลือกไม่ครบ (ยังไม่ยิง)
  const windowParams = useMemo<BatchWindowParams | null>(() => {
    if (!customMode) return { days };
    if (range?.from && range?.to) {
      return { from: format(range.from, 'yyyy-MM-dd'), to: format(range.to, 'yyyy-MM-dd') };
    }
    return null;
  }, [customMode, days, range]);
  // key คงที่สำหรับ dep ของ reload — กัน object identity เปลี่ยนทุก render
  const windowKey = windowParams ? JSON.stringify(windowParams) : 'pending';

  // โหลดหน้าแรก (reset) ตามช่วงเวลาปัจจุบัน
  const reload = useCallback(() => {
    if (loadingRef.current) return;
    // โหมดกำหนดเองแต่ยังเลือกช่วงไม่ครบ → ล้างรายการ รอผู้ใช้เลือก
    if (!windowParams) {
      setBatches([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    pageRef.current = 1;
    setPage(1);
    fetchImportBatches({ page: 1, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        setBatches(res.batches);
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch((error) => {
        console.error(error);
        toast.error('โหลดประวัติการนำเข้าไม่สำเร็จ');
      })
      .finally(() => {
        setLoading(false);
        loadingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  // โหลดหน้าถัดไปต่อท้าย (infinite scroll)
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore || !windowParams) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    fetchImportBatches({ page: nextPage, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        pageRef.current = nextPage;
        setPage(nextPage);
        setBatches(res.batches);
        onPageLoadedRef.current?.();
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch((error) => {
        console.error(error);
        toast.error('โหลดรายการเพิ่มไม่สำเร็จ');
      })
      .finally(() => {
        setLoadingMore(false);
        loadingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, windowKey]);

  const loadPrevious = useCallback(() => {
    if (loadingRef.current || pageRef.current <= 1 || !windowParams) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const previousPage = pageRef.current - 1;
    fetchImportBatches({ page: previousPage, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        pageRef.current = previousPage;
        setPage(previousPage);
        setBatches(res.batches);
        onPageLoadedRef.current?.();
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch((error) => {
        console.error(error);
        toast.error('โหลดรายการก่อนหน้าไม่สำเร็จ');
      })
      .finally(() => {
        setLoadingMore(false);
        loadingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  // จำนวน batch ปัจจุบัน (อ่านใน poll callback ที่ต้อง stable identity)
  const batchCountRef = useRef(0);
  useEffect(() => {
    batchCountRef.current = batches.length;
  }, [batches.length]);

  // refresh เบื้องหลังแบบเงียบ ๆ — ดึงหน้าแรกมา merge ทับของเดิม (อัปเดตสถานะ batch ที่กำลังประมวลผล
  // + เติมไฟล์ใหม่ที่เพิ่งเข้ามาจาก LINE) โดยไม่รีเซ็ตหน้าที่ infinite-scroll โหลดไว้แล้ว
  const pollRefresh = useCallback(() => {
    if (loadingRef.current || !windowParams) return;
    fetchImportBatches({ page: 1, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        setBatches((prev) => {
          if (prev.length === 0) return res.batches;
          const incomingById = new Map(res.batches.map((b) => [b.id, b]));
          if (pageRef.current === 1) return res.batches;
          return prev.map((batch) => incomingById.get(batch.id) ?? batch);
        });
        setTotal(res.total);
        if (pageRef.current === 1 || batchCountRef.current === 0) setHasMore(res.hasMore);
      })
      .catch(() => {
        // เงียบ — เป็น background poll ไม่ต้องรบกวนผู้ใช้ด้วย toast
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  const inProgressCount = batches.filter(
    (b) => b.status === 'PENDING' || b.status === 'PROCESSING',
  ).length;

  // มี batch กำลังประมวลผล → poll ถี่เพื่อโชว์ความคืบหน้าแบบเรียลไทม์;
  // ปกติ → poll ห่างเพื่อรับไฟล์/รูปใหม่จาก LINE เข้ามาเองโดยไม่ต้องกด refresh
  useEffect(() => {
    if (!windowParams) return;
    const intervalMs = inProgressCount > 0 ? 3000 : 20000;
    const timer = window.setInterval(pollRefresh, intervalMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgressCount > 0, windowKey, pollRefresh]);

  return {
    batches,
    loading,
    loadingMore,
    hasMore,
    total,
    page,
    days,
    setDays,
    range,
    setRange,
    customMode,
    rangeReady,
    windowParams,
    windowKey,
    inProgressCount,
    reload,
    loadMore,
    loadPrevious,
  };
}
