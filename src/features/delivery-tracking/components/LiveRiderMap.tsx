import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  fetchLiveRiders,
  fetchRiderTrackingHistory,
  type LiveRiderTracking,
  type RiderTrackingHistory,
} from '@/lib/retailApi';
import { BANGKOK_CENTER } from '@/features/rider/geocode';

const icon = L.divIcon({
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  html: '<div style="width:24px;height:24px;border-radius:50%;background:#16a34a;border:4px solid white;box-shadow:0 1px 6px #0006"></div>',
});
function Focus({ point }: { point?: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView(point, 15);
  }, [map, point]);
  return null;
}

export function LiveRiderMap() {
  const [riders, setRiders] = useState<LiveRiderTracking[]>([]);
  const [selected, setSelected] = useState<RiderTrackingHistory | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      void fetchLiveRiders()
        .then((rows) => {
          if (active) setRiders(rows);
        })
        .catch(() => undefined);
    load();
    const id = window.setInterval(load, 5_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
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
  const focus =
    path[path.length - 1] ??
    (riders.find((r) => r.latest)?.latest
      ? ([
          Number(riders.find((r) => r.latest)!.latest!.lat),
          Number(riders.find((r) => r.latest)!.latest!.lng),
        ] as [number, number])
      : undefined);
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
          {planned.length > 1 && (
            <Polyline
              positions={planned}
              pathOptions={{ color: '#64748b', weight: 3, dashArray: '6 8' }}
            />
          )}
          {path.length > 1 && (
            <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4 }} />
          )}
          <Focus point={focus} />
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
