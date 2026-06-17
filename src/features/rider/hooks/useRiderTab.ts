import { useCallback, useEffect, useState } from 'react';
import { getRiderTabFromPath, getRiderTabPath, type RiderTab } from '../riderTabs';

type NavigateOptions = {
  /** ใช้ replaceState แทน pushState — สำหรับ auto-select/redirect ที่ไม่ควรค้างใน history */
  replace?: boolean;
};

/**
 * ผูก active tab กับ URL pathname (/rider/<segment>).
 * - กด tab → push เข้า history (back/forward ใช้ได้)
 * - back/forward → popstate sync activeTab กลับ
 * - /rider เปล่า หรือ segment ไม่รู้จัก → activeTab = null (ให้ caller redirect เอง)
 *
 * หมายเหตุ: App.tsx มี popstate listener ของตัวเอง (sync PageKey) — ตัวนี้แยกอิสระ
 * เพราะ /rider/* map เป็น page 'rider' ตัวเดียว App จึงไม่ re-render เวลาเปลี่ยน tab
 */
export function useRiderTab() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const activeTab = getRiderTabFromPath(pathname);

  const setTab = useCallback((tab: RiderTab, options?: NavigateOptions) => {
    const nextPath = getRiderTabPath(tab);
    if (window.location.pathname === nextPath) return;

    if (options?.replace) {
      window.history.replaceState(window.history.state, '', nextPath);
    } else {
      window.history.pushState({ page: 'rider' }, '', nextPath);
    }
    setPathname(nextPath);
  }, []);

  return { activeTab, setTab };
}
