import { useEffect, useRef, useState } from 'react';
import { fetchMessengerRoadRoute, type MessengerRoadRoute } from '@/lib/retailApi';

type Coords = { lat: number; lng: number };
export type RoadRouteStatus = 'idle' | 'loading' | 'ready' | 'error';

const EARTH_RADIUS_METERS = 6_371_000;
// อย่าเรียก OSRM ถี่เกินไป — รอจน messenger ขยับพอสมควรหรือครบเวลาขั้นต่ำ
const MIN_REFRESH_MS = 12_000;
const MIN_MOVE_METERS = 50;

function metersBetween(from: Coords, to: Coords) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

/**
 * คำนวณเส้นทางตามถนนจากตำแหน่ง messenger → จุดส่งที่เหลือ (ผ่าน backend/OSRM)
 * รีเฟรชเมื่อชุดจุดส่งเปลี่ยน หรือ messenger ขยับเกิน MIN_MOVE_METERS (กันยิงถี่ด้วย MIN_REFRESH_MS)
 * ส่ง status กลับไปให้ผู้เรียกแสดงสถานะระหว่างรอ/ล้มเหลวโดยไม่ต้องโชว์ระยะเส้นตรงเป็นคำตอบหลัก
 */
export function useRoadRoute(messenger: Coords | null, stops: Coords[], enabled: boolean) {
  const [route, setRoute] = useState<MessengerRoadRoute | null>(null);
  const [status, setStatus] = useState<RoadRouteStatus>('idle');
  const [error, setError] = useState('');
  const lastFetch = useRef<{ at: number; messenger: Coords; stopsKey: string } | null>(null);

  const stopsKey = stops.map((stop) => `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (!enabled || !messenger || stops.length === 0) {
      setRoute(null);
      setStatus('idle');
      setError('');
      lastFetch.current = null;
      return;
    }

    const prev = lastFetch.current;
    const stopsChanged = !prev || prev.stopsKey !== stopsKey;
    const movedFar = !prev || metersBetween(prev.messenger, messenger) >= MIN_MOVE_METERS;
    const cooldownPassed = !prev || Date.now() - prev.at >= MIN_REFRESH_MS;
    if (!stopsChanged && !(movedFar && cooldownPassed)) return;

    let cancelled = false;
    const points = [messenger, ...stops];
    lastFetch.current = { at: Date.now(), messenger, stopsKey };
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    setError('');
    void fetchMessengerRoadRoute(points)
      .then((result) => {
        if (cancelled) return;
        if (result.geometry.length >= 2 && result.legs.length > 0) {
          setRoute(result);
          setStatus('ready');
          return;
        }
        setRoute(null);
        setStatus('error');
        setError('ไม่พบเส้นทางถนนสำหรับตำแหน่งนี้');
      })
      .catch((reason) => {
        if (!cancelled) {
          setRoute(null);
          setStatus('error');
          setError(reason instanceof Error ? reason.message : 'คำนวณเส้นทางถนนไม่สำเร็จ');
          lastFetch.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
    // messenger.lat/lng ผ่าน dependency ด้านล่างเพื่อ trigger เมื่อขยับ; gating จริงอยู่ในตัว effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, messenger?.lat, messenger?.lng, stopsKey]);

  return { route, status, error };
}
