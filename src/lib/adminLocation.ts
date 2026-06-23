import type { RouteOrigin } from '@/lib/retailApi';

export function getAdminRouteOrigin(timeoutMs = 5000): Promise<RouteOrigin | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(undefined);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(undefined),
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: timeoutMs,
      },
    );
  });
}
