import { useCallback, useEffect, useState } from 'react';
import { isNativeApp } from '@/lib/platform';
import { isPlausibleThaiCoord, type LatLng } from '../geocode';

export type MessengerLocation = LatLng & {
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

export type MessengerLocationStatus =
  | 'idle'
  | 'requesting'
  | 'tracking'
  | 'denied'
  | 'unavailable'
  | 'error';

type GeoCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
};

function toLocation(coords: GeoCoords, timestamp: number): MessengerLocation {
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: coords.accuracy,
    heading: coords.heading,
    speed: coords.speed,
    timestamp,
  };
}

export function useMessengerLocation(enabled: boolean) {
  const [location, setLocation] = useState<MessengerLocation | null>(null);
  const [status, setStatus] = useState<MessengerLocationStatus>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    setStatus('requesting');
    setError('');

    const acceptPosition = (coords: GeoCoords, timestamp: number) => {
      const nextLocation = toLocation(coords, timestamp);
      if (!isPlausibleThaiCoord(nextLocation)) {
        setLocation(null);
        setStatus('error');
        setError(
          'GPS อยู่นอกพื้นที่ให้บริการในไทย กรุณาตั้ง Location ของเครื่อง/Simulator เป็นกรุงเทพฯ',
        );
        return;
      }

      setLocation(nextLocation);
      setStatus('tracking');
      setError('');
    };

    // --- Native (iOS/Android) — navigator.geolocation ใน WKWebView ไม่ trigger
    //     permission prompt เอง ต้องผ่าน @capacitor/geolocation ที่ bridge ไป CoreLocation ---
    if (isNativeApp) {
      let watchId: string | null = null;
      let cancelled = false;

      (async () => {
        try {
          const { Geolocation } = await import('@capacitor/geolocation');

          const permission = await Geolocation.requestPermissions({
            permissions: ['location'],
          });
          if (cancelled) return;
          if (permission.location === 'denied') {
            setStatus('denied');
            setError('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง');
            return;
          }

          watchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
            (position, watchError) => {
              if (watchError || !position) {
                setStatus('error');
                setError('ไม่สามารถอ่านตำแหน่งปัจจุบันได้');
                return;
              }
              acceptPosition(position.coords, position.timestamp);
            },
          );
        } catch {
          if (!cancelled) {
            setStatus('error');
            setError('ไม่สามารถอ่านตำแหน่งปัจจุบันได้');
          }
        }
      })();

      return () => {
        cancelled = true;
        if (watchId) {
          import('@capacitor/geolocation').then(({ Geolocation }) =>
            Geolocation.clearWatch({ id: watchId as string }),
          );
        }
      };
    }

    // --- Web / PWA ---
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('อุปกรณ์นี้ไม่รองรับการอ่านตำแหน่ง');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        acceptPosition(position.coords, position.timestamp);
      },
      (locationError) => {
        if (locationError.code === locationError.PERMISSION_DENIED) {
          setStatus('denied');
          setError('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง');
          return;
        }

        setStatus('error');
        setError(
          locationError.code === locationError.TIMEOUT
            ? 'อ่านตำแหน่งไม่ทันเวลา กรุณาลองใหม่'
            : 'ไม่สามารถอ่านตำแหน่งปัจจุบันได้',
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 15_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [attempt, enabled]);

  return { location, status, error, retry };
}
