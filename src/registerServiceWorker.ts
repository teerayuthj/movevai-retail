import { Capacitor } from '@capacitor/core';

export function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (Capacitor.isNativePlatform()) {
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(registrations.map((registration) => registration.unregister())),
      )
      .catch(() => {
        // Native push does not use the PWA service worker; stale SW cleanup is best-effort.
      });
    return;
  }

  window.addEventListener('load', () => {
    const swUrl = import.meta.env.DEV ? '/src/sw.ts' : '/sw.js';

    void navigator.serviceWorker
      .register(swUrl, {
        scope: '/',
        type: 'module',
        updateViaCache: 'none',
      })
      .then((registration) => registration.update())
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('Service worker registration failed', error);
      });
  });
}
