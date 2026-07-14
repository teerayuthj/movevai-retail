import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Loader2, MapPin, Route } from 'lucide-react';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import { BANGKOK_CENTER } from '@/features/messenger/geocode';
import { useRoadRoute } from '@/features/messenger/hooks/useRoadRoute';
import type { RouteStop, RouteStopKind } from '@/features/dispatch/types';
import { formatRouteDistance } from '@/lib/routeDistance';

function stopIcon(order: number, kind: RouteStopKind) {
  const background = kind === 'pickup' ? 'hsl(var(--info))' : 'hsl(var(--success))';
  return L.divIcon({
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${background};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:600 12px/1 sans-serif;">${order}</div>`,
  });
}

/** แก้ Leaflet สูง 0px เมื่อ mount ใน dialog/แผงที่เพิ่งเปิด — invalidate หลัง layout เสร็จ */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 0);
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

// fitBounds ระหว่าง zoom animation จะถูกกลืนเงียบ ๆ — auto-fit ต้อง animate:false เสมอ
function FitStops({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((point) => point.join(',')).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [30, 30], animate: false });
    // จงใจ fit ใหม่เฉพาะตอนชุดพิกัดเปลี่ยนจริง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * แผนที่พรีวิวสายวิ่ง: หมุดเลขลำดับ (น้ำเงิน=รับ เขียว=ส่ง) + เส้นทางตามถนน
 * โชว์เฉพาะจุดที่มีพิกัดแล้ว — จุดที่ geocode ไม่ติดจะนับแจ้งไว้บน overlay
 */
export function RouteStopsMap({ stops, className }: { stops: RouteStop[]; className?: string }) {
  const stopById = useMemo(() => new Map(stops.map((stop) => [stop.id, stop])), [stops]);
  const located = useMemo(
    () =>
      stops
        .map((stop, index) => ({ stop, order: index + 1 }))
        .filter(
          (entry): entry is { stop: RouteStop & { lat: number; lng: number }; order: number } =>
            entry.stop.lat !== undefined && entry.stop.lng !== undefined,
        ),
    [stops],
  );
  const points = useMemo(
    () => located.map((entry) => [entry.stop.lat, entry.stop.lng] as [number, number]),
    [located],
  );
  const roadStops = useMemo(
    () => located.slice(1).map((entry) => ({ lat: entry.stop.lat, lng: entry.stop.lng })),
    [located],
  );
  const origin = located[0] ? { lat: located[0].stop.lat, lng: located[0].stop.lng } : null;
  const { route: roadRoute, status: roadStatus } = useRoadRoute(
    origin,
    roadStops,
    located.length > 1,
  );
  const roadPoints = useMemo(
    () => roadRoute?.geometry.map((point) => [point.lat, point.lng] as [number, number]) ?? [],
    [roadRoute],
  );
  const missing = stops.length - located.length;

  if (located.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground ${className ?? 'h-56'}`}
      >
        <MapPin className="h-5 w-5 opacity-50" />
        ยังไม่มีจุดแวะที่ปักหมุดได้ — ใส่ที่อยู่แล้วกดค้นหาพิกัด
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg border ${className ?? 'h-56'}`}>
      <MapContainer
        center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
        zoom={11}
        scrollWheelZoom={false}
        dragging
        className="h-full w-full"
        style={{ background: 'hsl(var(--muted))' }}
        attributionControl={false}
      >
        <BaseTileLayer />
        <AutoResize />
        <FitStops points={points} />
        {roadPoints.length >= 2 ? (
          <Polyline
            positions={roadPoints}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.86 }}
          />
        ) : points.length > 1 ? (
          <Polyline
            positions={points}
            pathOptions={{ color: '#2563eb', weight: 3, opacity: 0.45, dashArray: '7 7' }}
          />
        ) : null}
        {located.map((entry) => {
          const destination = entry.stop.deliverToStopId
            ? stopById.get(entry.stop.deliverToStopId)
            : undefined;
          const inbound =
            entry.stop.kind === 'dropoff'
              ? stops.filter(
                  (stop) => stop.kind === 'pickup' && stop.deliverToStopId === entry.stop.id,
                )
              : [];
          return (
            <Marker
              key={entry.stop.id}
              position={[entry.stop.lat, entry.stop.lng]}
              icon={stopIcon(entry.order, entry.stop.kind)}
            >
              <Tooltip direction="top" offset={[0, -11]} opacity={0.96}>
                <div className="max-w-56 text-xs">
                  <div className="font-semibold">
                    จุด {entry.order} · {entry.stop.kind === 'pickup' ? 'รับ' : 'ส่ง'} —{' '}
                    {entry.stop.name}
                  </div>
                  {destination && (
                    <div className="mt-0.5 text-blue-700">รับแล้วไปส่ง → {destination.name}</div>
                  )}
                  {inbound.length > 0 && (
                    <div className="mt-0.5 text-emerald-700">
                      ของมาจาก ← {inbound.map((stop) => stop.name).join(', ')}
                    </div>
                  )}
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
      {points.length > 1 && (
        <div className="pointer-events-none absolute right-1.5 top-1.5 z-[500] rounded-md border bg-background/92 px-2 py-1 text-[10px] shadow-xs backdrop-blur-sm">
          {roadStatus === 'ready' && roadRoute?.distanceMeters != null ? (
            <span className="inline-flex items-center gap-1 font-medium text-info">
              <Route className="h-3 w-3" /> ตามถนน {formatRouteDistance(roadRoute.distanceMeters)}
            </span>
          ) : roadStatus === 'loading' ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> กำลังคำนวณเส้นทางถนน…
            </span>
          ) : (
            <span className="text-warning">แสดงลำดับชั่วคราว · รอเส้นทางถนน</span>
          )}
        </div>
      )}
      {missing > 0 && (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-[500] rounded-md border border-warning/30 bg-background/90 px-2 py-1 text-[10px] text-warning shadow-xs">
          {missing} จุดยังไม่มีพิกัด — ไม่แสดงบนแผนที่
        </div>
      )}
    </div>
  );
}
