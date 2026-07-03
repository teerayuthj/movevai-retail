import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  fetchDeliveryTrackingOrders,
  fetchLiveMessengers,
  fetchMessengerTrackingHistory,
  type LiveMessengerTracking,
  type MessengerTrackingHistory,
} from '@/lib/retailApi';
import { BANGKOK_CENTER } from '@/features/messenger/geocode';
import { useRouteStops } from '@/features/messenger/hooks/useRouteStops';
import type { Order } from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  Clock3,
  Loader2,
  MapPinned,
  Navigation,
  Radio,
  RefreshCw,
  Route,
} from 'lucide-react';

const icon = L.divIcon({
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#16a34a;border:4px solid white;box-shadow:0 1px 6px #0006"></div>',
});

// หมุดปลายทาง — รูปหยดน้ำสีแดง แยกชัดจากหมุด messenger (วงกลมเขียว); จางลงเมื่อ stop ส่งแล้ว
const destinationIcon = (delivered: boolean) =>
  L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="${
      delivered ? '#94a3b8' : '#dc2626'
    }" stroke="white" stroke-width="2" style="filter:drop-shadow(0 1px 3px #0006)"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white" stroke="none"/></svg>`,
  });
function FitPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
  }, [map, points]);
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

function routeLabel(messenger: Pick<LiveMessengerTracking, 'route' | 'label' | 'sessionType'>) {
  return (
    messenger.route?.code ??
    messenger.label ??
    (messenger.sessionType === 'test' ? 'Test Route' : 'Route')
  );
}

