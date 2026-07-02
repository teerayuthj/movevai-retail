import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endMessengerRoute,
  endMessengerTestSession,
  fetchActiveMessengerTracking,
  sendMessengerLocations,
  startMessengerRoute,
  startMessengerTestRoute,
  type MessengerLocationPayload,
} from '@/lib/retailApi';
import { isPlausibleThaiCoord } from '../geocode';
import { useMessengerLocation, type MessengerLocation } from './useMessengerLocation';

const QUEUE_KEY = 'movevai:messenger-location-queue';
const SESSION_KEY = 'movevai:messenger-tracking-session';
const DEVICE_KEY = 'movevai:messenger-device-id';
// type ว่าง = session เก่าก่อนมี Test Route → ถือเป็น delivery
type StoredSession = {
  id: string;
  type: 'delivery' | 'test';
  routeId?: string;
  label?: string;
  isOwner: boolean;
};

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function readQueue(): MessengerLocationPayload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as MessengerLocationPayload[];
  } catch {
    return [];
  }
}
function saveQueue(points: MessengerLocationPayload[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(points.slice(-1000)));
}

export function useMessengerTracking(enabled = true) {
  const [session, setSession] = useState<StoredSession | null>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(SESSION_KEY) ?? 'null',
      ) as StoredSession | null;
      // Backend ต้องยืนยัน ownership ใหม่ทุกครั้งก่อนเปิด GPS watcher
      return stored ? { ...stored, type: stored.type ?? 'delivery', isOwner: false } : null;
    } catch {
      return null;
    }
  });
  const ownLocation = useMessengerLocation(enabled && Boolean(session?.isOwner));
  const [remoteLocation, setRemoteLocation] =
    useState<ReturnType<typeof useMessengerLocation>['location']>(null);
  const [syncError, setSyncError] = useState('');
  const [activeSessionChecked, setActiveSessionChecked] = useState(false);
  const lastQueued = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const flushing = useRef(false);

  const flushSessionQueue = useCallback(
    async (sessionId: string) => {
      if (!enabled || flushing.current || !navigator.onLine) return;
      const queue = readQueue();
      if (!queue.length) return;
      flushing.current = true;
      try {
        await sendMessengerLocations(sessionId, deviceId(), queue.slice(0, 50));
        saveQueue(queue.slice(50));
      } finally {
        flushing.current = false;
      }
    },
    [enabled],
  );

  const flush = useCallback(async () => {
    if (!session?.isOwner) return;
    await flushSessionQueue(session.id);
  }, [flushSessionQueue, session]);

  const enqueueLocation = useCallback((location: MessengerLocation, force = false) => {
    if (!isPlausibleThaiCoord(location)) return false;
    const last = lastQueued.current;
    const elapsed = last ? location.timestamp - last.at : Infinity;
    const moved = last
      ? Math.hypot(location.lat - last.lat, location.lng - last.lng) * 111_000
      : Infinity;
    if (!force && elapsed < 10_000 && moved < 25) return false;
    const point: MessengerLocationPayload = {
      clientPointId: crypto.randomUUID(),
      lat: location.lat,
      lng: location.lng,
      accuracy: location.accuracy,
      speed: location.speed,
      heading: location.heading,
      recordedAt: new Date(location.timestamp).toISOString(),
    };
    saveQueue([...readQueue(), point]);
    lastQueued.current = { at: location.timestamp, lat: location.lat, lng: location.lng };
    return true;
  }, []);

  const flushQueueForOwner = useCallback(async () => {
    if (!enabled || !session?.isOwner) return;
    const queue = readQueue();
    if (!queue.length) return;
    await flushSessionQueue(session.id);
  }, [enabled, flushSessionQueue, session]);

  useEffect(() => {
    if (!session?.isOwner || !ownLocation.location) return;
    const location = ownLocation.location;
    if (enqueueLocation(location)) void flush();
  }, [enqueueLocation, flush, ownLocation.location, session]);
  useEffect(() => {
    const id = window.setInterval(() => void flushQueueForOwner(), 10_000);
    window.addEventListener('online', flushQueueForOwner);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', flushQueueForOwner);
    };
  }, [flushQueueForOwner]);

  // ทุก Web/PWA restore session จาก backend และตามตำแหน่งล่าสุดของเครื่องเจ้าของ
  const syncActiveSession = useCallback(async () => {
    if (!enabled) return;
    try {
      const active = await fetchActiveMessengerTracking(deviceId());
      setSyncError('');
      if (!active) {
        localStorage.removeItem(SESSION_KEY);
        setSession(null);
        setRemoteLocation(null);
        setActiveSessionChecked(true);
        return;
      }
      const value: StoredSession = {
        id: active.id,
        type: active.sessionType === 'test' ? 'test' : 'delivery',
        routeId: active.routeId ?? undefined,
        label: active.label ?? undefined,
        isOwner: active.isOwner,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      setSession(value);
      const latestLocation = active.latest
        ? {
            lat: Number(active.latest.lat),
            lng: Number(active.latest.lng),
            accuracy: active.latest.accuracy,
            speed: active.latest.speed ?? null,
            heading: active.latest.heading ?? null,
            timestamp: new Date(active.latest.recordedAt).getTime(),
          }
        : null;
      if (latestLocation && !isPlausibleThaiCoord(latestLocation)) {
        setRemoteLocation(null);
        setSyncError('พิกัดล่าสุดอยู่นอกพื้นที่ให้บริการในไทย');
        return;
      }
      setRemoteLocation(latestLocation);
      setActiveSessionChecked(true);
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : 'ซิงก์ Tracking ไม่สำเร็จ');
      setActiveSessionChecked(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void syncActiveSession();
    const id = window.setInterval(() => void syncActiveSession(), 5_000);
    const onFocus = () => void syncActiveSession();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncActiveSession();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, syncActiveSession]);

  const location = session?.isOwner ? ownLocation.location : remoteLocation;
  const status = session?.isOwner
    ? ownLocation.status
    : remoteLocation
      ? 'tracking'
      : session
        ? 'requesting'
        : 'idle';
  const error = session?.isOwner ? ownLocation.error : syncError;

  return {
    session,
    location,
    status,
    error,
    retry: session?.isOwner ? ownLocation.retry : syncActiveSession,
    isOwner: session?.isOwner ?? false,
    activeSessionChecked,
    start: async (routeId: string, initialLocation?: MessengerLocation | null) => {
      const started = await startMessengerRoute(routeId, deviceId());
      const value: StoredSession = {
        id: started.id,
        type: 'delivery',
        routeId,
        isOwner: started.isOwner ?? true,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      setSession(value);
      setActiveSessionChecked(true);
      if (value.isOwner && initialLocation && enqueueLocation(initialLocation, true)) {
        await flushSessionQueue(started.id);
      }
    },
    // Test Route: เริ่มบันทึกเส้นทางโดยไม่ผูกกับงานลูกค้า (ทดสอบ GPS ตอนไปกินข้าว ฯลฯ)
    startTest: async (label?: string) => {
      const started = await startMessengerTestRoute(deviceId(), label);
      const value: StoredSession = {
        id: started.id,
        type: 'test',
        label: started.label ?? label,
        isOwner: started.isOwner ?? true,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      setSession(value);
    },
    end: async (reason?: string) => {
      if (!session) return;
      await flush();
      if (session.type === 'test') await endMessengerTestSession(session.id, reason);
      else if (session.routeId) await endMessengerRoute(session.routeId, reason);
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    },
  };
}
