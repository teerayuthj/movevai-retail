import { LayersControl, TileLayer } from 'react-leaflet';

/**
 * ชั้นแผนที่ฐาน (base map) กลางของทั้งระบบ — รวมไว้ที่เดียวเพื่อให้ทุกหน้าเลือกใช้รูปแบบ
 * เดียวกันได้ และเพิ่ม/เปลี่ยนผู้ให้บริการ tile ได้จุดเดียว
 *
 * - street    : OpenStreetMap (ถนน/ป้ายชื่อ) — ค่าเริ่มต้น เหมือนที่ใช้อยู่เดิม
 * - satellite : Esri World Imagery (ภาพถ่ายดาวเทียม) — ฟรี ไม่ต้องใช้ API key
 * - terrain   : OpenTopoMap (ภูมิประเทศ/เส้นชั้นความสูง)
 */
export type BaseLayerVariant = 'street' | 'satellite' | 'terrain';

type TileSpec = {
  label: string;
  url: string;
  attribution: string;
  /** zoom สูงสุดที่ tile ผู้ให้บริการรองรับ */
  maxZoom?: number;
};

export const BASE_TILE_LAYERS: Record<BaseLayerVariant, TileSpec> = {
  street: {
    label: 'แผนที่',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  satellite: {
    label: 'ดาวเทียม',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  terrain: {
    label: 'ภูมิประเทศ',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
};

/**
 * Tile ฐานชั้นเดียว — drop-in แทน `<TileLayer ... />` เดิม
 * ใช้เมื่อหน้าต้องการรูปแบบตายตัว (ไม่ต้องมีปุ่มสลับ)
 */
export function BaseTileLayer({ variant = 'street' }: { variant?: BaseLayerVariant }) {
  const spec = BASE_TILE_LAYERS[variant];
  return <TileLayer url={spec.url} attribution={spec.attribution} maxZoom={spec.maxZoom} />;
}

/**
 * ตัวสลับชั้นแผนที่แบบ Google Maps (มุมขวาบนของแผนที่) — ใช้เมื่อต้องการให้ผู้ใช้
 * เลือกเองได้ระหว่าง แผนที่ / ดาวเทียม / ภูมิประเทศ
 *
 * @param variants ลำดับ/ชุดชั้นที่จะให้เลือก (ค่าเริ่มต้น: ทั้งสามแบบ)
 * @param defaultVariant ชั้นที่เปิดมาก่อน
 */
export function BaseLayersControl({
  variants = ['street', 'satellite', 'terrain'],
  defaultVariant = 'street',
}: {
  variants?: BaseLayerVariant[];
  defaultVariant?: BaseLayerVariant;
}) {
  return (
    <LayersControl position="topright">
      {variants.map((variant) => {
        const spec = BASE_TILE_LAYERS[variant];
        return (
          <LayersControl.BaseLayer
            key={variant}
            name={spec.label}
            checked={variant === defaultVariant}
          >
            <TileLayer url={spec.url} attribution={spec.attribution} maxZoom={spec.maxZoom} />
          </LayersControl.BaseLayer>
        );
      })}
    </LayersControl>
  );
}
