import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertCircle, Loader2, LocateFixed, Navigation, Radio } from 'lucide-react';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import type { Order } from '@/data/mock';
import { getRiderJobOverdueMinutes } from '../riderSchedule';
import { BANGKOK_CENTER, navigationUrl } from '../geocode';
import type { RouteStop } from '../hooks/useRouteStops';
import { useRoadRoute } from '../hooks/useRoadRoute';
import {
  useRiderLocation,
  type RiderLocation,
  type RiderLocationStatus,
} from '../hooks/useRiderLocation';

export type RiderLocationSource = {
  location: RiderLocation | null;
  status: RiderLocationStatus;
  error: string;
  retry: () => void;
  remote?: boolean;
};

const EARTH_RADIUS_METERS = 6_371_000;

function distanceBetweenMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

function formatRemainingDistance(distanceMeters: number) {
  if (distanceMeters >= 1_000) return `${(distanceMeters / 1_000).toFixed(1)} กม.`;
  if (distanceMeters < 10) return '<10 ม.';
  return `${Math.round(distanceMeters / 10) * 10} ม.`;
}

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

/**
 * ปรับ viewport เมื่อจุดส่งเปลี่ยน และเมื่อได้ GPS ครั้งแรกเท่านั้น
 * เพื่อไม่ให้ GPS realtime เขียนทับ zoom/pan ที่ผู้ใช้ปรับเองทุกครั้งที่ตำแหน่งอัปเดต
 */
