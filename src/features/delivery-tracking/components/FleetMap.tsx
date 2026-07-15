import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchDeliveryTrackingOrders,
  fetchLiveMessengers,
  fetchMessengerPresences,
  fetchMessengerTrackingHistory,
  type LiveMessengerTracking,
  type MessengerPresence,
  type MessengerTrackingHistory,
} from '@/lib/retailApi';
import { BANGKOK_CENTER } from '@/features/messenger/geocode';
import { useRouteStops } from '@/features/messenger/hooks/useRouteStops';
import type { Order } from '@/data/orderTypes';
import {
  AlertCircle,
  Clock3,
  Loader2,
  MapPinned,
  Navigation,
  Radio,
  RefreshCw,
  Route,
  X,
} from 'lucide-react';

type MessengerMarkerTone = 'live' | 'online' | 'overdue' | 'stale';

// หมุด messenger: เขียว=GPS สด, ฟ้า=เปิดแอป, แดง=เลยกำหนดรับงาน, เทา=ตำแหน่งเก่า
const messengerIcon = (tone: MessengerMarkerTone) =>
  L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${
      tone === 'live'
        ? '#16a34a'
        : tone === 'online'
          ? '#2563eb'
          : tone === 'overdue'
            ? '#dc2626'
            : '#64748b'
    };border:3px solid white;box-shadow:0 1px 6px #0006"></div>`,
  });

// หมุดปลายทาง — รูปหยดน้ำสีแดง แยกชัดจากหมุด messenger; จางลงเมื่อ stop ส่งแล้ว
const destinationIcon = (delivered: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="${
      delivered ? '#94a3b8' : '#dc2626'
    }" stroke="white" stroke-width="2" style="filter:drop-shadow(0 1px 3px #0006)"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white" stroke="none"/></svg>`,
  });

/**
 * ปรับ viewport เฉพาะเมื่อ fitId เปลี่ยน (เปิดครั้งแรก / เลือกคนขับ / focus งาน)
 * ไม่ refit ตาม data ที่ refresh ทุก 5 วิ เพื่อไม่แย่ง user ที่กำลังเลื่อนแผนที่เอง
 * และใช้ animate:false เพราะ fitBounds ระหว่าง zoom animation จะถูกกลืนหาย
 */
function FitBounds({ points, fitId }: { points: [number, number][]; fitId: string }) {
  const map = useMap();
  const lastFitId = useRef<string | null>(null);
  useEffect(() => {
    if (lastFitId.current === fitId || points.length === 0) return;
    lastFitId.current = fitId;
    if (points.length === 1) {
      map.setView(points[0], 15, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [56, 56], maxZoom: 15, animate: false });
  }, [fitId, map, points]);
  return null;
}

