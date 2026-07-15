import { useCallback, useEffect, useRef } from 'react';
import { isNativeApp } from '@/lib/platform';
import { updateMessengerPresence, type MessengerPresenceUpdate } from '@/lib/retailApi';
import { getMessengerDeviceId, getMessengerPlatform } from '../messengerDevice';
import { isPlausibleThaiCoord } from '../geocode';

const HEARTBEAT_INTERVAL_MS = 2 * 60_000;

type PresenceLocationResult = Pick<MessengerPresenceUpdate, 'location' | 'locationPermission'>;

function webCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 15_000,
    });
  });
}

async function readCurrentLocation(): Promise<PresenceLocationResult> {
  try {
    if (isNativeApp) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const permission = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (permission.location === 'denied') return { locationPermission: 'denied' };
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 15_000,
      });
      const location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        recordedAt: new Date(position.timestamp).toISOString(),
      };
      return isPlausibleThaiCoord(location)
        ? { locationPermission: 'granted', location }
        : { locationPermission: 'error' };
    }

    if (!navigator.geolocation) return { locationPermission: 'unavailable' };
    const position = await webCurrentPosition();
    const location = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      recordedAt: new Date(position.timestamp).toISOString(),
    };
    return isPlausibleThaiCoord(location)
      ? { locationPermission: 'granted', location }
      : { locationPermission: 'error' };
  } catch (error) {
    const denied = (error as { code?: number } | null)?.code === 1;
    return { locationPermission: denied ? 'denied' : 'error' };
  }
}

/** Lightweight foreground presence; ไม่สร้าง Route tracking session และไม่เก็บเส้นทาง */
export function useMessengerPresence(enabled: boolean) {
  const sending = useRef(false);

  const sendPresence = useCallback(async () => {
    if (!enabled || sending.current || !navigator.onLine) return;
    sending.current = true;
    try {
      const foreground = document.visibilityState === 'visible';
      const locationResult = foreground ? await readCurrentLocation() : {};
      await updateMessengerPresence({
        deviceId: getMessengerDeviceId(),
        platform: getMessengerPlatform(),
        appState: foreground ? 'foreground' : 'background',
        ...locationResult,
      });
    } catch {
      // Presence เป็น best effort: ห้ามทำให้การรับ/ส่งงานของ Messenger ล้มเหลว
    } finally {
      sending.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void sendPresence();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sendPresence();
    }, HEARTBEAT_INTERVAL_MS);
    const onFocus = () => void sendPresence();
    const onVisibilityChange = () => void sendPresence();
    const onOnline = () => void sendPresence();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, sendPresence]);
}