function FitBounds({
  points,
  riderPoint,
}: {
  points: [number, number][];
  riderPoint: [number, number] | null;
}) {
  const map = useMap();
  const previousPointsKey = useRef<string | null>(null);
  const hasFitInitialRider = useRef(false);

  useEffect(() => {
    const pointsKey = points.map(([lat, lng]) => `${lat},${lng}`).join('|');
    const deliveryPointsChanged = previousPointsKey.current !== pointsKey;
    const riderBecameAvailable = riderPoint != null && !hasFitInitialRider.current;

    if (!deliveryPointsChanged && !riderBecameAvailable) return;

    previousPointsKey.current = pointsKey;
    if (riderPoint) hasFitInitialRider.current = true;

    const viewportPoints = riderPoint ? [...points, riderPoint] : points;
    if (viewportPoints.length === 0) return;
    if (viewportPoints.length === 1) {
      map.setView(viewportPoints[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(viewportPoints), { padding: [40, 40], maxZoom: 15 });
  }, [map, points, riderPoint]);
  return null;
}

export function RiderRouteMap({
  stops,
  nowMs,
  onFocusOrder,
  locationSource,
  showRemainingDistance = false,
}: {
  stops: RouteStop[];
  nowMs: number;
  onFocusOrder?: (order: Order) => void;
  locationSource?: RiderLocationSource;
  showRemainingDistance?: boolean;
}) {
  // หน้าเตรียม Route อ่าน GPS เอง ส่วนหน้ากำลังส่งใช้ stream เดียวกับ tracking
  // เพื่อไม่เปิด watchPosition ซ้ำและให้หมุดตรงกับข้อมูลที่ส่ง backend จริง
  const ownLocation = useRiderLocation(!locationSource);
  const {
    location,
    status: locationStatus,
    error: locationError,
    retry,
  } = locationSource ?? ownLocation;
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
  const pendingCount = stops.filter((stop) => stop.pending).length;
  const destination = located[0] ?? null;

  // เส้นทางตามถนน (OSRM) จากตำแหน่ง rider → จุดส่งที่เหลือ — แทนเส้นตรงเดิม
  const stopCoords = useMemo(() => located.map((stop) => stop.coords!), [located]);
  const {
    route: roadRoute,
    status: roadRouteStatus,
    error: roadRouteError,
  } = useRoadRoute(location, stopCoords, showRemainingDistance && Boolean(location));
  const roadGeometry = useMemo<[number, number][]>(
    () => roadRoute?.geometry.map((point) => [point.lat, point.lng]) ?? [],
    [roadRoute],
  );

  const straightDistance =
    showRemainingDistance && location && destination?.coords
      ? distanceBetweenMeters(location, destination.coords)
      : null;
  // legs[0] = ระยะตามถนนจากตำแหน่งปัจจุบัน → จุดส่งถัดไป
  const roadDistance = showRemainingDistance ? (roadRoute?.legs?.[0] ?? null) : null;
  const remainingDistance = roadDistance;
  // การตัดสินว่า "ถึงบริเวณปลายทาง" ยังใช้ระยะเส้นตรง + ความแม่นยำ GPS (ตรงกับ logic ปิดงานจริง)
  const arrived =
    straightDistance != null &&
    straightDistance <= 200 &&
    location != null &&
    location.accuracy <= 100;
  const arrivalStatus =
    roadDistance == null
      ? null
      : arrived
        ? 'ถึงบริเวณปลายทางแล้ว'
        : roadDistance <= 1_000
          ? 'ใกล้ถึงปลายทาง'
          : 'ระยะถึงปลายทาง';
  const roadRouteMessage =
    roadRouteStatus === 'loading'
      ? 'กำลังคำนวณระยะตามถนน'
      : roadRouteStatus === 'error'
        ? 'คำนวณระยะตามถนนไม่ได้'
        : null;

  return (
    <div className="relative isolate h-full w-full">
      <MapContainer
        center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
        zoom={12}
        scrollWheelZoom
        className="h-full w-full"
        style={{ background: 'hsl(var(--muted))' }}
      >
        <BaseTileLayer />
        {roadGeometry.length >= 2 ? (
          <Polyline
            positions={roadGeometry}
            pathOptions={{ color: 'hsl(var(--info))', weight: 4, opacity: 0.85 }}
          />
        ) : !showRemainingDistance && routePoints.length >= 2 ? (
          <Polyline
            positions={routePoints}
            pathOptions={{ color: 'hsl(var(--info))', weight: 3, opacity: 0.7, dashArray: '6 6' }}
          />
        ) : null}
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
        <FitBounds points={points} riderPoint={riderPoint} />
      </MapContainer>

      <div className="absolute left-2 top-2 z-[1000] max-w-[calc(100%-1rem)] rounded-lg border bg-background/95 px-2.5 py-2 text-xs shadow-sm backdrop-blur">
        {locationStatus === 'tracking' && location ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-medium text-info">
              <Radio className="h-3.5 w-3.5" />
              {locationSource?.remote ? 'ตำแหน่งจากเครื่องที่เริ่ม Route' : 'GPS realtime ทำงาน'}
            </div>
            <div className="text-muted-foreground">
              ความแม่นยำ ±{Math.round(location.accuracy)} ม. ·{' '}
              {locationSource?.remote ? 'อัปเดตจาก backend ทุก 5 วินาที' : 'ทำงานขณะเปิดหน้านี้'}
            </div>
          </div>
        ) : locationStatus === 'requesting' ? (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {locationSource?.remote ? 'กำลังรอ GPS จากเครื่องที่เริ่ม Route…' : 'กำลังขอ GPS…'}
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

      {destination &&
        (remainingDistance != null || (showRemainingDistance && roadRouteMessage)) && (
          <div className="absolute bottom-2 right-2 z-[1000] max-w-[70%] rounded-lg border bg-background/95 px-3 py-2 text-right shadow-sm backdrop-blur">
            {remainingDistance != null ? (
              <>
                <div
                  className={
                    remainingDistance <= 1_000
                      ? 'text-xs font-semibold text-success'
                      : 'text-xs font-medium'
                  }
                >
                  {arrivalStatus}
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatRemainingDistance(remainingDistance)}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">
                  ถึง {destination.order.customer.name} · ระยะตามถนนโดยประมาณ
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground">
                  {roadRouteStatus === 'loading' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  )}
                  {roadRouteMessage}
                </div>
                <div className="max-w-48 truncate text-[10px] text-muted-foreground">
                  {roadRouteStatus === 'error'
                    ? roadRouteError || 'ลองขยับตำแหน่งหรือเปิดใหม่อีกครั้ง'
                    : `ถึง ${destination.order.customer.name}`}
                </div>
              </>
            )}
          </div>
        )}

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