export function LiveMessengerMap() {
  const [messengers, setMessengers] = useState<LiveMessengerTracking[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<MessengerTrackingHistory | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);
  const [feedError, setFeedError] = useState('');
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      // แยก request เพื่อให้ GPS realtime ยังอัปเดตได้ แม้ endpoint รายการงานล้มเหลวชั่วคราว
      void fetchLiveMessengers()
        .then((rows) => {
          if (!active) return;
          setMessengers(rows);
          setFeedError('');
        })
        .catch((error: unknown) => {
          if (!active) return;
          setFeedError(error instanceof Error ? error.message : 'โหลด Live Messenger ไม่สำเร็จ');
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
  const onlineCount = messengers.filter((messenger) =>
    isFresh(messenger.latest?.recordedAt),
  ).length;
  const gpsCount = messengers.filter((messenger) => messenger.latest).length;

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Messenger GPS</h2>
          <p className="text-xs text-muted-foreground">
            เลือกคนขับเพื่อเปิดแผนที่ตำแหน่งปัจจุบันและเส้นทางย้อนหลัง
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={onlineCount > 0 ? 'success' : 'muted'} className="gap-1">
            <Radio className="h-3 w-3" />
            ออนไลน์ {onlineCount.toLocaleString('th-TH')}
          </Badge>
          <Badge variant={gpsCount > 0 ? 'info' : 'muted'} className="gap-1">
            <MapPinned className="h-3 w-3" />
            มี GPS {gpsCount.toLocaleString('th-TH')}
          </Badge>
        </div>
      </div>

      {feedError && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
          {feedError}
        </div>
      )}

      <div className="grid lg:grid-cols-[360px_1fr]">
        <div className="max-h-[420px] overflow-auto border-b lg:border-b-0 lg:border-r">
          {messengers.map((messenger) => (
            <button
              key={messenger.id}
              type="button"
              className={cn(
                'block w-full border-b p-3 text-left text-sm transition-colors hover:bg-muted/50',
                selectedId === messenger.id && 'bg-primary/5',
              )}
              onClick={() => void selectMessenger(messenger.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {messenger.driver.name}
                    {messenger.sessionType === 'test' && (
                      <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                        TEST
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {routeLabel(messenger)}
                  </div>
                </div>
                <Badge
                  variant={
                    isFresh(messenger.latest?.recordedAt)
                      ? 'success'
                      : messenger.latest
                        ? 'info'
                        : 'muted'
                  }
                  className="shrink-0"
                >
                  {isFresh(messenger.latest?.recordedAt)
                    ? 'สด'
                    : messenger.latest
                      ? 'GPS'
                      : 'ไม่มี GPS'}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {formatLastSeen(messenger.latest?.recordedAt)}
                </span>
                {messenger.latest && (
                  <span className="inline-flex items-center gap-1">
                    <Navigation className="h-3 w-3" />±{Math.round(messenger.latest.accuracy)} ม.
                  </span>
                )}
              </div>
            </button>
          ))}
          {!messengers.length && (
            <div className="p-4 text-sm text-muted-foreground">
              ยังไม่มี Messenger ที่กำลังติดตาม
            </div>
          )}
        </div>

        <div className="min-h-80">
          {!selectedMessenger && (
            <div className="flex h-80 flex-col items-center justify-center gap-2 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              <MapPinned className="h-8 w-8" />
              <div className="font-medium text-foreground">เลือก Messenger เพื่อดูตำแหน่ง</div>
              <div className="max-w-md text-xs">
                แผนที่จะไม่เปิดอัตโนมัติ เพื่อให้หน้า tracking เริ่มที่รายการงานก่อน
              </div>
            </div>
          )}

          {selectedMessenger && viewportPoints.length === 0 && (
            <div className="flex h-80 flex-col items-center justify-center gap-3 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
              {loadingHistoryId === selectedMessenger.id ? (
                <Loader2 className="h-7 w-7 animate-spin" />
              ) : (
                <AlertCircle className="h-7 w-7 text-warning" />
              )}
              <div className="font-medium text-foreground">
                {loadingHistoryId === selectedMessenger.id
                  ? 'กำลังโหลดตำแหน่ง'
                  : 'ยังไม่มีตำแหน่ง GPS ของ Messenger นี้'}
              </div>
              <div className="max-w-md text-xs">
                {historyError ||
                  'ให้ Messenger เปิดหน้าแอปไว้และอนุญาต Location แล้วรอระบบอัปเดตอีกครั้ง'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void selectMessenger(selectedMessenger.id)}
              >
                <RefreshCw className="h-4 w-4" />
                โหลดใหม่
              </Button>
            </div>
          )}

          {selectedMessenger && viewportPoints.length > 0 && (
            <>
              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs',
                  currentPoint ? 'bg-muted/20 text-muted-foreground' : 'bg-warning/10 text-warning',
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {currentPoint ? (
                    <Navigation className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {selectedMessenger.latest
                    ? `ตำแหน่งปัจจุบัน ${formatLastSeen(selectedMessenger.latest.recordedAt)}`
                    : historyHead
                      ? 'ไม่มี live GPS ตอนนี้ — ใช้จุดล่าสุดจากประวัติ'
                      : 'ยังไม่มีตำแหน่งปัจจุบัน — แสดงปลายทางของ route ไว้ก่อน'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 bg-background/80"
                  onClick={() => void selectMessenger(selectedMessenger.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  โหลดใหม่
                </Button>
              </div>
              <MapContainer
                center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
                zoom={11}
                className="h-80 w-full"
              >
                <BaseTileLayer />
                {currentPoint && (
                  <Marker icon={icon} position={currentPoint}>
                    <Popup>
                      <b>{selectedMessenger.driver.name}</b>
                      <br />
                      {routeLabel(selectedMessenger)}
                      {selectedMessenger.latest && (
                        <>
                          <br />±{Math.round(selectedMessenger.latest.accuracy)} ม.
                        </>
                      )}
                      <br />
                      {selectedMessenger.latest ? 'ตำแหน่งล่าสุด' : 'จุดล่าสุดจากประวัติ GPS'}
                    </Popup>
                  </Marker>
                )}
                {selectedDestination && selectedDestinationPoint && (
                  <Marker
                    key={`${selectedId}-dest-${selectedDestination.orderId ?? 'current'}`}
                    icon={destinationIcon(selectedDestination.status === 'delivered')}
                    position={selectedDestinationPoint}
                  >
                    <Popup>
                      <b>
                        ปลายทาง
                        {selectedDestination.sequence ? ` #${selectedDestination.sequence}` : ''}
                      </b>
                      <br />
                      {selectedDestination.label ?? 'จุดส่งปัจจุบัน'}
                      {selectedDestination.address && (
                        <>
                          <br />
                          <span style={{ color: '#64748b' }}>{selectedDestination.address}</span>
                        </>
                      )}
                      {selectedDestination.status === 'delivered' && (
                        <>
                          <br />
                          ส่งแล้ว
                        </>
                      )}
                    </Popup>
                  </Marker>
                )}
                {planned.length > 1 && (
                  <Polyline
                    positions={planned}
                    pathOptions={{ color: '#64748b', weight: 3, dashArray: '6 8' }}
                  />
                )}
                {path.length > 1 && (
                  <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4 }} />
                )}
                <FitPoints points={viewportPoints} />
              </MapContainer>
            </>
          )}
        </div>
      </div>
      {selectedMessenger && (
        <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
          {selectedHistory && selectedHistory.points.length > 0 ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => {
                  if (playbackIndex >= selectedHistory.points.length - 1) setPlaybackIndex(0);
                  setPlaying((value) => !value);
                }}
              >
                <Route className="h-4 w-4" />
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
              <span className="shrink-0">
                {selectedHistory.driver.name} · {playbackIndex + 1}/{selectedHistory.points.length}{' '}
                จุด · {(selectedHistory.distanceMeters / 1000).toFixed(1)} กม.
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {loadingHistoryId === selectedMessenger.id && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              <span>{historyError || 'ยังไม่มีเส้นทางย้อนหลังสำหรับ Messenger นี้'}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
