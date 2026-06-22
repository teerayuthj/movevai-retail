import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endRiderRoute,
  endRiderTestSession,
  sendRiderLocations,
  startRiderRoute,
  startRiderTestRoute,
  type RiderLocationPayload,
} from '@/lib/retailApi';
import { useRiderLocation } from './useRiderLocation';

const QUEUE_KEY = 'movevai:rider-location-queue';
const SESSION_KEY = 'movevai:rider-tracking-session';
const DEVICE_KEY = 'movevai:rider-device-id';
// type ว่าง = session เก่าก่อนมี Test Route → ถือเป็น delivery
type StoredSession = { id: string; type: 'delivery' | 'test'; routeId?: string; label?: string };

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function readQueue(): RiderLocationPayload[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as RiderLocationPayload[];
  } catch {
    return [];
  }
}
function saveQueue(points: RiderLocationPayload[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(points.slice(-1000)));
}

export function useRiderTracking(enabled = true) {
  const [session, setSession] = useState<StoredSession | null>(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem(SESSION_KEY) ?? 'null',
      ) as StoredSession | null;
      return stored ? { ...stored, type: stored.type ?? 'delivery' } : null;
    } catch {
      return null;
    }
  });
  const { location, status, error, retry } = useRiderLocation(enabled && Boolean(session));
  const lastQueued = useRef<{ at: number; lat: number; lng: number } | null>(null);
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (!enabled || !session || flushing.current || !navigator.onLine) return;
    const queue = readQueue();
    if (!queue.length) return;
    flushing.current = true;
    try {
      await sendRiderLocations(session.id, queue.slice(0, 50));
      saveQueue(queue.slice(50));
    } finally {
      flushing.current = false;
    }
  }, [enabled, session]);

  useEffect(() => {
    if (!session || !location) return;
    const last = lastQueued.current;
    const elapsed = last ? location.timestamp - last.at : Infinity;
    const moved = last
      ? Math.hypot(location.lat - last.lat, location.lng - last.lng) * 111_000
      : Infinity;
    if (elapsed < 10_000 && moved < 25) return;
    const point: RiderLocationPayload = {
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
  }, [flush, location, session]);
  useEffect(() => {
    const id = window.setInterval(() => void flush(), 10_000);
    window.addEventListener('online', flush);
    return () => {
      clearInterval(id);
      window.removeEventListener('online', flush);
    };
  }, [flush]);

  return {
    session,
    location,
    status,
    error,
    retry,
    start: async (routeId: string) => {
      const started = await startRiderRoute(routeId, deviceId());
      const value: StoredSession = { id: started.id, type: 'delivery', routeId };
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      setSession(value);
    },
    // Test Route: เริ่มบันทึกเส้นทางโดยไม่ผูกกับงานลูกค้า (ทดสอบ GPS ตอนไปกินข้าว ฯลฯ)
    startTest: async (label?: string) => {
      const started = await startRiderTestRoute(deviceId(), label);
      const value: StoredSession = { id: started.id, type: 'test', label };
      localStorage.setItem(SESSION_KEY, JSON.stringify(value));
      setSession(value);
    },
    end: async (reason?: string) => {
      if (!session) return;
      await flush();
      if (session.type === 'test') await endRiderTestSession(session.id, reason);
      else if (session.routeId) await endRiderRoute(session.routeId, reason);
      localStorage.removeItem(SESSION_KEY);
      setSession(null);
    },
  };
}
