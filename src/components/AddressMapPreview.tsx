import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';
import { BaseTileLayer } from '@/components/map/BaseTileLayer';
import { BANGKOK_CENTER, type LatLng } from '@/features/rider/geocode';
import { geocodeAddress } from '@/lib/retailApi';

const pinIcon = L.divIcon({
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:hsl(var(--info));border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(-45deg);margin:3px"></div>',
});

/** ย้าย center ของแผนที่ไปที่พิกัดใหม่เมื่อ geocode ได้ผลต่างจากเดิม */
function Recenter({ coords }: { coords: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([coords.lat, coords.lng], 15);
  }, [map, coords]);
  return null;
}

/**
 * แก้ปัญหา Leaflet สูง 0px เมื่อ mount ก่อน layout เสร็จ (เช่น อยู่ใน tab/แผงที่เพิ่งเปิด)
 * เรียก invalidateSize หลัง mount และทุกครั้งที่ container เปลี่ยนขนาด
 */
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

type GeoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; coords: LatLng }
  | { status: 'not_found' }
  | { status: 'error' };

/**
 * แสดงปลายทางของที่อยู่บนแผนที่แบบดูอย่างเดียว (admin preview ก่อนจัดคิว)
 * - ถ้ามี `geo` มากับ order แล้ว ใช้เลย (พิกัดที่ backend ยืนยันแล้ว)
 * - ถ้าไม่มี → geocode ผ่าน backend แบบ debounce ตามที่อยู่ที่พิมพ์
 */
export function AddressMapPreview({ address, geo }: { address: string; geo?: LatLng | null }) {
  const [state, setState] = useState<GeoState>({ status: 'idle' });
  const reqIdRef = useRef(0);
  const trimmed = address.trim();
  const geoKey = geo ? `${geo.lat},${geo.lng}` : null;

  // ผูกพิกัดที่ backend ยืนยันแล้วเข้ากับ "ที่อยู่ที่บันทึกไว้" ของออเดอร์นั้น
  // เมื่อสลับออเดอร์ (geo เปลี่ยน) → จำที่อยู่ที่ตรงกับพิกัดนี้ เพื่อให้รู้ว่าถ้า admin
  // แก้ที่อยู่ต่างไปจากนี้ ต้อง geocode ใหม่แทนการโชว์หมุดเดิมที่ไม่ตรง
  const geoAddressRef = useRef<string | null>(null);
  useEffect(() => {
    geoAddressRef.current = geoKey ? trimmed : null;
    // ตั้งใจ bind เฉพาะตอน geo เปลี่ยน (สลับออเดอร์) ไม่ผูกกับ trimmed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoKey]);

  useEffect(() => {
    // ใช้พิกัดที่ backend ยืนยันแล้วได้เลย "ถ้าที่อยู่ยังตรงกับที่บันทึกไว้"
    if (geo && trimmed === geoAddressRef.current) {
      setState({ status: 'found', coords: geo });
      return;
    }
    if (!trimmed) {
      setState({ status: 'idle' });
      return;
    }

    const requestId = ++reqIdRef.current;
    setState({ status: 'loading' });
    const timer = window.setTimeout(() => {
      void geocodeAddress(trimmed)
        .then((coords) => {
          if (requestId !== reqIdRef.current) return; // ที่อยู่เปลี่ยนระหว่างรอ — ทิ้งผลเก่า
          setState(coords ? { status: 'found', coords } : { status: 'not_found' });
        })
        .catch(() => {
          if (requestId !== reqIdRef.current) return;
          setState({ status: 'error' });
        });
    }, 500);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, geoKey]);

  const center = useMemo<[number, number]>(
    () =>
      state.status === 'found'
        ? [state.coords.lat, state.coords.lng]
        : [BANGKOK_CENTER.lat, BANGKOK_CENTER.lng],
    [state],
  );

  if (state.status === 'idle') {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">
        <MapPin className="h-5 w-5 opacity-50" />
        ใส่ที่อยู่เพื่อดูปลายทางบนแผนที่
      </div>
    );
  }

  return (
    <div className="relative h-40 overflow-hidden rounded-lg border">
      <MapContainer
        center={center}
        zoom={state.status === 'found' ? 15 : 11}
        scrollWheelZoom={false}
        dragging
        className="h-full w-full"
        style={{ background: 'hsl(var(--muted))' }}
        attributionControl={false}
      >
        <BaseTileLayer />
        <AutoResize />
        {state.status === 'found' && (
          <>
            <Marker position={[state.coords.lat, state.coords.lng]} icon={pinIcon} />
            <Recenter coords={state.coords} />
          </>
        )}
      </MapContainer>

      {/* overlay สถานะ — วางทับมุมบนซ้ายไม่บังหมุด */}
      {state.status !== 'found' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          {state.status === 'loading' ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              กำลังค้นหาพิกัดปลายทาง…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {state.status === 'not_found'
                ? 'หาพิกัดจากที่อยู่นี้ไม่เจอ — ลองระบุย่าน/เขตให้ชัดขึ้น'
                : 'เชื่อมต่อระบบค้นหาพิกัดไม่ได้'}
            </span>
          )}
        </div>
      )}

      {state.status === 'found' && (
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-[500] rounded-md bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-xs">
          ปลายทางโดยประมาณจากที่อยู่
        </div>
      )}
    </div>
  );
}
