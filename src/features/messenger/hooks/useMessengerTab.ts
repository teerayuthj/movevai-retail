import { useCallback, useEffect, useState } from 'react';
import {
  getMessengerOrderMapId,
  getMessengerOrderMapPath,
  getMessengerTabFromPath,
  getMessengerTabPath,
  type MessengerTab,
} from '../messengerTabs';

type NavigateOptions = {
  /** ใช้ replaceState แทน pushState — สำหรับ auto-select/redirect ที่ไม่ควรค้างใน history */
  replace?: boolean;
};

/**
 * ผูก active tab กับ URL pathname (/messenger/<segment>).
 * - กด tab → push เข้า history (back/forward ใช้ได้)
 * - back/forward → popstate sync activeTab กลับ
 * - /messenger เปล่า หรือ segment ไม่รู้จัก → activeTab = null (ให้ caller redirect เอง)
 *
 * หมายเหตุ: App.tsx มี popstate listener ของตัวเอง (sync PageKey) — ตัวนี้แยกอิสระ
 * เพราะ /messenger/* map เป็น page 'messenger' ตัวเดียว App จึงไม่ re-render เวลาเปลี่ยน tab
 */
export function useMessengerTab() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const activeTab = getMessengerTabFromPath(pathname);
  const mapOrderId = getMessengerOrderMapId(pathname);

  const setTab = useCallback((tab: MessengerTab, options?: NavigateOptions) => {
    const nextPath = getMessengerTabPath(tab);
    if (window.location.pathname === nextPath) return;

    if (options?.replace) {
      window.history.replaceState(window.history.state, '', nextPath);
    } else {
      window.history.pushState({ page: 'messenger' }, '', nextPath);
    }
    setPathname(nextPath);
  }, []);

  const openOrderMap = useCallback((orderId: string) => {
    const nextPath = getMessengerOrderMapPath(orderId);
    if (window.location.pathname === nextPath) return;
    window.history.pushState({ page: 'messenger' }, '', nextPath);
    setPathname(nextPath);
  }, []);

  const backToPending = useCallback(() => {
    const nextPath = getMessengerTabPath('pending_confirmation');
    window.history.replaceState({ page: 'messenger' }, '', nextPath);
    setPathname(nextPath);
  }, []);

  return { activeTab, mapOrderId, setTab, openOrderMap, backToPending };
}
