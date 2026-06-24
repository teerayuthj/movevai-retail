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
import { useMessengerLocation } from './useMessengerLocation';

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
  const lastQueued = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!enabled || !session?.isOwner || flushing.current || !navigator.onLine) return;
    const queue = readQueue();
    if (!queue.length) return;
    flushing.current = true;
    try {
      await sendMessengerLocations(session.id, deviceId(), queue.slice(0, 50));
      saveQueue(queue.slice(50));
    } finally {
      flushing.current = false;
    }
  }, [enabled, session]);

  useEffect(() => {
    if (!session?.isOwner || !ownLocation.location) return;
    const location = ownLocation.location;
    const last = lastQueued.current;
    const elapsed = last ? location.timestamp - last.at : Infinity;
    const moved = last
      ? Math.hypot(location.lat - last.lat, location.lng - last.lng) * 111_000
      : Infinity;
    if (elapsed < 10_000 && moved < 25) return;
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
    void flush();
  }, [flush, ownLocation.location, session]);
  useEffect(() => {
    const id = window.setInterval(() => void flush(), 10_000);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', flush);
    };
  }, [flush]);

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
      setRemoteLocation(
        active.latest
          ? {
              lat: Number(active.latest.lat),
              lng: Number(active.latest.lng),
              accuracy: active.latest.accuracy,
              speed: active.latest.speed ?? null,
              heading: active.latest.heading ?? null,
              timestamp: new Date(active.latest.recordedAt).getTime(),
            }
          : null,
      );
    } catch (reason) {
      setSyncError(reason instanceof Error ? reason.message : 'ซิงก์ Tracking ไม่สำเร็จ');
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
    start: async (routeId: string) => {
      const started = await startMessengerRoute(routeId, deviceId());
      const value: StoredSession = {
        id: started.id,
        type: 'delivery',
        routeId,
        isOwner: started.isOwner ?? true,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      setSession(value);
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
