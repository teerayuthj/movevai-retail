import { useEffect, useMemo, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Pause, Play } from 'lucide-react';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import type {
  MessengerDestination,
  MessengerProofLocation,
  MessengerTrackingHistory,
} from '@/lib/retailApi';
import { BANGKOK_CENTER } from '@/features/messenger/geocode';

const icon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:4px solid white;box-shadow:0 1px 6px #0006"></div>',
});

function endpointIcon(label: string, color: string, width = 44) {
  return L.divIcon({
    className: '',
    iconSize: [width, 34],
    iconAnchor: [width / 2, 17],
    popupAnchor: [0, -17],
    html: `<div style="width:${width}px;height:34px;border-radius:999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font:700 11px/1 sans-serif;">${label}</div>`,
  });
}

const actualDeliveryIcon = endpointIcon('ส่งจริง', '#f59e0b', 54);
const plannedDestinationIcon = endpointIcon('ที่อยู่', '#0f766e', 48);
const deliveredDestinationIcon = endpointIcon('ส่งแล้ว', '#64748b', 50);

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function toLatLng(point: { lat: number | string; lng: number | string }) {
  const lat = asNumber(point.lat);
  const lng = asNumber(point.lng);
  return lat != null && lng != null ? ([lat, lng] as [number, number]) : null;
}

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frameId = 0;

    const resizeAndFit = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        // Leaflet reads its size only when it mounts. The detail panel can grow
        // after data has loaded or when the sidebar changes width, so refresh
        // the cached size before fitting the recorded path.
        map.invalidateSize({ animate: false, pan: false });
        if (points.length === 1) map.setView(points[0], 16, { animate: false });
        else if (points.length > 1) {
          map.fitBounds(L.latLngBounds(points), { padding: [24, 24], animate: false });
        }
      });
    };

    resizeAndFit();
    const observer = new ResizeObserver(resizeAndFit);
    observer.observe(container);
    window.addEventListener('resize', resizeAndFit);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener('resize', resizeAndFit);
    };
  }, [map, points]);
  return null;
}

