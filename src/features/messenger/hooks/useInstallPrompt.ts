import { useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/platform';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const isStandalone = () =>
  // native app ถือว่า "ติดตั้งแล้ว" เสมอ — ไม่ต้องชวนเพิ่มลงหน้าจอโฮม
  isNativeApp ||
  (typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as { standalone?: boolean }).standalone === true));

const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** จัดการ "เพิ่มลงหน้าจอโฮม" — Android/Chrome ใช้ beforeinstallprompt, iOS ต้องบอกวิธีเอง */
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return {
    installed,
    canPrompt: !!deferred,
    needsIosHint: !installed && isIos() && !deferred,
    promptInstall,
  };
}
