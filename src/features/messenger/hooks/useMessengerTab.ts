import { useCallback, useEffect, useState } from 'react';
import {
  getMessengerOrderMapId,
  getMessengerOrderMapPath,
  getMessengerTabFromPath,
  getMessengerTabPath,
  type MessengerTab,
} from '../messengerTabs';

const MESSENGER_NAVIGATION_EVENT = 'movevai:messenger-navigation';

type NavigateOptions = {
  /** ใช้ replaceState แทน pushState — สำหรับ auto-select/redirect ที่ไม่ควรค้างใน history */
  replace?: boolean;
};

function emitMessengerNavigation() {
  window.dispatchEvent(new CustomEvent(MESSENGER_NAVIGATION_EVENT));
}

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
    const syncPathname = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPathname);
    window.addEventListener(MESSENGER_NAVIGATION_EVENT, syncPathname);
    return () => {
      window.removeEventListener('popstate', syncPathname);
      window.removeEventListener(MESSENGER_NAVIGATION_EVENT, syncPathname);
    };
  }, []);

  const activeTab = getMessengerTabFromPath(pathname);
  const mapOrderId = getMessengerOrderMapId(pathname);

  const setTab = useCallback((tab: MessengerTab, options?: NavigateOptions) => {
    const nextPath = getMessengerTabPath(tab);
    if (window.location.pathname === nextPath) {
      setPathname(nextPath);
      return;
    }

    if (options?.replace) {
      window.history.replaceState(window.history.state, '', nextPath);
    } else {
      window.history.pushState({ page: 'messenger' }, '', nextPath);
    }
    setPathname(nextPath);
    emitMessengerNavigation();
  }, []);

  const openOrderMap = useCallback((orderId: string) => {
    const nextPath = getMessengerOrderMapPath(orderId);
    if (window.location.pathname === nextPath) {
      setPathname(nextPath);
      return;
    }
    window.history.pushState({ page: 'messenger' }, '', nextPath);
    setPathname(nextPath);
    emitMessengerNavigation();
  }, []);

  const backToPending = useCallback(() => {
    const nextPath = getMessengerTabPath('pending_confirmation');
    window.history.replaceState({ page: 'messenger' }, '', nextPath);
    setPathname(nextPath);
    emitMessengerNavigation();
  }, []);

  return { activeTab, mapOrderId, setTab, openOrderMap, backToPending };
}
