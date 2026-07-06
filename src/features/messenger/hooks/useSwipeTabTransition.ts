import { useEffect, useRef } from 'react';
import { MESSENGER_TABS, type MessengerTab } from '../messengerTabs';

const LOCK_THRESHOLD_PX = 10; // ระยะขยับก่อนตัดสินว่าเป็นปัดแนวนอนหรือ scroll แนวตั้ง
const COMMIT_RATIO = 0.28; // ต้องปัดเกิน 28% ของความกว้างจอถึงจะเปลี่ยนแท็บ
const SETTLE_MS = 220;

type Gesture = { x: number; y: number; lock: 'x' | 'y' | null; width: number };

/**
 * ให้เนื้อหาแท็บ messenger เลื่อนตามนิ้วตอนปัดซ้าย/ขวา แล้วสลับแท็บเมื่อปัดเกิน threshold.
 * ใช้ native touch listener (ไม่ใช่ onTouchMove ของ React) เพราะ React ผูก touchmove
 * แบบ passive by default → เรียก preventDefault ไม่ได้ ทำให้หยุด scroll แนวตั้งตอนลากแนวนอนไม่ได้.
 * ลาก DOM node ตรง ๆ (ไม่ผ่าน React state) เพื่อไม่ re-render ทุกพิกเซลที่นิ้วขยับ.
 */
export function useSwipeTabTransition(
  activeTab: MessengerTab | null,
  onSelect: (tab: MessengerTab) => void,
  enabled: boolean,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!enabled) {
      el.style.transition = '';
      el.style.transform = '';
      return;
    }

    let gesture: Gesture | null = null;
    let settling = false;
    let timeoutId: number | undefined;

    const setTransform = (dx: number, withTransition: boolean) => {
      el.style.transition = withTransition ? `transform ${SETTLE_MS}ms ease-out` : 'none';
      el.style.transform = dx ? `translateX(${dx}px)` : '';
    };

    const onTouchStart = (e: TouchEvent) => {
      if (settling) return;
      const touch = e.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, lock: null, width: el.offsetWidth };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!gesture) return;
      const touch = e.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (gesture.lock === null) {
        if (Math.abs(dx) < LOCK_THRESHOLD_PX && Math.abs(dy) < LOCK_THRESHOLD_PX) return;
        gesture.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      if (gesture.lock !== 'x') return;
      e.preventDefault();

      const currentIndex = activeTab
        ? MESSENGER_TABS.findIndex((tab) => tab.key === activeTab)
        : -1;
      const atFirstTab = currentIndex <= 0;
      const atLastTab = currentIndex === MESSENGER_TABS.length - 1;
      // ชนขอบ (ไม่มีแท็บก่อนหน้า/ถัดไป) → ลากได้แต่มีแรงต้าน (rubber band)
      const overscroll = (dx > 0 && atFirstTab) || (dx < 0 && atLastTab);
      setTransform(overscroll ? dx / 3 : dx, false);
    };

    const finish = (g: Gesture, dx: number) => {
      const currentIndex = activeTab
        ? MESSENGER_TABS.findIndex((tab) => tab.key === activeTab)
        : -1;
      const commit = currentIndex !== -1 && Math.abs(dx) > g.width * COMMIT_RATIO;
      const nextIndex = dx < 0 ? currentIndex + 1 : currentIndex - 1;
      const nextTab = commit ? MESSENGER_TABS[nextIndex] : undefined;

      if (nextTab) {
        settling = true;
        setTransform(dx < 0 ? -g.width : g.width, true);
        timeoutId = window.setTimeout(() => {
          onSelect(nextTab.key);
          setTransform(0, false);
          settling = false;
        }, SETTLE_MS);
      } else {
        setTransform(0, true);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gesture;
      gesture = null;
      if (!g || g.lock !== 'x') return;
      const touch = e.changedTouches[0];
      finish(g, touch.clientX - g.x);
    };

    const onTouchCancel = () => {
      gesture = null;
      if (!settling) setTransform(0, true);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [activeTab, enabled, onSelect]);

  return containerRef;
}
