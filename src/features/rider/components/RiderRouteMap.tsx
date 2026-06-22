import { useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertCircle, Loader2, LocateFixed, Navigation, Radio } from 'lucide-react';
import type { Order } from '@/data/mock';
import { getRiderJobOverdueMinutes } from '../riderSchedule';
import { BANGKOK_CENTER, navigationUrl } from '../geocode';
import type { RouteStop } from '../hooks/useRouteStops';
import { useRiderLocation } from '../hooks/useRiderLocation';

function numberedIcon(label: number, overdue: boolean) {
  const color = overdue ? 'hsl(var(--destructive))' : 'hsl(var(--info))';
  return L.divIcon({
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:600 13px/1 sans-serif;">${label}</div>`,
  });
}

const riderIcon = L.divIcon({
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#2563eb;border:4px solid #fff;box-shadow:0 0 0 8px rgba(37,99,235,.2),0 2px 6px rgba(0,0,0,.35);"></div>',
});

/** ปรับ zoom/center ให้เห็นทุกหมุดพอดีจอ เมื่อรายการจุดเปลี่ยน */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export function RiderRouteMap({
  stops,
  nowMs,
  onFocusOrder,
}: {
  stops: RouteStop[];
  nowMs: number;
  onFocusOrder?: (order: Order) => void;
}) {
  const { location, status: locationStatus, error: locationError, retry } = useRiderLocation(true);
  const located = useMemo(() => stops.filter((stop) => stop.coords), [stops]);
  const points = useMemo<[number, number][]>(
    () => located.map((stop) => [stop.coords!.lat, stop.coords!.lng]),
    [located],
  );
  const riderPoint = useMemo<[number, number] | null>(
    () => (location ? [location.lat, location.lng] : null),
    [location],
  );
  const routePoints = useMemo(
    () => (riderPoint ? [riderPoint, ...points] : points),
    [points, riderPoint],
  );
  const viewportPoints = useMemo(
    () => (riderPoint ? [...points, riderPoint] : points),
    [points, riderPoint],
  );
  const pendingCount = stops.filter((stop) => stop.pending).length;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: 'hsl(var(--muted))' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routePoints.length >= 2 && (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: 'hsl(var(--info))', weight: 3, opacity: 0.7, dashArray: '6 6' }}
          />
        )}
        {location && riderPoint && (
          <>
            <Circle
              center={riderPoint}
              radius={location.accuracy}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.12,
                weight: 1,
              }}
            />
            <Marker position={riderPoint} icon={riderIcon} zIndexOffset={1000}>
              <Popup>
                <div className="space-y-1 text-[13px]">
                  <div className="font-semibold">ตำแหน่ง Rider ปัจจุบัน</div>
                  <div>ความแม่นยำประมาณ ±{Math.round(location.accuracy)} เมตร</div>
                </div>
              </Popup>
            </Marker>
          </>
        )}
        {located.map((stop) => {
          const overdue = getRiderJobOverdueMinutes(stop.order, nowMs) != null;
          return (
            <Marker
              key={stop.order.id}
              position={[stop.coords!.lat, stop.coords!.lng]}
              icon={numberedIcon(stop.label, overdue)}
              eventHandlers={{ click: () => onFocusOrder?.(stop.order) }}
            >
              <Popup>
                <div className="space-y-1 text-[13px]">
                  <div className="font-semibold">
                    จุดที่ {stop.label} · {stop.order.customer.name}
                  </div>
                  <div className="text-muted-foreground">{stop.order.customer.address}</div>
                  <a
                    href={navigationUrl(stop.order.customer.address, stop.coords)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-info"
                  >
                    <Navigation className="h-3.5 w-3.5" /> นำทาง
                  </a>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <FitBounds points={viewportPoints} />
      </MapContainer>

      <div className="absolute left-2 top-2 z-[1000] max-w-[calc(100%-1rem)] rounded-lg border bg-background/95 px-2.5 py-2 text-xs shadow-sm backdrop-blur">
        {locationStatus === 'tracking' && location ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-info">
              <Radio className="h-3.5 w-3.5" /> GPS realtime ทำงาน
            </div>
            <div className="text-muted-foreground">
              ความแม่นยำ ±{Math.round(location.accuracy)} ม. · ทำงานขณะเปิดหน้านี้
            </div>
          </div>
        ) : locationStatus === 'requesting' ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังขอ GPS…
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{locationError || 'GPS ยังไม่พร้อมใช้งาน'}</span>
            </div>
            {(locationStatus === 'error' || locationStatus === 'denied') && (
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-1 font-medium text-info"
              >
                <LocateFixed className="h-3.5 w-3.5" /> ลองอ่านตำแหน่งอีกครั้ง
              </button>
            )}
          </div>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[1000] -translate-x-1/2 rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-xs">
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            กำลังหาพิกัดอีก {pendingCount} จุด…
          </span>
        </div>
      )}
    </div>
  );
}
