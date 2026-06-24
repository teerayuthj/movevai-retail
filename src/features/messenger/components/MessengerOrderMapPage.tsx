import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, AlertCircle, Loader2, MapPin, PackageCheck } from 'lucide-react';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Order } from '@/data/mock';
import { fetchMessengerOrderRouteHistory, type MessengerOrderRouteHistory } from '@/lib/retailApi';
import { BANGKOK_CENTER } from '../geocode';
import { useRouteStops } from '../hooks/useRouteStops';

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

function endpointIcon(label: string, color: string, width = 40) {
  return L.divIcon({
    className: '',
    iconSize: [width, 34],
    iconAnchor: [width / 2, 17],
    popupAnchor: [0, -17],
    html: `<div style="width:${width}px;height:34px;border-radius:999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font:700 11px/1 sans-serif;">${label}</div>`,
  });
}

const startIcon = endpointIcon('เริ่ม', '#2563eb', 44);
const endIcon = endpointIcon('จบ', '#16a34a', 36);
const actualDeliveryIcon = endpointIcon('ส่งจริง', '#f59e0b', 54);
const plannedDestinationIcon = endpointIcon('ที่อยู่', '#0f766e', 48);

function FitRouteBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fittedKey = useRef<string | null>(null);

  useEffect(() => {
    const key = points.map(([lat, lng]) => `${lat},${lng}`).join('|');
    if (!key || fittedKey.current === key) return;
    fittedKey.current = key;

    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 17 });
  }, [map, points]);

  return null;
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

function formatDistance(distance?: number | null) {
  if (distance == null) return '—';
  if (distance >= 1_000) return `${(distance / 1_000).toFixed(1)} กม.`;
  return `${Math.round(distance)} ม.`;
}