// แผนที่เล่นเส้นทางย้อนหลังของ session ที่จบแล้ว — เส้นวางแผน (ประ) เทียบเส้นจริง (ทึบ)
export function TrackingReplayMap({ session }: { session: MessengerTrackingHistory }) {
  const [index, setIndex] = useState(() => Math.max(0, session.points.length - 1));
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIndex(Math.max(0, session.points.length - 1));
    setPlaying(false);
  }, [session]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () =>
        setIndex((current) => {
          if (current >= session.points.length - 1) {
            setPlaying(false);
            return current;
          }
          return current + 1;
        }),
      400,
    );
    return () => clearInterval(id);
  }, [playing, session]);

  const allPoints = useMemo<[number, number][]>(
    () =>
      session.points
        .map((point) => toLatLng(point))
        .filter((point): point is [number, number] => Boolean(point)),
    [session],
  );
  const path = useMemo(() => allPoints.slice(0, index + 1), [allPoints, index]);
  const planned = useMemo<[number, number][]>(
    () => session.plannedGeometryJson?.map((p) => [p.lat, p.lng]) ?? [],
    [session],
  );
  const destinations = useMemo(
    () =>
      (session.destinations ?? [])
        .map((destination) => ({ destination, point: toLatLng(destination) }))
        .filter((item): item is { destination: MessengerDestination; point: [number, number] } =>
          Boolean(item.point),
        ),
    [session],
  );
  const proofLocations = useMemo(
    () =>
      (session.proofLocations ?? [])
        .map((proof) => ({ proof, point: toLatLng(proof) }))
        .filter((item): item is { proof: MessengerProofLocation; point: [number, number] } =>
          Boolean(item.point),
        ),
    [session],
  );
  const viewportPoints = useMemo(
    () => [
      ...allPoints,
      ...planned,
      ...destinations.map((item) => item.point),
      ...proofLocations.map((item) => item.point),
    ],
    [allPoints, destinations, planned, proofLocations],
  );
  const head = path[path.length - 1];

  if (viewportPoints.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        ยังไม่มีจุด GPS หรือปลายทางใน Route นี้
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <MapContainer
        center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
        zoom={12}
        className="h-80 w-full sm:h-[400px]"
      >
        <BaseTileLayer />
        {planned.length > 1 && (
          <Polyline
            positions={planned}
            pathOptions={{ color: '#93c5fd', weight: 4, opacity: 0.85 }}
          />
        )}
        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: '#1d4ed8', weight: 6, opacity: 1 }} />
        )}
        {destinations.map(({ destination, point }) => {
          const delivered = destination.status === 'delivered';
          return (
            <Marker
              key={`destination-${destination.orderId ?? destination.sequence ?? point.join(',')}`}
              position={point}
              icon={delivered ? deliveredDestinationIcon : plannedDestinationIcon}
            >
              <Popup>
                <div className="space-y-1 text-[13px]">
                  <div className="font-semibold">
                    ปลายทางจากที่อยู่{destination.sequence ? ` #${destination.sequence}` : ''}
                  </div>
                  {destination.label && <div>{destination.label}</div>}
                  {destination.address && (
                    <div className="text-muted-foreground">{destination.address}</div>
                  )}
                  {delivered && <div className="text-muted-foreground">ส่งสำเร็จแล้ว</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {proofLocations.map(({ proof, point }) => (
          <Marker
            key={`proof-${proof.orderId ?? proof.sequence ?? point.join(',')}`}
            position={point}
            icon={actualDeliveryIcon}
          >
            <Popup>
              <div className="space-y-1 text-[13px]">
                <div className="font-semibold">
                  จุดส่งจริงจาก GPS ตอนปิดงาน{proof.sequence ? ` #${proof.sequence}` : ''}
                </div>
                <div className="text-muted-foreground">
                  {proof.label ?? formatDateTime(proof.capturedAt)}
                  {proof.accuracy != null ? ` · ±${Math.round(proof.accuracy)} ม.` : ''}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
        {proofLocations.map(({ proof, point }) => (
          <Circle
            key={`proof-radius-${proof.orderId ?? proof.sequence ?? point.join(',')}`}
            center={point}
            radius={proof.accuracy ?? 80}
            pathOptions={{
              color: '#f59e0b',
              fillColor: '#f59e0b',
              fillOpacity: 0.14,
              weight: 1,
            }}
          />
        ))}
        {head && <Marker position={head} icon={icon} />}
        <FitBounds points={viewportPoints} />
      </MapContainer>
      <div className="flex items-center gap-3 border-t bg-card px-3 py-2 text-xs text-muted-foreground">
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          disabled={session.points.length < 2}
          aria-label={playing ? 'หยุดเล่นเส้นทางย้อนหลัง' : 'เล่นเส้นทางย้อนหลัง'}
          onClick={() => {
            if (index >= session.points.length - 1) setIndex(0);
            setPlaying((value) => !value);
          }}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          )}
          {playing ? 'หยุด' : 'เล่นย้อนหลัง'}
        </button>
        <input
          className="min-w-0 flex-1"
          type="range"
          min={0}
          max={Math.max(0, session.points.length - 1)}
          value={index}
          disabled={session.points.length < 2}
          aria-label="ตำแหน่งการเล่นเส้นทางย้อนหลัง"
          onChange={(event) => {
            setPlaying(false);
            setIndex(Number(event.target.value));
          }}
        />
        <span className="tabular-nums">
          {session.points.length > 0 ? index + 1 : 0}/{session.points.length} จุด
        </span>
        {(destinations.length > 0 || proofLocations.length > 0) && (
          <span className="hidden shrink-0 sm:inline">
            ที่อยู่ {destinations.length} · ส่งจริง {proofLocations.length}
          </span>
        )}
      </div>
    </div>
  );
}
