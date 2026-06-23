import { useEffect, useRef, useState } from 'react';
import { fetchRiderRoadRoute, type RiderRoadRoute } from '@/lib/retailApi';

type Coords = { lat: number; lng: number };

const EARTH_RADIUS_METERS = 6_371_000;
// อย่าเรียก OSRM ถี่เกินไป — รอจน rider ขยับพอสมควรหรือครบเวลาขั้นต่ำ
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
 * คำนวณเส้นทางตามถนนจากตำแหน่ง rider → จุดส่งที่เหลือ (ผ่าน backend/OSRM)
 * รีเฟรชเมื่อชุดจุดส่งเปลี่ยน หรือ rider ขยับเกิน MIN_MOVE_METERS (กันยิงถี่ด้วย MIN_REFRESH_MS)
 * ระหว่างที่ยังไม่ได้เส้นจริง ผู้เรียกควร fallback ไปเส้นตรงเดิม
 */
export function useRoadRoute(rider: Coords | null, stops: Coords[], enabled: boolean) {
  const [route, setRoute] = useState<RiderRoadRoute | null>(null);
  const lastFetch = useRef<{ at: number; rider: Coords; stopsKey: string } | null>(null);

  const stopsKey = stops.map((stop) => `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (!enabled || !rider || stops.length === 0) {
      setRoute(null);
      lastFetch.current = null;
      return;
    }

    const prev = lastFetch.current;
    const stopsChanged = !prev || prev.stopsKey !== stopsKey;
    const movedFar = !prev || metersBetween(prev.rider, rider) >= MIN_MOVE_METERS;
    const cooldownPassed = !prev || Date.now() - prev.at >= MIN_REFRESH_MS;
    if (!stopsChanged && !(movedFar && cooldownPassed)) return;

    let cancelled = false;
    const points = [rider, ...stops];
    lastFetch.current = { at: Date.now(), rider, stopsKey };
    void fetchRiderRoadRoute(points)
      .then((result) => {
        if (!cancelled) setRoute(result.geometry.length >= 2 ? result : null);
      })
      .catch(() => {
        // เส้นทางถนนล้มเหลวไม่เป็นไร — ปล่อยให้ map ใช้เส้นตรง fallback
        if (!cancelled) {
          setRoute(null);
          lastFetch.current = null;
        }
      });
    return () => {
      cancelled = true;
    };
    // rider.lat/lng ผ่าน dependency ด้านล่างเพื่อ trigger เมื่อขยับ; gating จริงอยู่ในตัว effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rider?.lat, rider?.lng, stopsKey]);

  return route;
}
