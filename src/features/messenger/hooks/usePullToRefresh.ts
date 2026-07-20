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
 * ใช้ native touch listener + mouse fallback (สำหรับ Xcode Simulator) + preventDefault
 * เพื่อไม่ให้ browser scroll แย่งตอนกำลังดึง
 * และล็อกทิศทาง (แนวตั้งลงเท่านั้น) เพื่อไม่ชนกับ swipe เปลี่ยนแท็บแนวนอนของ container แม่.
 */
export function usePullToRefresh<T extends HTMLElement>({
  onRefresh,
  threshold = 64,
  maxPull = 96,
  resistance = 0.5,
  disabled = false,
}: UsePullToRefreshOptions) {
  // เก็บ element เป็น state (ผ่าน callback ref) แทน useRef เพราะหน้า messenger
  // early-return ตอน authChecking/ยังไม่ login — ถ้าใช้ useRef effect จะรันตอน
  // element ยังไม่ mount แล้วไม่มีอะไร trigger ให้ attach listener ซ้ำ
  const [scrollEl, setScrollEl] = useState<T | null>(null);
  const scrollRef = useCallback((el: T | null) => setScrollEl(el), []);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const distanceRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const mousePullRef = useRef(false);
  const lockRef = useRef<'pull' | 'ignore' | null>(null);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const setPull = useCallback((value: number) => {
    distanceRef.current = value;
    setDistance(value);
  }, []);

  useEffect(() => {
    const el = scrollEl;
    if (!el || disabled) return;

    const reset = () => {
      startYRef.current = null;
      lockRef.current = null;
      mousePullRef.current = false;
      setDragging(false);
      setPull(0);
    };

    const beginPull = (clientX: number, clientY: number, source: 'touch' | 'mouse') => {
      if (refreshingRef.current || el.scrollTop > 0) return;
      startYRef.current = clientY;
      startXRef.current = clientX;
      mousePullRef.current = source === 'mouse';
      lockRef.current = null;
    };

    const movePull = (
      event: Event,
      clientX: number,
      clientY: number,
      source: 'touch' | 'mouse',
    ) => {
      if (startYRef.current === null || mousePullRef.current !== (source === 'mouse')) return;
      // เผลอ scroll ลงไประหว่างทาง = ยกเลิกการดึง
      if (el.scrollTop > 0) {
        reset();
        return;
      }
      const dy = clientY - startYRef.current;
      const dx = clientX - startXRef.current;

      // ล็อกทิศทางครั้งแรกที่ขยับพอ: แนวนอน → ปล่อยให้ swipe แท็บจัดการ
      if (lockRef.current === null) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        lockRef.current = dy > Math.abs(dx) ? 'pull' : 'ignore';
      }
      if (lockRef.current !== 'pull' || dy <= 0) {
        if (distanceRef.current !== 0) setPull(0);
        return;
      }

      event.preventDefault();
      setDragging(true);
      setPull(Math.min(maxPull, dy * resistance));
    };

    const finishPull = (source: 'touch' | 'mouse') => {
      if (startYRef.current === null || mousePullRef.current !== (source === 'mouse')) return;
      const reached = distanceRef.current >= threshold;
      startYRef.current = null;
      lockRef.current = null;
      mousePullRef.current = false;
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

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      beginPull(e.touches[0].clientX, e.touches[0].clientY, 'touch');
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      movePull(e, e.touches[0].clientX, e.touches[0].clientY, 'touch');
    };

    const onTouchEnd = () => finishPull('touch');
    // Simulator ส่ง mouse events เข้ามาแทน touch events จึงต้องรองรับแยกจากเครื่องจริง.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) beginPull(e.clientX, e.clientY, 'mouse');
    };
    const onMouseMove = (e: MouseEvent) => movePull(e, e.clientX, e.clientY, 'mouse');
    const onMouseUp = () => finishPull('mouse');

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    el.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', reset);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [scrollEl, disabled, maxPull, resistance, threshold, setPull]);

  return { scrollRef, distance, refreshing, dragging, threshold };
}
