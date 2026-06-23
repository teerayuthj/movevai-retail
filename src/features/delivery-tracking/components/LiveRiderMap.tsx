import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  fetchDeliveryTrackingOrders,
  fetchLiveRiders,
  fetchRiderTrackingHistory,
  type LiveRiderTracking,
  type RiderTrackingHistory,
} from '@/lib/retailApi';
import { BANGKOK_CENTER } from '@/features/rider/geocode';
import { useRouteStops } from '@/features/rider/hooks/useRouteStops';
import type { Order } from '@/data/mock';

const icon = L.divIcon({
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#16a34a;border:4px solid white;box-shadow:0 1px 6px #0006"></div>',
});

// หมุดปลายทาง — รูปหยดน้ำสีแดง แยกชัดจากหมุด rider (วงกลมเขียว); จางลงเมื่อ stop ส่งแล้ว
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

export function LiveRiderMap() {
  const [riders, setRiders] = useState<LiveRiderTracking[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<RiderTrackingHistory | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      // แยก request เพื่อให้ GPS realtime ยังอัปเดตได้ แม้ endpoint รายการงานล้มเหลวชั่วคราว
      void fetchLiveRiders()
        .then((rows) => {
          if (active) setRiders(rows);
        })
        .catch(() => undefined);
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
  const activeOrderStops = useRouteStops(activeOrders);
  useEffect(() => {
    setPlaybackIndex(selected ? Math.max(0, selected.points.length - 1) : 0);
    setPlaying(false);
  }, [selected]);
  useEffect(() => {
    if (!playing || !selected) return;
    const id = window.setInterval(
      () =>
        setPlaybackIndex((current) => {
          if (current >= selected.points.length - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      400,
    );
    return () => clearInterval(id);
  }, [playing, selected]);
  const path = useMemo<[number, number][]>(
    () =>
      selected?.points.slice(0, playbackIndex + 1).map((p) => [Number(p.lat), Number(p.lng)]) ?? [],
    [playbackIndex, selected],
  );
  const planned = useMemo<[number, number][]>(
    () => selected?.plannedGeometryJson?.map((p) => [p.lat, p.lng]) ?? [],
    [selected],
  );
  const currentDestinations = useMemo(
    () =>
      riders.flatMap((rider) => {
        const fromLiveFeed = currentDestination(rider.destinations ?? []);
        if (fromLiveFeed) return [{ riderId: rider.id, destination: fromLiveFeed }];

        const fromOrder = currentDestination(
          activeOrderStops
            .filter((stop) => stop.order.assignedDriverId === rider.driver.code && stop.coords)
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
        return fromOrder ? [{ riderId: rider.id, destination: fromOrder }] : [];
      }),
    [activeOrderStops, riders],
  );
  const viewportPoints = useMemo<[number, number][]>(() => {
    if (path.length > 0) {
      const selectedDestination = currentDestinations.find(
        (item) => item.riderId === selected?.id,
      )?.destination;
      return selectedDestination
        ? [...path, [Number(selectedDestination.lat), Number(selectedDestination.lng)]]
        : path;
    }
    return [
      ...riders.flatMap((rider) =>
        rider.latest
          ? [[Number(rider.latest.lat), Number(rider.latest.lng)] as [number, number]]
          : [],
      ),
      ...currentDestinations.map(
        ({ destination }) => [Number(destination.lat), Number(destination.lng)] as [number, number],
      ),
    ];
  }, [currentDestinations, path, riders, selected?.id]);
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-semibold">Live Rider Tracking</h2>
          <p className="text-xs text-muted-foreground">
            อัปเดตทุก 5 วินาที · เลือก Rider เพื่อดูเส้นทางย้อนหลัง
          </p>
        </div>
        <span className="text-sm font-medium">
          ออนไลน์{' '}
          {
            riders.filter(
              (r) => r.latest && Date.now() - new Date(r.latest.recordedAt).getTime() < 30_000,
            ).length
          }
        </span>
      </div>
      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="max-h-80 overflow-auto border-b md:border-b-0 md:border-r">
          {riders.map((rider) => (
            <button
              key={rider.id}
              className="block w-full border-b p-3 text-left text-sm hover:bg-muted/50"
              onClick={() => void fetchRiderTrackingHistory(rider.id).then(setSelected)}
            >
              <div className="font-medium">
                {rider.driver.name}
                {rider.sessionType === 'test' && (
                  <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    TEST
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {rider.route?.code ?? rider.label ?? 'Test Route'} ·{' '}
                {rider.latest
                  ? new Date(rider.latest.recordedAt).toLocaleTimeString('th-TH')
                  : 'ยังไม่มี GPS'}
              </div>
            </button>
          ))}
          {!riders.length && (
            <p className="p-4 text-sm text-muted-foreground">ยังไม่มี Route ที่กำลังติดตาม</p>
          )}
        </div>
        <MapContainer
          center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
          zoom={11}
          className="h-80 w-full"
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {riders.flatMap((rider) =>
            rider.latest ? (
              <Marker
                key={rider.id}
                icon={icon}
                position={[Number(rider.latest.lat), Number(rider.latest.lng)]}
                eventHandlers={{
                  click: () => void fetchRiderTrackingHistory(rider.id).then(setSelected),
                }}
              >
                <Popup>
                  <b>{rider.driver.name}</b>
                  <br />
                  {rider.route?.code ?? rider.label ?? 'Test Route'}
                  <br />±{Math.round(rider.latest.accuracy)} ม.
                </Popup>
              </Marker>
            ) : (
              []
            ),
          )}
          {currentDestinations.map(({ riderId, destination: dest }) => {
            const delivered = dest.status === 'delivered';
            return (
              <Marker
                key={`${riderId}-dest-${dest.orderId ?? 'current'}`}
                icon={destinationIcon(delivered)}
                position={[Number(dest.lat), Number(dest.lng)]}
              >
                <Popup>
                  <b>📍 ปลายทาง{dest.sequence ? ` #${dest.sequence}` : ''}</b>
                  <br />
                  {dest.label ?? 'จุดส่งปัจจุบัน'}
                  {dest.address && (
                    <>
                      <br />
                      <span style={{ color: '#64748b' }}>{dest.address}</span>
                    </>
                  )}
                  {delivered && (
                    <>
                      <br />✓ ส่งแล้ว
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
          <FitPoints points={viewportPoints} />
        </MapContainer>
      </div>
      {selected && (
        <div className="flex items-center gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
          <button
            type="button"
            className="font-medium text-foreground"
            onClick={() => {
              if (playbackIndex >= selected.points.length - 1) setPlaybackIndex(0);
              setPlaying((value) => !value);
            }}
          >
            {playing ? 'หยุด' : 'เล่นเส้นทาง'}
          </button>
          <input
            className="min-w-0 flex-1"
            type="range"
            min={0}
            max={Math.max(0, selected.points.length - 1)}
            value={playbackIndex}
            onChange={(event) => {
              setPlaying(false);
              setPlaybackIndex(Number(event.target.value));
            }}
          />
          <span>
            {selected.driver.name} · {playbackIndex + 1}/{selected.points.length} จุด ·{' '}
            {(selected.distanceMeters / 1000).toFixed(1)} กม.
          </span>
        </div>
      )}
    </section>
  );
}