function currentDestination<T extends { status?: string | null; sequence?: number }>(items: T[]) {
  return items
    .filter((item) => item.status !== 'delivered')
    .sort(
      (a, b) => (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER),
    )[0];
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toPoint(point: { lat: number | string; lng: number | string } | null | undefined) {
  if (!point) return null;
  const lat = asNumber(point.lat);
  const lng = asNumber(point.lng);
  return lat != null && lng != null ? ([lat, lng] as [number, number]) : null;
}

function isFresh(recordedAt?: string | null) {
  return recordedAt ? Date.now() - new Date(recordedAt).getTime() < 30_000 : false;
}

function isWithin(recordedAt: string | null | undefined, durationMs: number) {
  if (!recordedAt) return false;
  const elapsed = Date.now() - new Date(recordedAt).getTime();
  return elapsed >= 0 && elapsed < durationMs;
}

const isPresenceOnline = (recordedAt?: string | null) => isWithin(recordedAt, 3 * 60_000);
const isPresenceGpsRecent = (recordedAt?: string | null) => isWithin(recordedAt, 5 * 60_000);

function formatLastSeen(recordedAt?: string | null) {
  if (!recordedAt) return 'ยังไม่มี GPS';
  const elapsedMs = Date.now() - new Date(recordedAt).getTime();
  if (elapsedMs < 60_000) return 'เมื่อสักครู่';
  if (elapsedMs < 60 * 60_000) return `${Math.floor(elapsedMs / 60_000)} นาทีที่แล้ว`;
  return new Date(recordedAt).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function locationPermissionLabel(
  permission?: NonNullable<MessengerPresence['presence']>['locationPermission'],
) {
  if (permission === 'denied') return 'ไม่ได้อนุญาต GPS';
  if (permission === 'unavailable') return 'อุปกรณ์ไม่มี GPS';
  if (permission === 'error') return 'อ่าน GPS ไม่สำเร็จ';
  if (permission === 'prompt') return 'ยังไม่อนุญาต GPS';
  return 'ยังไม่มี GPS';
}

function assignmentStageLabel(item: MessengerPresence) {
  if (item.assignment?.acceptOverdue) return 'ยังไม่รับงาน';
  if (item.assignment?.stage === 'awaiting_acceptance') return 'รอรับงาน';
  if (item.assignment?.stage === 'accepted') return 'รับแล้ว · รอเริ่ม';
  if (item.assignment?.stage === 'in_transit') return 'กำลังส่ง';
  if (item.assignment) return 'มอบหมายแล้ว';
  return 'พร้อมรับงาน';
}

function routeLabel(messenger: Pick<LiveMessengerTracking, 'route' | 'label' | 'sessionType'>) {
  return (
    messenger.route?.code ??
    messenger.label ??
    (messenger.sessionType === 'test' ? 'Test Route' : 'Route')
  );
}

type FleetMapProps = {
  /** งานที่เลือกจาก panel รายการ — แผนที่จะ pan ไปหาคนขับ/ปลายทางของงานนั้น */
  focusOrder: Order | null;
};

/**
 * แผนที่ fleet เต็มหน้า (พื้นหลังของหน้า tracking) — แสดงหมุดคนขับทุกคน + ปลายทางปัจจุบัน
 * คลิกหมุดคนขับเพื่อโหลดเส้นทางย้อนหลัง + playback; render เป็น absolute overlay
 * ภายใน container relative ของหน้าแม่
 */
export function FleetMap({ focusOrder }: FleetMapProps) {
  const [messengers, setMessengers] = useState<LiveMessengerTracking[]>([]);
  const [presences, setPresences] = useState<MessengerPresence[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<MessengerTrackingHistory | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);
  const [trackingFeedError, setTrackingFeedError] = useState('');
  const [presenceFeedError, setPresenceFeedError] = useState('');
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focusPoint, setFocusPoint] = useState<[number, number] | null>(null);
  const lastFocusedOrderId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      // แยก request เพื่อให้ GPS realtime ยังอัปเดตได้ แม้ endpoint รายการงานล้มเหลวชั่วคราว
      void fetchLiveMessengers()
        .then((rows) => {
          if (!active) return;
          setMessengers(rows);
          setTrackingFeedError('');
        })
        .catch((error: unknown) => {
          if (!active) return;
          setTrackingFeedError(
            error instanceof Error ? error.message : 'โหลด Live Messenger ไม่สำเร็จ',
          );
        });
      void fetchMessengerPresences()
        .then((rows) => {
          if (!active) return;
          setPresences(rows);
          setPresenceFeedError('');
        })
        .catch((error: unknown) => {
          if (!active) return;
          setPresenceFeedError(
            error instanceof Error ? error.message : 'โหลดสถานะ Messenger ไม่สำเร็จ',
          );
        });
      void fetchDeliveryTrackingOrders({ tab: 'in_transit', take: 100, skip: 0 })
        .then((result) => {
          if (active) setActiveOrders(result.orders);
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 5_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (selectedId && !messengers.some((messenger) => messenger.id === selectedId)) {
      setSelectedId(null);
      setSelectedHistory(null);
      setHistoryError('');
      setPlaying(false);
    }
  }, [messengers, selectedId]);

  const activeOrderStops = useRouteStops(activeOrders);

  useEffect(() => {
    setPlaybackIndex(selectedHistory ? Math.max(0, selectedHistory.points.length - 1) : 0);
    setPlaying(false);
  }, [selectedHistory]);

  useEffect(() => {
    if (!playing || !selectedHistory) return;
    const id = window.setInterval(
      () =>
        setPlaybackIndex((current) => {
          if (current >= selectedHistory.points.length - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      400,
    );
    return () => clearInterval(id);
  }, [playing, selectedHistory]);

  async function selectMessenger(messengerId: string) {
    setSelectedId(messengerId);
    setHistoryError('');
    setLoadingHistoryId(messengerId);
    try {
      const history = await fetchMessengerTrackingHistory(messengerId);
      setSelectedHistory(history);
    } catch (error) {
      setSelectedHistory(null);
      setHistoryError(error instanceof Error ? error.message : 'โหลดประวัติ GPS ไม่สำเร็จ');
    } finally {
      setLoadingHistoryId((current) => (current === messengerId ? null : current));
    }
  }

  function clearSelection() {
    setSelectedId(null);
    setSelectedHistory(null);
    setHistoryError('');
    setPlaying(false);
  }

  const path = useMemo<[number, number][]>(
    () =>
      selectedHistory?.points
        .slice(0, playbackIndex + 1)
        .map(toPoint)
        .filter((point): point is [number, number] => Boolean(point)) ?? [],
    [playbackIndex, selectedHistory],
  );
  const planned = useMemo<[number, number][]>(
    () => selectedHistory?.plannedGeometryJson?.map((p) => [p.lat, p.lng]) ?? [],
    [selectedHistory],
  );
  const currentDestinations = useMemo(
    () =>
      messengers.flatMap((messenger) => {
        const fromLiveFeed = currentDestination(messenger.destinations ?? []);
        if (fromLiveFeed) return [{ messengerId: messenger.id, destination: fromLiveFeed }];

        const fromOrder = currentDestination(
          activeOrderStops
            .filter(
              (stop) =>
                stop.coords &&
                (stop.order.assignedDriverId === messenger.driver.code ||
                  stop.order.deliveryRoute?.id === messenger.routeId),
            )
            .map((stop) => ({
              orderId: stop.order.id,
              label: stop.order.customer.name,
              address: stop.order.customer.address,
              lat: stop.coords!.lat,
              lng: stop.coords!.lng,
              status: stop.order.status,
              sequence: stop.order.deliveryRoute?.sequence,
            })),
        );
        return fromOrder ? [{ messengerId: messenger.id, destination: fromOrder }] : [];
      }),
    [activeOrderStops, messengers],
  );
  const selectedMessenger = useMemo(
    () => messengers.find((messenger) => messenger.id === selectedId) ?? null,
    [messengers, selectedId],
  );
  const selectedDestination = useMemo(
    () => currentDestinations.find((item) => item.messengerId === selectedId)?.destination ?? null,
    [currentDestinations, selectedId],
  );
  const livePoint = toPoint(selectedMessenger?.latest);
  const historyHead = path[path.length - 1] ?? null;
  const currentPoint = livePoint ?? historyHead;
  const selectedDestinationPoint = toPoint(selectedDestination);
  const viewportPoints = useMemo<[number, number][]>(() => {
    if (!selectedMessenger) return [];
    return [
      ...path,
      ...(currentPoint ? [currentPoint] : []),
      ...(selectedDestinationPoint ? [selectedDestinationPoint] : []),
    ];
  }, [currentPoint, path, selectedDestinationPoint, selectedMessenger]);

  // เลือกงานจาก panel → หาคนขับที่ถือ route นั้นแล้วเปิดตาม / ถ้าไม่มี GPS ให้ pan ไปพิกัดปลายทางแทน
  useEffect(() => {
    if (!focusOrder) {
      lastFocusedOrderId.current = null;
      setFocusPoint(null);
      return;
    }
    if (lastFocusedOrderId.current === focusOrder.id) return;
    const messenger = messengers.find(
      (item) =>
        (focusOrder.deliveryRoute && item.routeId === focusOrder.deliveryRoute.id) ||
        (focusOrder.assignedDriverId && item.driver.code === focusOrder.assignedDriverId),
    );
    if (messenger) {
      lastFocusedOrderId.current = focusOrder.id;
      setFocusPoint(null);
      if (messenger.id !== selectedId) void selectMessenger(messenger.id);
      return;
    }
    const presence = presences.find(
      (item) => focusOrder.assignedDriverId && item.driver.code === focusOrder.assignedDriverId,
    );
    const presencePoint = toPoint(presence?.presence?.location);
    if (presencePoint) {
      lastFocusedOrderId.current = focusOrder.id;
      setFocusPoint(presencePoint);
      return;
    }
    const stop = activeOrderStops.find((item) => item.order.id === focusOrder.id && item.coords);
    if (stop?.coords) {
      lastFocusedOrderId.current = focusOrder.id;
      setFocusPoint([stop.coords.lat, stop.coords.lng]);
    }
  }, [activeOrderStops, focusOrder, messengers, presences, selectedId]);

  const presenceOnlyMarkers = useMemo(
    () =>
      presences.filter(
        (item) =>
          item.presence?.location &&
          !messengers.some(
            (messenger) => messenger.driver.code === item.driver.code && messenger.latest,
          ),
      ),
    [messengers, presences],
  );

  const allPoints = useMemo<[number, number][]>(
    () => [
      ...messengers
        .map((messenger) => toPoint(messenger.latest))
        .filter((point): point is [number, number] => Boolean(point)),
      ...presenceOnlyMarkers
        .map((item) => toPoint(item.presence?.location))
        .filter((point): point is [number, number] => Boolean(point)),
      ...currentDestinations
        .map((item) => toPoint(item.destination))
        .filter((point): point is [number, number] => Boolean(point)),
    ],
    [currentDestinations, messengers, presenceOnlyMarkers],
  );

  const fitPoints = selectedMessenger ? viewportPoints : focusPoint ? [focusPoint] : allPoints;
  const fitId = selectedMessenger
    ? `sel:${selectedMessenger.id}:${selectedHistory && selectedHistory.points.length > 0 ? 'history' : 'live'}`
    : focusPoint
      ? `focus:${focusPoint[0]},${focusPoint[1]}`
      : 'all';

  const onlineDriverCodes = new Set([
    ...presences
      .filter((item) => isPresenceOnline(item.presence?.lastHeartbeatAt))
      .map((item) => item.driver.code),
    ...messengers
      .filter((item) => isFresh(item.latest?.recordedAt))
      .map((item) => item.driver.code),
  ]);
  const gpsDriverCodes = new Set([
    ...presences
      .filter((item) => isPresenceGpsRecent(item.presence?.location?.recordedAt))
      .map((item) => item.driver.code),
    ...messengers
      .filter((item) => isFresh(item.latest?.recordedAt))
      .map((item) => item.driver.code),
  ]);
  const onlineCount = onlineDriverCodes.size;
  const gpsCount = gpsDriverCodes.size;
  const staleGpsCount = presences.filter(
    (item) => item.presence?.location && !isPresenceGpsRecent(item.presence.location.recordedAt),
  ).length;
  const overdueAcceptanceCount = presences.filter((item) => item.assignment?.acceptOverdue).length;
  const fleetStatusPresences = presences
    .filter((item) => item.assignment || isPresenceOnline(item.presence?.lastHeartbeatAt))
    .sort((a, b) => {
      if (a.assignment?.acceptOverdue !== b.assignment?.acceptOverdue) {
        return a.assignment?.acceptOverdue ? -1 : 1;
      }
      const aOnline = isPresenceOnline(a.presence?.lastHeartbeatAt);
      const bOnline = isPresenceOnline(b.presence?.lastHeartbeatAt);
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return a.driver.name.localeCompare(b.driver.name, 'th');
    });
  const isLoadingSelected = !!selectedMessenger && loadingHistoryId === selectedMessenger.id;
  const feedError = trackingFeedError || presenceFeedError;

  return (
    <>
      {/* z-0 สร้าง stacking context ครอบ z-index ภายในของ Leaflet ไม่ให้ทะลุมาทับ overlay */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
          zoom={11}
          className="h-full w-full"
          zoomControl={false}
        >
          <BaseTileLayer />
          {messengers.map((messenger) => {
            const point = toPoint(messenger.latest);
            if (!point) return null;
            const presence = presences.find((item) => item.driver.code === messenger.driver.code);
            return (
              <Marker
                key={messenger.id}
                icon={messengerIcon(isFresh(messenger.latest?.recordedAt) ? 'live' : 'stale')}
                position={point}
                eventHandlers={{ click: () => void selectMessenger(messenger.id) }}
              >
                <Popup>
                  <b>{messenger.driver.name}</b>
                  {messenger.sessionType === 'test' && ' (TEST)'}
                  <br />
                  {routeLabel(messenger)}
                  <br />
                  {formatLastSeen(messenger.latest?.recordedAt)}
                  {messenger.latest && <> · ±{Math.round(messenger.latest.accuracy)} ม.</>}
                  {presence && (
                    <>
                      <br />
                      {isPresenceOnline(presence.presence?.lastHeartbeatAt)
                        ? `ออนไลน์ ${presence.presence?.activeDeviceCount ?? 0} เครื่อง`
                        : `ติดต่อระบบ ${formatLastSeen(presence.presence?.lastHeartbeatAt)}`}
                      {' · '}Tracking เปิด
                      <br />
                      {assignmentStageLabel(presence)}
                      {presence.assignment && ` · ${presence.assignment.code}`}
                    </>
                  )}
                </Popup>
              </Marker>
            );
          })}
          {presenceOnlyMarkers.map((item) => {
            const point = toPoint(item.presence?.location);
            if (!point || !item.presence) return null;
            const online = isPresenceOnline(item.presence.lastHeartbeatAt);
            const gpsRecent = isPresenceGpsRecent(item.presence.location?.recordedAt);
            const tone: MessengerMarkerTone = item.assignment?.acceptOverdue
              ? 'overdue'
              : online && gpsRecent
                ? 'online'
                : 'stale';
            return (
              <Marker
                key={`presence-${item.driver.code}`}
                icon={messengerIcon(tone)}
                position={point}
              >
                <Popup>
                  <b>{item.driver.name}</b>
                  <br />
                  {online ? 'เปิดแอปอยู่' : 'ออฟไลน์'} · GPS{' '}
                  {formatLastSeen(item.presence.location?.recordedAt)}
                  {item.presence.location?.accuracy != null && (
                    <> · ±{Math.round(item.presence.location.accuracy)} ม.</>
                  )}
                  <br />
                  ติดต่อระบบ {formatLastSeen(item.presence.lastHeartbeatAt)}
                  {' · '}
                  {item.presence.activeDeviceCount} เครื่อง
                  {item.assignment && (
                    <>
                      <br />
                      {item.assignment.code} · {item.assignment.openStopCount} งาน
                      {item.assignment.acceptOverdue && (
                        <span style={{ color: '#dc2626' }}> · เลยกำหนดรับงาน</span>
                      )}
                    </>
                  )}
                  <br />
                  {assignmentStageLabel(item)} · Tracking {item.tracking.active ? 'เปิด' : 'ปิด'}
                </Popup>
              </Marker>
            );
          })}
          {currentDestinations.map(({ messengerId, destination }) => {
            const point = toPoint(destination);
            if (!point) return null;
            return (
              <Marker
                key={`dest-${messengerId}-${destination.orderId ?? 'current'}`}
                icon={destinationIcon(destination.status === 'delivered')}
                position={point}
              >
                <Popup>
                  <b>ปลายทาง{destination.sequence ? ` #${destination.sequence}` : ''}</b>
                  <br />
                  {destination.label ?? 'จุดส่งปัจจุบัน'}
                  {destination.address && (
                    <>
                      <br />
                      <span style={{ color: '#64748b' }}>{destination.address}</span>
                    </>
                  )}
                </Popup>
              </Marker>
            );
          })}
          {planned.length > 1 && (
            <Polyline
              positions={planned}
              pathOptions={{ color: '#64748b', weight: 3, dashArray: '6 8' }}
            />
          )}
          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4 }} />
          )}
          <FitBounds points={fitPoints} fitId={fitId} />
        </MapContainer>
      </div>

      {feedError && (
        <div className="absolute left-1/2 top-16 z-10 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm backdrop-blur">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {feedError}
        </div>
      )}

      {!selectedMessenger && fleetStatusPresences.length > 0 && (
        <div className="absolute bottom-12 right-3 z-10 w-[min(340px,calc(100vw-1.5rem))] space-y-1.5 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur">
          <div className="flex items-center justify-between px-1 pb-0.5 text-[11px] font-medium">
            <span>สถานะ Messenger</span>
            <span className="text-muted-foreground">อัปเดตทุก 5 วินาที</span>
          </div>
          {fleetStatusPresences.slice(0, 4).map((item) => {
            const online = isPresenceOnline(item.presence?.lastHeartbeatAt);
            const hasGps = isPresenceGpsRecent(item.presence?.location?.recordedAt);
            return (
              <div
                key={item.driver.code}
                className="flex items-start justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-400'}`}
                    />
                    <span className="truncate font-medium">{item.driver.name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {online
                      ? `ออนไลน์ ${item.presence?.activeDeviceCount ?? 0} เครื่อง`
                      : `ออฟไลน์ · ${formatLastSeen(item.presence?.lastHeartbeatAt)}`}
                    {' · '}
                    {hasGps
                      ? `GPS ${formatLastSeen(item.presence?.location?.recordedAt)}`
                      : locationPermissionLabel(item.presence?.locationPermission)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {item.assignment?.code ?? 'ไม่มี Route'} · Tracking{' '}
                    {item.tracking.active ? 'เปิด' : 'ปิด'}
                  </div>
                </div>
                <Badge
                  variant={
                    item.assignment?.acceptOverdue
                      ? 'destructive'
                      : item.assignment?.stage === 'in_transit'
                        ? 'success'
                        : item.assignment
                          ? 'warning'
                          : 'muted'
                  }
                  className="h-5 shrink-0 px-1.5 text-[10px]"
                >
                  {assignmentStageLabel(item)}
                </Badge>
              </div>
            );
          })}
          {fleetStatusPresences.length > 4 && (
            <div className="px-2 text-[10px] text-muted-foreground">
              และอีก {fleetStatusPresences.length - 4} คน
            </div>
          )}
        </div>
      )}

      {!selectedMessenger && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
          <Badge variant={onlineCount > 0 ? 'success' : 'muted'} className="gap-1 shadow-sm">
            <Radio className="h-3 w-3" />
            ออนไลน์ {onlineCount.toLocaleString('th-TH')}
          </Badge>
          <Badge variant={gpsCount > 0 ? 'info' : 'muted'} className="gap-1 shadow-sm">
            <MapPinned className="h-3 w-3" />
            GPS ล่าสุด {gpsCount.toLocaleString('th-TH')}
          </Badge>
          {staleGpsCount > 0 && (
            <Badge variant="muted" className="gap-1 shadow-sm">
              <Clock3 className="h-3 w-3" />
              ตำแหน่งเก่า {staleGpsCount.toLocaleString('th-TH')}
            </Badge>
          )}
          {overdueAcceptanceCount > 0 && (
            <Badge variant="destructive" className="gap-1 shadow-sm">
              <AlertCircle className="h-3 w-3" />
              เลยกำหนดรับ {overdueAcceptanceCount.toLocaleString('th-TH')}
            </Badge>
          )}
        </div>
      )}

      {selectedMessenger && (
        <div className="absolute bottom-3 left-1/2 z-10 w-[min(460px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <span className="truncate">{selectedMessenger.driver.name}</span>
                {selectedMessenger.sessionType === 'test' && (
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-muted-foreground">
                    TEST
                  </span>
                )}
                <Badge
                  variant={
                    isFresh(selectedMessenger.latest?.recordedAt)
                      ? 'success'
                      : selectedMessenger.latest
                        ? 'info'
                        : 'muted'
                  }
                  className="h-5 px-1.5 text-[10px]"
                >
                  {isFresh(selectedMessenger.latest?.recordedAt)
                    ? 'สด'
                    : selectedMessenger.latest
                      ? 'GPS'
                      : 'ไม่มี GPS'}
                </Badge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{routeLabel(selectedMessenger)}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {formatLastSeen(selectedMessenger.latest?.recordedAt)}
                </span>
                {selectedMessenger.latest && (
                  <span className="inline-flex items-center gap-1">
                    <Navigation className="h-3 w-3" />±
                    {Math.round(selectedMessenger.latest.accuracy)} ม.
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void selectMessenger(selectedMessenger.id)}
                aria-label="โหลดตำแหน่งใหม่"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={clearSelection}
                aria-label="ปิดเส้นทางคนขับ"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {selectedHistory && selectedHistory.points.length > 0 ? (
            <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0"
                onClick={() => {
                  if (playbackIndex >= selectedHistory.points.length - 1) setPlaybackIndex(0);
                  setPlaying((value) => !value);
                }}
              >
                <Route className="h-3.5 w-3.5" />
                {playing ? 'หยุด' : 'เล่นเส้นทาง'}
              </Button>
              <input
                className="min-w-0 flex-1"
                type="range"
                min={0}
                max={Math.max(0, selectedHistory.points.length - 1)}
                value={playbackIndex}
                onChange={(event) => {
                  setPlaying(false);
                  setPlaybackIndex(Number(event.target.value));
                }}
              />
              <span className="shrink-0 tabular-nums">
                {playbackIndex + 1}/{selectedHistory.points.length} ·{' '}
                {(selectedHistory.distanceMeters / 1000).toFixed(1)} กม.
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 border-t pt-2 text-[11px] text-muted-foreground">
              {isLoadingSelected ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  กำลังโหลดเส้นทางย้อนหลัง
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-warning" />
                  {historyError || 'ยังไม่มีเส้นทางย้อนหลังสำหรับ Messenger นี้'}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
