import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Info, Loader2, MapPin, Route } from 'lucide-react';
import type { Order } from '@/data/mock';
import { BANGKOK_CENTER } from '@/features/rider/geocode';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
import { formatRouteDistance } from '@/lib/routeDistance';
import { useOrdersGeo } from '../hooks/useOrdersGeo';

type PlannedRouteOverlay = {
  /** preview = เส้นทางที่คำนวณก่อน Publish (ยังแตะหมุดปรับกลุ่มได้) */
  preview?: boolean;
  loading?: boolean;
  code?: string;
  driverName?: string;
  distanceMeters?: number | null;
  geometry: { lat: number; lng: number }[];
};

function numberedIcon(label: number, selected: boolean) {
  const color = selected ? 'hsl(var(--primary))' : 'hsl(var(--info))';
  const size = selected ? 34 : 28;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;border:${selected ? 3 : 2}px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:600 ${selected ? 14 : 12}px/1 sans-serif;">${label}</div>`,
  });
}

/** ปรับ zoom/center ให้เห็นทุกหมุดพอดีจอเมื่อรายการจุดเปลี่ยน */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
  }, [map, points]);
  return null;
}

/** แก้ปัญหา Leaflet สูง 0px เมื่อ mount ก่อน layout เสร็จ (อยู่ใน tab/แผงที่เพิ่งสลับ) */
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

/**
 * แผนที่จุดส่งทั้งหมดของวัน (ฝั่ง admin) — ให้เห็นการกระจายปลายทางก่อนจัดกลุ่ม/มอบ Rider
 * แตะหมุดเพื่อเลือก/นำออกจากกลุ่มที่กำลังวางแผน หมุดที่เลือกอยู่จะไฮไลต์สีเด่น
 */
export function PlanningMap({
  orders,
  selectedIds,
  onToggle,
  route,
  emptyLabel = 'เลือก order เพื่อดูปลายทางบนแผนที่',
  selectedLabel = '✓ เลือกอยู่ — แตะเพื่อนำออก',
  unselectedLabel = 'แตะเพื่อเลือกเข้ากลุ่ม',
  lockedLabel,
  routePreviewTitle = 'พรีวิวเส้นทาง (ก่อน Publish)',
}: {
  orders: Order[];
  selectedIds: Set<string>;
  onToggle: (orderId: string) => void;
  route?: PlannedRouteOverlay | null;
  emptyLabel?: string;
  selectedLabel?: string;
  unselectedLabel?: string;
  lockedLabel?: string;
  routePreviewTitle?: string;
}) {
  const geo = useOrdersGeo(orders);
  const routeMode = Boolean(route);
  // โหมด preview ยังให้แตะหมุดเพื่อเพิ่ม/นำจุดออกได้ (ระยะจะคำนวณใหม่ตามที่เลือก)
  const lockedRoute = routeMode && !route?.preview;
  const routePoints = useMemo<[number, number][]>(
    () => route?.geometry.map((point) => [point.lat, point.lng]) ?? [],
    [route],
  );

  const stops = useMemo(
    () =>
      orders
        .map((order, index) => ({ order, label: index + 1, geo: geo[order.id] }))
        .filter((stop) => stop.geo?.coords),
    [orders, geo],
  );
  const points = useMemo<[number, number][]>(
    () => stops.map((stop) => [stop.geo!.coords!.lat, stop.geo!.coords!.lng]),
    [stops],
  );
  const viewportPoints = useMemo<[number, number][]>(
    () => (routePoints.length > 0 ? [...routePoints, ...points] : points),
    [points, routePoints],
  );
  const pendingCount = orders.filter((order) => geo[order.id]?.pending).length;
  const unlocatedCount = orders.length - stops.length - pendingCount;

  if (orders.length === 0 && !route) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-muted/20 text-sm text-muted-foreground">
        <MapPin className="h-7 w-7 opacity-50" />
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[240px] overflow-hidden rounded-xl border">
      <MapContainer
        center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
        zoom={11}
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: 'hsl(var(--muted))' }}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AutoResize />
        {routePoints.length > 1 && (
          <Polyline
            positions={routePoints}
            pathOptions={{
              color: '#2563eb',
              weight: 5,
              // เส้น preview เป็นเส้นประ เพื่อสื่อว่ายังไม่ได้บันทึก/Publish
              dashArray: route?.preview ? '10 8' : undefined,
              opacity: route?.preview ? 0.85 : 1,
            }}
          />
        )}
        {stops.map((stop) => {
          const selected = selectedIds.has(stop.order.id);
          return (
            <Marker
              key={stop.order.id}
              position={[stop.geo!.coords!.lat, stop.geo!.coords!.lng]}
              icon={numberedIcon(stop.label, selected)}
              zIndexOffset={selected ? 1000 : 0}
              eventHandlers={lockedRoute ? undefined : { click: () => onToggle(stop.order.id) }}
            >
              <Popup>
                <div className="space-y-1 text-[13px]">
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {stop.order.code}
                  </div>
                  <div className="font-semibold">{stop.order.customer.name}</div>
                  <div className="text-muted-foreground">{stop.order.customer.address}</div>
                  {stop.order.deliveryPlan?.plannedDate && (
                    <div className="text-muted-foreground">
                      {formatPlanningDate(stop.order.deliveryPlan.plannedDate)}
                      {stop.order.deliveryPlan.plannedTime
                        ? ` · ${stop.order.deliveryPlan.plannedTime} น.`
                        : ''}
                    </div>
                  )}
                  <div className={selected ? 'font-medium text-primary' : 'font-medium text-info'}>
                    {lockedRoute
                      ? (lockedLabel ?? `จุดที่ ${stop.label} ใน Route`)
                      : selected
                        ? selectedLabel
                        : unselectedLabel}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <FitBounds points={viewportPoints} />
      </MapContainer>

      {route && (
        <div className="absolute left-2 top-2 z-[500] max-w-[calc(100%-1rem)] rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
          <div className="flex items-center gap-1.5 font-medium">
            <Route className="h-3.5 w-3.5 text-info" />
            {route.preview ? routePreviewTitle : `${route.code} · ${route.driverName}`}
          </div>
          {route.loading ? (
            <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              กำลังคำนวณระยะตามถนน…
            </div>
          ) : route.distanceMeters != null && route.distanceMeters > 0 ? (
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              ระยะตามถนนประมาณ {formatRouteDistance(route.distanceMeters)}
            </div>
          ) : null}
          <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            เส้นทางถนน ไม่รวมสภาพจราจร
          </div>
        </div>
      )}

      {(pendingCount > 0 || unlocatedCount > 0) && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[500] -translate-x-1/2 rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-xs">
          {pendingCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              กำลังหาพิกัดอีก {pendingCount} จุด…
            </span>
          ) : (
            <span>{unlocatedCount} จุดหาพิกัดไม่เจอ</span>
          )}
        </div>
      )}
    </div>
  );
}
