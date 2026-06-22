import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Pause, Play } from 'lucide-react';
import type { RiderTrackingHistory } from '@/lib/retailApi';
import { BANGKOK_CENTER } from '@/features/rider/geocode';

const icon = L.divIcon({
  className: '',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#2563eb;border:4px solid white;box-shadow:0 1px 6px #0006"></div>',
});

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
export function TrackingReplayMap({ session }: { session: RiderTrackingHistory }) {
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
    () => session.points.map((p) => [Number(p.lat), Number(p.lng)]),
    [session],
  );
  const path = useMemo(() => allPoints.slice(0, index + 1), [allPoints, index]);
  const planned = useMemo<[number, number][]>(
    () => session.plannedGeometryJson?.map((p) => [p.lat, p.lng]) ?? [],
    [session],
  );
  const head = path[path.length - 1];

  if (!session.points.length) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        ยังไม่มีจุด GPS ใน Route นี้
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
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {planned.length > 1 && (
          <Polyline
            positions={planned}
            pathOptions={{ color: '#64748b', weight: 3, dashArray: '6 8' }}
          />
        )}
        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: '#2563eb', weight: 4 }} />
        )}
        {head && <Marker position={head} icon={icon} />}
        <FitBounds points={allPoints} />
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
          {index + 1}/{session.points.length} จุด
        </span>
      </div>
    </div>
  );
}
