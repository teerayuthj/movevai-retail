import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePullToRefreshOptions {
  /** เรียกตอนปล่อยนิ้วเมื่อดึงเกิน threshold */
  onRefresh: () => Promise<void> | void;
  /** ระยะดึง (px) ที่ต้องเกินถึงจะ trigger refresh */
  threshold?: number;
  /** ระยะดึงสูงสุด (px) ที่การ์ดจะขยับลงได้ */
  maxPull?: number;
  /** แรงต้าน 0–1 (ยิ่งน้อยยิ่งหนืด) */
  resistance?: number;
  /** ปิดการทำงาน (เช่น กำลังดูแผนที่) */
  disabled?: boolean;
}

/**
 * Pull-to-refresh แบบ social app: ลากลงจากบนสุดของ scroll container แล้วปล่อยเพื่อรีเฟรช.
 * ใช้ native touch listener + preventDefault เพื่อไม่ให้ browser scroll แย่งตอนกำลังดึง
 * และล็อกทิศทาง (แนวตั้งลงเท่านั้น) เพื่อไม่ชนกับ swipe เปลี่ยนแท็บแนวนอนของ container แม่.
 */
export function usePullToRefresh<T extends HTMLElement>({
  onRefresh,
  threshold = 64,
  maxPull = 96,
  resistance = 0.5,
  disabled = false,
}: UsePullToRefreshOptions) {
  const scrollRef = useRef<T | null>(null);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const distanceRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const lockRef = useRef<'pull' | 'ignore' | null>(null);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPull = useCallback((value: number) => {
    distanceRef.current = value;
    setDistance(value);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || disabled) return;

    const reset = () => {
      startYRef.current = null;
      lockRef.current = null;
      setDragging(false);
      setPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || el.scrollTop > 0 || e.touches.length !== 1) return;
      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      lockRef.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      // เผลอ scroll ลงไประหว่างทาง = ยกเลิกการดึง
      if (el.scrollTop > 0) {
        reset();
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;

      // ล็อกทิศทางครั้งแรกที่ขยับพอ: แนวนอน → ปล่อยให้ swipe แท็บจัดการ
      if (lockRef.current === null) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        lockRef.current = dy > Math.abs(dx) ? 'pull' : 'ignore';
      }
      if (lockRef.current !== 'pull' || dy <= 0) {
        if (distanceRef.current !== 0) setPull(0);
        return;
      }

      e.preventDefault();
      setDragging(true);
      setPull(Math.min(maxPull, dy * resistance));
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) return;
      const reached = distanceRef.current >= threshold;
      startYRef.current = null;
      lockRef.current = null;
      setDragging(false);

      if (!reached) {
        setPull(0);
        return;
      }

      refreshingRef.current = true;
      setRefreshing(true);
      setPull(threshold);
      void (async () => {
        try {
          await onRefreshRef.current();
        } finally {
          refreshingRef.current = false;
          setRefreshing(false);
          setPull(0);
        }
      })();
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [disabled, maxPull, resistance, threshold, setPull]);

  return { scrollRef, distance, refreshing, dragging, threshold };
}
