import { useEffect, useRef, useState } from 'react';
import { fetchMessengerRoadRoute, type MessengerRoadRoute } from '@/lib/retailApi';

type Coords = { lat: number; lng: number };
export type RoadRouteStatus = 'idle' | 'loading' | 'ready' | 'error';

const EARTH_RADIUS_METERS = 6_371_000;
// อย่าเรียก OSRM ถี่เกินไป — รอจน messenger ขยับพอสมควรหรือครบเวลาขั้นต่ำ
const MIN_REFRESH_MS = 12_000;
const MIN_MOVE_METERS = 50;
const RETRY_DELAY_MS = 5_000;
const MAX_AUTO_RETRIES = 2;
// กันสถานะ "กำลังคำนวณ" ค้าง: ถ้า request ไม่จบภายในเวลานี้ (เช่น timer/fetch ถูก throttle
// ตอนสลับแท็บ) ให้ถือว่า fail แล้วลองใหม่ — ยาวกว่า timeout ฝั่ง fetch เล็กน้อย
const LOADING_WATCHDOG_MS = 12_000;

// cache เส้นทางล่าสุดต่อชุดจุดส่ง (module scope จึงอยู่รอดการ unmount/remount ของแผนที่)
// เวลาสลับแท็บล่างแล้วกลับมา แผนที่ remount แต่ยังโชว์ระยะเดิมได้ทันที ไม่ขึ้น "กำลังคำนวณ"
// เปล่า ๆ ระหว่างรอ fetch รอบใหม่ (โดยเฉพาะตอน public OSRM ตอบช้า/ไม่ตอบเป็นบางครั้ง)
const roadRouteCache = new Map<string, MessengerRoadRoute>();

function stopsKeyOf(stops: Coords[]) {
  return stops.map((stop) => `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`).join('|');
}

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
  const stopsKey = stopsKeyOf(stops);
  // seed จาก cache ตอน mount/remount เพื่อโชว์ระยะล่าสุดทันที (refetch จะอัปเดตทีหลัง)
  const seeded = enabled && stops.length > 0 ? (roadRouteCache.get(stopsKey) ?? null) : null;
  const [route, setRoute] = useState<MessengerRoadRoute | null>(seeded);
  const [status, setStatus] = useState<RoadRouteStatus>(seeded ? 'ready' : 'idle');
  const [error, setError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const lastFetch = useRef<{ at: number; messenger: Coords; stopsKey: string } | null>(null);
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  const retryTimer = useRef<number | null>(null);
  const watchdogTimer = useRef<number | null>(null);
  const retryAttempts = useRef(0);
  const activeRouteKey = useRef('');
  const handledRetryTick = useRef(0);
  const statusRef = useRef<RoadRouteStatus>(status);
  statusRef.current = status;

  useEffect(() => {
    // set true ทุกครั้งที่ mount (สำคัญสำหรับ StrictMode dev ที่ unmount/mount ซ้ำ
    // มิฉะนั้น mounted จะค้างเป็น false แล้ว response ทุกตัวจะถูกทิ้ง → loading ค้าง)
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestSeq.current += 1;
      if (retryTimer.current != null) window.clearTimeout(retryTimer.current);
      if (watchdogTimer.current != null) window.clearTimeout(watchdogTimer.current);
    };
  }, []);

  // กลับมาที่แท็บนี้แล้วยังคำนวณไม่เสร็จ — บังคับยิงใหม่ทันที เพราะ request เดิมอาจ
  // ถูก browser throttle ตอน background จน timeout ไม่ทำงาน เลยค้างที่ "กำลังคำนวณ"
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (statusRef.current === 'ready') return;
      lastFetch.current = null; // ปลด gating ระยะ/เวลา ให้ยิงรอบใหม่ได้แน่นอน
      retryAttempts.current = 0;
      setRetryTick((current) => current + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !messenger || stops.length === 0) {
      setRoute(null);
      setStatus('idle');
      setError('');
      lastFetch.current = null;
      requestSeq.current += 1;
      retryAttempts.current = 0;
      activeRouteKey.current = '';
      handledRetryTick.current = retryTick;
      if (retryTimer.current != null) {
        window.clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      if (watchdogTimer.current != null) {
        window.clearTimeout(watchdogTimer.current);
        watchdogTimer.current = null;
      }
      return;
    }

    const prev = lastFetch.current;
    const stopsChanged = !prev || prev.stopsKey !== stopsKey;
    const movedFar = !prev || metersBetween(prev.messenger, messenger) >= MIN_MOVE_METERS;
    const cooldownPassed = !prev || Date.now() - prev.at >= MIN_REFRESH_MS;
    const retryRequested = retryTick !== handledRetryTick.current;
    if (!stopsChanged && !(movedFar && cooldownPassed) && !retryRequested) return;

    const points = [messenger, ...stops];
    const routeKey = `${messenger.lat.toFixed(5)},${messenger.lng.toFixed(5)}|${stopsKey}`;
    if (activeRouteKey.current !== routeKey) {
      activeRouteKey.current = routeKey;
      retryAttempts.current = 0;
    }
    const requestId = requestSeq.current + 1;
    requestSeq.current = requestId;
    handledRetryTick.current = retryTick;
    lastFetch.current = { at: Date.now(), messenger, stopsKey };
    if (retryTimer.current != null) {
      window.clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (watchdogTimer.current != null) window.clearTimeout(watchdogTimer.current);

    const clearWatchdog = () => {
      if (watchdogTimer.current != null) {
        window.clearTimeout(watchdogTimer.current);
        watchdogTimer.current = null;
      }
    };
    const failAndMaybeRetry = (message: string) => {
      setStatus('error');
      setError(message);
      if (retryAttempts.current < MAX_AUTO_RETRIES) {
        retryAttempts.current += 1;
        retryTimer.current = window.setTimeout(() => {
          retryTimer.current = null;
          setRetryTick((current) => current + 1);
        }, RETRY_DELAY_MS);
      }
    };

    // watchdog กัน loading ค้างเมื่อ fetch/timeout ถูก throttle (เช่นตอนสลับแท็บ)
    watchdogTimer.current = window.setTimeout(() => {
      watchdogTimer.current = null;
      if (!mounted.current || requestSeq.current !== requestId) return;
      requestSeq.current += 1; // ทิ้ง response ของ request เดิมที่ค้าง
      failAndMaybeRetry('คำนวณระยะตามถนนใช้เวลานานเกินไป');
    }, LOADING_WATCHDOG_MS);

    setStatus((current) => (current === 'ready' ? current : 'loading'));
    setError('');
    void fetchMessengerRoadRoute(points)
      .then((result) => {
        if (!mounted.current || requestSeq.current !== requestId) return;
        clearWatchdog();
        if (result.geometry.length >= 2 && result.legs.length > 0) {
          roadRouteCache.set(stopsKey, result);
          setRoute(result);
          setStatus('ready');
          retryAttempts.current = 0;
          return;
        }
        failAndMaybeRetry('ไม่พบเส้นทางถนนสำหรับตำแหน่งนี้');
      })
      .catch((reason) => {
        if (!mounted.current || requestSeq.current !== requestId) return;
        clearWatchdog();
        failAndMaybeRetry(reason instanceof Error ? reason.message : 'คำนวณเส้นทางถนนไม่สำเร็จ');
      });
    // messenger.lat/lng ผ่าน dependency ด้านล่างเพื่อ trigger เมื่อขยับ; gating จริงอยู่ในตัว effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, messenger?.lat, messenger?.lng, stopsKey, retryTick]);

  return { route, status, error };
}
