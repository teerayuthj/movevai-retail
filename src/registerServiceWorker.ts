export function registerAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

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
