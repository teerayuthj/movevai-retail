import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '../geocode';

export type RiderLocation = LatLng & {
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

export type RiderLocationStatus =
  | 'idle'
  | 'requesting'
  | 'tracking'
  | 'denied'
  | 'unavailable'
  | 'error';

export function useRiderLocation(enabled: boolean) {
  const [location, setLocation] = useState<RiderLocation | null>(null);
  const [status, setStatus] = useState<RiderLocationStatus>('idle');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setError('อุปกรณ์นี้ไม่รองรับการอ่านตำแหน่ง');
      return;
    }

    setStatus('requesting');
    setError('');

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
        });
        setStatus('tracking');
        setError('');
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
