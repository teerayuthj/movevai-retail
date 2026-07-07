import { useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertCircle, AlertTriangle, Loader2, LocateFixed, Navigation } from 'lucide-react';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import type { Order } from '@/data/orderTypes';
import { getMessengerJobOverdueMinutes } from '../messengerSchedule';
import { BANGKOK_CENTER, isPlausibleThaiCoord, navigationUrl, type LatLng } from '../geocode';
import type { RouteStop } from '../hooks/useRouteStops';
import { useRoadRoute } from '../hooks/useRoadRoute';
import { useOrdersGeo } from '@/features/planning/hooks/useOrdersGeo';
import {
  useMessengerLocation,
  type MessengerLocation,
  type MessengerLocationStatus,
} from '../hooks/useMessengerLocation';

export type MessengerLocationSource = {
  location: MessengerLocation | null;
  status: MessengerLocationStatus;
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

const messengerIcon = L.divIcon({
  className: '',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
  html: '<div style="width:30px;height:30px;border-radius:50%;background:#2563eb;border:4px solid #fff;box-shadow:0 0 0 8px rgba(37,99,235,.2),0 2px 6px rgba(0,0,0,.35);"></div>',
});

type ResolvedRouteStop = RouteStop & {
  coords: LatLng | null;
  coordsSource: 'order' | 'address' | null;
  pending: boolean;
};

/**
 * ปรับ viewport เมื่อจุดส่งเปลี่ยน และเมื่อได้ GPS ครั้งแรกเท่านั้น
 * เพื่อไม่ให้ GPS realtime เขียนทับ zoom/pan ที่ผู้ใช้ปรับเองทุกครั้งที่ตำแหน่งอัปเดต
 */
function FitBounds({
  points,
  messengerPoint,
}: {
  points: [number, number][];
  messengerPoint: [number, number] | null;
}) {
  const map = useMap();
  const previousPointsKey = useRef<string | null>(null);
  const hasFitInitialMessenger = useRef(false);

  useEffect(() => {
    const pointsKey = points.map(([lat, lng]) => `${lat},${lng}`).join('|');
    const deliveryPointsChanged = previousPointsKey.current !== pointsKey;
    const messengerBecameAvailable = messengerPoint != null && !hasFitInitialMessenger.current;

    if (!deliveryPointsChanged && !messengerBecameAvailable) return;

    previousPointsKey.current = pointsKey;
    if (messengerPoint) hasFitInitialMessenger.current = true;

    const viewportPoints = messengerPoint ? [...points, messengerPoint] : points;
    if (viewportPoints.length === 0) return;
    // animate: false — GPS กับพิกัดปลายทาง (geocode) มาถึงไล่เลี่ยกัน ถ้าปล่อยให้
    // คำสั่งแรก zoom แบบ animate คำสั่ง fit ถัดมาจะถูก Leaflet กลืนทิ้ง
    // (zoom animation ของ Leaflet interrupt ไม่ได้) แล้วปลายทางจะค้างอยู่นอกจอ
    if (viewportPoints.length === 1) {
      map.setView(viewportPoints[0], 14, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(viewportPoints), {
      padding: [40, 40],
      maxZoom: 15,
      animate: false,
    });
  }, [map, points, messengerPoint]);
  return null;
}

export function MessengerRouteMap({
  stops,
  nowMs,
  onFocusOrder,
  locationSource,
  showRemainingDistance = false,
}: {
  stops: RouteStop[];
  nowMs: number;
  onFocusOrder?: (order: Order) => void;
  locationSource?: MessengerLocationSource;
  showRemainingDistance?: boolean;
}) {
  // ทุกหน้าใน console ส่ง locationSource ร่วมกัน (tracking session/fallback GPS)
  // อ่าน GPS เองเฉพาะกรณีผู้เรียกไม่ส่ง source มา เพื่อไม่เปิด watchPosition ซ้ำ
  const ownLocation = useMessengerLocation(!locationSource);
  const {
    location: rawLocation,
    status: locationStatus,
    error: locationError,
    retry,
  } = locationSource ?? ownLocation;
  const invalidLocation = rawLocation != null && !isPlausibleThaiCoord(rawLocation);
  const location = invalidLocation ? null : rawLocation;
  const displayedLocationStatus: MessengerLocationStatus = invalidLocation
    ? 'error'
    : locationStatus;
  const displayedLocationError = invalidLocation
    ? 'GPS อยู่นอกพื้นที่ให้บริการในไทย กรุณาตั้ง Location เป็นกรุงเทพฯ'
    : locationError;
  const stopOrders = useMemo(() => stops.map((stop) => stop.order), [stops]);
  const geo = useOrdersGeo(stopOrders);

  const resolvedStops = useMemo<ResolvedRouteStop[]>(
    () =>
      stops.map((stop) => {
        const orderGeo = geo[stop.order.id];
        if (stop.coords) return { ...stop, coordsSource: 'order', pending: false };
        if (orderGeo?.coords && isPlausibleThaiCoord(orderGeo.coords)) {
          return { ...stop, coords: orderGeo.coords, coordsSource: 'address', pending: false };
        }
        return { ...stop, coords: null, coordsSource: null, pending: orderGeo?.pending ?? false };
      }),
    [geo, stops],
  );
  const located = useMemo(() => resolvedStops.filter((stop) => stop.coords), [resolvedStops]);
  const points = useMemo<[number, number][]>(
    () => located.map((stop) => [stop.coords!.lat, stop.coords!.lng]),
    [located],
  );
  const messengerPoint = useMemo<[number, number] | null>(
    () => (location ? [location.lat, location.lng] : null),
    [location],
  );
  const routePoints = useMemo(
    () => (messengerPoint ? [messengerPoint, ...points] : points),
    [points, messengerPoint],
  );
  // ถ้า backend ยังไม่มี customer.geo ให้ลอง geocode address ผ่าน backend เป็น fallback สำหรับหน้า messenger
  const pendingCoordCount = resolvedStops.filter((stop) => !stop.coords && stop.pending).length;
  const missingCoordCount = resolvedStops.filter((stop) => !stop.coords && !stop.pending).length;
  const destination = located[0] ?? null;

  // เส้นทางตามถนน (OSRM) จากตำแหน่ง messenger → จุดส่งที่เหลือ — แทนเส้นตรงเดิม
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
  // ระยะตามถนนจริงไม่ควรเกิน ~4 เท่าของเส้นตรง — ถ้าเกิน แปลว่า OSRM snap จุดผิด
  // (เช่น พิกัดเสียไป snap ถนนคนละทวีป) ให้ fallback ไประยะเส้นตรงแทนเลขที่เพี้ยน
  const roadDistanceTrustworthy =
    roadDistance != null &&
    (straightDistance == null || roadDistance <= straightDistance * 4 + 3_000);
  const remainingDistance = roadDistanceTrustworthy ? roadDistance : straightDistance;
  // การตัดสินว่า "ถึงบริเวณปลายทาง" ยังใช้ระยะเส้นตรง + ความแม่นยำ GPS (ตรงกับ logic ส่งมอบจริง)
  const arrived =
    straightDistance != null &&
    straightDistance <= 200 &&
    location != null &&
    location.accuracy <= 100;
  const arrivalStatus =
    remainingDistance == null
      ? null
      : arrived
        ? 'ถึงบริเวณปลายทางแล้ว'
        : remainingDistance <= 1_000
          ? 'ใกล้ถึงปลายทาง'
          : 'ระยะถึงปลายทาง';
  const roadRouteMessage =
    roadRouteStatus === 'loading'
      ? 'กำลังคำนวณระยะตามถนน'
      : roadRouteStatus === 'error'
        ? 'คำนวณระยะตามถนนไม่ได้'
        : null;
  const showRoadRouteLoading = showRemainingDistance && roadRouteStatus === 'loading';
  const roadRouteLoadingLabel =
    roadGeometry.length >= 2 ? 'กำลังอัปเดตเส้นทางล่าสุด…' : 'กำลังโหลดเส้นทางบนแผนที่…';

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
        {/* key แยกสองเส้น — ไม่งั้น React ใช้ Polyline ตัวเดิมแล้ว setStyle จะ merge
            dashArray ของเส้นประค้างไว้ ทำให้เส้นถนนกลายเป็นเส้นประ */}
        {roadGeometry.length >= 2 ? (
          <Polyline
            key="road-route"
            positions={roadGeometry}
            pathOptions={{ color: 'hsl(var(--info))', weight: 4, opacity: 0.85 }}
          />
        ) : routePoints.length >= 2 ? (
          /* เส้นประตรง = fallback ระหว่างรอ/คำนวณเส้นทางตามถนนไม่ได้ ให้เห็นทิศทางไว้ก่อน */
          <Polyline
            key="straight-fallback"
            positions={routePoints}
            pathOptions={{ color: 'hsl(var(--info))', weight: 3, opacity: 0.7, dashArray: '6 6' }}
          />
        ) : null}
        {location && messengerPoint && (
          <>
            <Circle
              center={messengerPoint}
              radius={location.accuracy}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.12,
                weight: 1,
              }}
            />
            <Marker position={messengerPoint} icon={messengerIcon} zIndexOffset={1000}>
              <Popup>
                <div className="space-y-1 text-[13px]">
                  <div className="font-semibold">ตำแหน่ง Messenger ปัจจุบัน</div>
                  <div>ความแม่นยำประมาณ ±{Math.round(location.accuracy)} เมตร</div>
                </div>
              </Popup>
            </Marker>
          </>
        )}
        {located.map((stop) => {
          const overdue = getMessengerJobOverdueMinutes(stop.order, nowMs) != null;
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
                  {stop.coordsSource === 'address' && (
                    <div className="text-warning">พิกัดจากการแปลงที่อยู่</div>
                  )}
                  <div className="text-muted-foreground">{stop.order.customer.address}</div>
                  {stop.order.note && (
                    <div className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-warning">
                      หมายเหตุ: {stop.order.note}
                    </div>
                  )}
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
        <FitBounds points={points} messengerPoint={messengerPoint} />
      </MapContainer>

      {showRoadRouteLoading && (
        <div className="pointer-events-none absolute inset-x-3 top-14 z-[1000] flex justify-center">
          <div className="flex max-w-[min(22rem,100%)] items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 text-xs font-medium text-foreground shadow-md backdrop-blur">
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info/10 text-info">
              <Loader2 className="h-4 w-4 animate-spin" />
            </span>
            <div className="min-w-0">
              <div>{roadRouteLoadingLabel}</div>
              <div className="truncate text-[10px] font-normal text-muted-foreground">
                {destination
                  ? `ปลายทางถัดไป: ${destination.order.customer.name}`
                  : 'กำลังเตรียมจุดส่ง'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* การติดตามสำเร็จไม่ต้องโชว์ card ทับแผนที่ — แสดงเฉพาะตอน GPS ยังไม่พร้อม/กำลังขอ */}
      {displayedLocationStatus !== 'tracking' && (
        <div className="absolute left-2 top-2 z-[1000] max-w-[calc(100%-1rem)] rounded-lg border bg-background/95 px-2.5 py-2 text-xs shadow-sm backdrop-blur">
          {displayedLocationStatus === 'requesting' ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {locationSource?.remote ? 'กำลังรอ GPS จากเครื่องที่เริ่ม Route…' : 'กำลังขอ GPS…'}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{displayedLocationError || 'GPS ยังไม่พร้อมใช้งาน'}</span>
              </div>
              {(displayedLocationStatus === 'error' || displayedLocationStatus === 'denied') && (
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
      )}

      {destination &&
        (remainingDistance != null || (showRemainingDistance && roadRouteMessage)) && (
          <div className="absolute right-2 top-2 z-[1000] max-w-[56%] rounded-full border bg-background/95 px-3 py-1.5 text-right shadow-sm backdrop-blur">
            {remainingDistance != null ? (
              <>
                <div
                  className={
                    remainingDistance <= 1_000
                      ? 'text-[10px] font-semibold text-success'
                      : 'text-[10px] font-medium text-muted-foreground'
                  }
                >
                  {arrivalStatus}
                </div>
                <div className="text-base font-semibold leading-tight tabular-nums">
                  {formatRemainingDistance(remainingDistance)}
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

      {/* หน้ากำลังส่งแต่ยังไม่มีพิกัดปลายทาง — ต้องบอกสถานะที่มุมบน
          เพราะ pill ล่างสุดโดน bottom sheet ของงานบังจนผู้ใช้ไม่รู้ว่าเกิดอะไรขึ้น */}
      {showRemainingDistance && !destination && stops.length > 0 && (
        <div className="absolute right-2 top-2 z-[1000] max-w-[56%] rounded-full border bg-background/95 px-3 py-1.5 text-right shadow-sm backdrop-blur">
          <div className="flex items-center justify-end gap-1 text-xs font-medium text-muted-foreground">
            {pendingCoordCount > 0 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            )}
            {pendingCoordCount > 0 ? 'กำลังหาพิกัดปลายทาง…' : 'ไม่พบพิกัดปลายทาง'}
          </div>
          <div className="max-w-48 truncate text-[10px] text-muted-foreground">
            {pendingCoordCount > 0
              ? `จากที่อยู่: ${stops[0]?.order.customer.name ?? ''}`
              : 'ใช้ปุ่ม “นำทาง” เปิดแผนที่จากที่อยู่ได้'}
          </div>
        </div>
      )}

      {(pendingCoordCount > 0 || missingCoordCount > 0) && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-[1000] -translate-x-1/2 rounded-full border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-xs">
          {pendingCoordCount > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              กำลังหาพิกัดอีก {pendingCoordCount} จุด…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-warning" />
              {missingCoordCount} จุดหาพิกัดไม่เจอ
            </span>
          )}
        </div>
      )}
    </div>
  );
}