export function MessengerOrderMapPage({
  order,
  orderId,
  onBack,
}: {
  order: Order | null;
  orderId: string;
  onBack: () => void;
}) {
  const [history, setHistory] = useState<MessengerOrderRouteHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stopOrders = useMemo(() => (order ? [order] : []), [order]);
  const stops = useRouteStops(stopOrders);
  const destination = useMemo<[number, number] | null>(() => {
    const coords = stops[0]?.coords;
    return coords ? [coords.lat, coords.lng] : null;
  }, [stops]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchMessengerOrderRouteHistory(orderId)
      .then((result) => {
        if (!cancelled) setHistory(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดเส้นทางไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const actualPoints = useMemo<[number, number][]>(
    () =>
      history?.session?.points
        .map((point) => toLatLng(point))
        .filter((point): point is [number, number] => Boolean(point)) ?? [],
    [history],
  );

  // เส้นทางที่ snap เกาะถนนแล้ว (จาก OSRM map matching) — ใช้เป็นเส้นหลักให้ "เกาะ street"
  // ถ้า match ไม่ได้ ค่อย fallback ไปวาดจุด GPS ดิบ
  const matchedPoints = useMemo<[number, number][]>(
    () =>
      (history?.matchedGeometryJson ?? [])
        .map((point) => toLatLng(point))
        .filter((point): point is [number, number] => Boolean(point)),
    [history],
  );
  const ridePath = matchedPoints.length >= 2 ? matchedPoints : actualPoints;

  const plannedPoints = useMemo<[number, number][]>(
    () =>
      (history?.session?.plannedGeometryJson ?? history?.route?.plannedGeometryJson ?? [])
        .map((point) => toLatLng(point))
        .filter((point): point is [number, number] => Boolean(point)),
    [history],
  );

  const proofPoint = useMemo(
    () => (history?.proofLocation ? toLatLng(history.proofLocation) : null),
    [history],
  );

  const fitPoints = useMemo(
    () => [
      ...ridePath,
      ...plannedPoints,
      ...(destination ? [destination] : []),
      ...(proofPoint ? [proofPoint] : []),
    ],
    [ridePath, destination, plannedPoints, proofPoint],
  );

  const firstPoint = ridePath[0] ?? null;
  const lastPoint = ridePath[ridePath.length - 1] ?? null;
  const displayCode = order?.code ?? history?.order.code ?? orderId;
  const displayRoute = order?.deliveryRoute?.code ?? history?.route?.code;

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <header className="z-10 flex shrink-0 items-center gap-2 border-b bg-background px-3 py-2 pt-safe">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onBack}
          aria-label="กลับ"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{displayCode}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {displayRoute ? `${displayRoute} · ` : ''}
            {order?.customer.name ?? 'เส้นทางส่งของ'}
          </div>
        </div>
        <Badge variant="warning" className="shrink-0 gap-1">
          <PackageCheck className="h-3 w-3" />
          รอตรวจสอบ
        </Badge>
      </header>

      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={[BANGKOK_CENTER.lat, BANGKOK_CENTER.lng]}
          zoom={12}
          scrollWheelZoom
          className="h-full w-full"
          style={{ background: 'hsl(var(--muted))' }}
        >
          <BaseTileLayer />

          {plannedPoints.length >= 2 && (
            <Polyline
              positions={plannedPoints}
              pathOptions={{ color: '#64748b', weight: 3, opacity: 0.65, dashArray: '8 8' }}
            />
          )}
          {ridePath.length >= 2 && (
            <Polyline
              positions={ridePath}
              pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.85 }}
            />
          )}

          {firstPoint && (
            <Marker position={firstPoint} icon={startIcon}>
              <Popup>จุดเริ่มบันทึกเส้นทาง</Popup>
            </Marker>
          )}
          {lastPoint && (
            <Marker position={lastPoint} icon={endIcon}>
              <Popup>จุดสุดท้ายที่บันทึกได้</Popup>
            </Marker>
          )}
          {destination && order && (
            <Marker position={destination} icon={plannedDestinationIcon}>
              <Popup>
                <div className="space-y-1 text-[13px]">
                  <div className="font-semibold">ปลายทางตามแผน</div>
                  <div>{order.customer.name}</div>
                  <div className="text-muted-foreground">{order.customer.address}</div>
                </div>
              </Popup>
            </Marker>
          )}
          {proofPoint && (
            <>
              <Circle
                center={proofPoint}
                radius={80}
                pathOptions={{
                  color: '#f59e0b',
                  fillColor: '#f59e0b',
                  fillOpacity: 0.16,
                  weight: 1,
                }}
              />
              <Marker position={proofPoint} icon={actualDeliveryIcon}>
                <Popup>
                  <div className="space-y-1 text-[13px]">
                    <div className="font-semibold">จุดส่งจริงจาก GPS ตอนปิดงาน</div>
                    <div className="text-muted-foreground">
                      {history?.proofLocation?.label ??
                        formatDateTime(history?.proofLocation?.capturedAt)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          )}

          <FitRouteBounds points={fitPoints} />
        </MapContainer>

        <div className="absolute left-3 top-3 z-[1000] max-w-[calc(100%-1.5rem)] rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur">
          {loading ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              กำลังโหลดเส้นทาง…
            </div>
          ) : error ? (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-info">
                <MapPin className="h-3.5 w-3.5" />
                เส้นทางที่ messenger วิ่งจริง
              </div>
              <div className="text-muted-foreground">
                {actualPoints.length > 0
                  ? `${actualPoints.length} จุด · ${formatDistance(history?.session?.distanceMeters)}`
                  : 'ยังไม่มีจุด GPS ที่บันทึกได้'}
              </div>
              {actualPoints.length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {matchedPoints.length >= 2
                    ? 'เส้นทางเกาะถนนจากจุด GPS จริง'
                    : 'แสดงจุด GPS ดิบ (snap ถนนไม่ได้)'}
                </div>
              )}
            </div>
          )}
        </div>

        {!loading && !error && actualPoints.length === 0 && (
          <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-lg border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
            ไม่มีประวัติ GPS ของ route นี้ แผนที่จะแสดงปลายทางตามแผนและจุดส่งจริงจากหลักฐานเท่าที่มี
          </div>
        )}
      </div>
    </div>
  );
}
