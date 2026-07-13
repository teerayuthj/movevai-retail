// View-model ของแท็บนำเข้า: rows → cards (1 card = 1 draft order) + สถานะ/สิทธิ์การกระทำต่อ card
// แยกออกจาก ImportBatchPanel เพราะเป็น pure function ไม่พึ่ง React
import type { Order } from '@/data/orderTypes';
import type { ImportBatchRow } from '@/lib/retailApi';
import { isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import {
  SOURCE_MISSING_FIELDS_COLUMN,
  SOURCE_PARSE_WARNINGS_COLUMN,
  isOcrOnlyRaw,
  rawField,
  sourceConfidence,
  sourceImageDataUrl,
  sourceImageMimeType,
  sourceList,
  sourceOcrText,
} from './importRawFields';

// order ที่ยังอยู่ขั้นตรวจใน Inbox (ยังไม่ปล่อยเข้าคิว)
export const REVIEW_STATUSES: Order['status'][] = ['new', 'needs_review', 'parsing'];
export const ALL_SCOPE = 'all';

export type Tab = 'review' | 'approved' | 'cancelled' | 'rejected' | 'all';
export type RowKind = 'error' | 'review' | 'approved' | 'cancelled' | 'rejected';

export type RowVM = {
  rowId: string;
  rowIndex: number;
  fileName: string;
  rawData: Record<string, string>;
  kind: RowKind;
  orderId?: string;
  name: string;
  address: string;
  value?: number;
  item?: string;
  imageDataUrl?: string;
  imageMimeType?: string;
  hasSourceImage?: boolean;
  ocrText?: string;
  parseWarnings?: string[];
  missingFields?: string[];
  extractionConfidence?: number;
  ocrOnly?: boolean;
  errorMessage?: string | null;
};

// 1 card = 1 draft order (อาจมาจากหลายแถวต้นทาง เมื่อ CSV มี orderNo เดียวกันหรือ admin กดรวม)
// แถว ERROR ไม่มี order → card เดี่ยวของตัวเอง
export type CardVM = {
  key: string;
  orderId?: string;
  kind: RowKind;
  rows: RowVM[];
  primary: RowVM;
};

export function buildCards(rows: RowVM[]): CardVM[] {
  const byOrder = new Map<string, CardVM>();
  const cards: CardVM[] = [];
  for (const row of rows) {
    if (!row.orderId) {
      cards.push({ key: row.rowId, kind: row.kind, rows: [row], primary: row });
      continue;
    }
    const existing = byOrder.get(row.orderId);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    const card: CardVM = {
      key: row.orderId,
      orderId: row.orderId,
      kind: row.kind,
      rows: [row],
      primary: row,
    };
    byOrder.set(row.orderId, card);
    cards.push(card);
  }
  return cards;
}

export function orderItemStats(order: Order | undefined) {
  const skuCount = order?.items.length ?? 0;
  const totalQty = order?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;
  return { skuCount, totalQty };
}

// สรุปสินค้าให้สั้น: "ชื่อสินค้า ×2 (+1)" — โชว์ชิ้นแรก แล้วบอกจำนวนรายการที่เหลือ
export function itemSummary(
  order: Order | undefined,
  raw: Record<string, string>,
): string | undefined {
  if (isOcrOnlyRaw(raw)) return undefined;
  const first = order?.items[0];
  const name = first?.name || rawField(raw, 'itemName', 'item', 'product', 'สินค้า', 'ชื่อสินค้า');
  if (!name) return undefined;
  const qty = first?.qty ?? (Number(rawField(raw, 'qty', 'quantity', 'จำนวน')) || 0);
  const extra = order && order.items.length > 1 ? ` (+${order.items.length - 1})` : '';
  return `${name}${qty > 1 ? ` ×${qty}` : ''}${extra}`;
}

// ค่า placeholder จาก import ("-", "0", ว่าง) ไม่มีข้อมูลจริง — ไม่ต้องโชว์ให้รก
export function hasItemValue(value: string | undefined | null) {
  const trimmed = value?.trim();
  return !!trimmed && trimmed !== '-' && trimmed !== '0';
}

export function rowKindForOrder(order: Order | undefined): RowKind {
  if (!order) return 'review';
  if (order.status === 'rejected') return 'rejected';
  if (order.status === 'cancelled') return 'cancelled';
  if (REVIEW_STATUSES.includes(order.status)) return 'review';
  return 'approved';
}

export function hasPublishedDeliveryJob(order: Order | undefined) {
  return (
    !!order &&
    (order.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
    (order.deliveryRoute ||
      order.deliveryPlan?.releaseState === 'released' ||
      order.assignedDriverId ||
      [
        'assigned',
        'in_transit',
        'pending_confirmation',
        'delivered',
        'failed',
        'returning',
        'returned',
      ].includes(order.status))
  );
}

export function canOpenFastDispatch(card: CardVM, order: Order | undefined) {
  // แสดง "ส่งทันที" คู่กับ "จัดรอบส่ง" เสมอ ตราบใดที่ยังไม่มีคิวส่งมอบจริง —
  // order ที่จัดรอบไว้แล้ว (releaseState 'planned') ก็ยังกดส่งทันทีได้ (จะถอดออกจากรอบให้ก่อน)
  return (
    !!card.orderId &&
    card.kind !== 'error' &&
    card.kind !== 'rejected' &&
    card.kind !== 'cancelled' &&
    !hasPublishedDeliveryJob(order)
  );
}

export function canOpenPlanning(card: CardVM, order: Order | undefined) {
  return (
    !!card.orderId &&
    card.kind !== 'error' &&
    card.kind !== 'rejected' &&
    card.kind !== 'cancelled' &&
    !hasPublishedDeliveryJob(order)
  );
}

export function getDeliveryQueueBadge(order: Order | undefined) {
  if (hasPublishedDeliveryJob(order)) return 'มีคิวส่งมอบแล้ว';
  if (order && isUnreleasedPlannedOrder(order)) return 'อยู่ใน Planning แล้ว';
  return null;
}

export function toRowVM(
  row: ImportBatchRow,
  fileName: string,
  ordersById: Map<string, Order>,
): RowVM {
  const ocrOnly = isOcrOnlyRaw(row.rawData);
  if (row.status === 'ERROR' || !row.orderId) {
    return {
      rowId: row.id,
      rowIndex: row.rowIndex,
      fileName,
      rawData: row.rawData,
      kind: 'error',
      name: ocrOnly
        ? 'ข้อความ OCR จากรูป'
        : rawField(row.rawData, 'customerName', 'ชื่อลูกค้า', 'ชื่อ', 'name') || '(ไม่ระบุชื่อ)',
      address: ocrOnly
        ? 'เปิดกล่อง OCR เพื่อดูข้อความที่ถอดได้'
        : rawField(row.rawData, 'customerAddress', 'address', 'ที่อยู่') || '—',
      item: ocrOnly ? undefined : itemSummary(undefined, row.rawData),
      imageDataUrl: sourceImageDataUrl(row.rawData),
      imageMimeType: sourceImageMimeType(row.rawData),
      hasSourceImage: row.hasSourceImage || !!sourceImageDataUrl(row.rawData),
      ocrText: sourceOcrText(row.rawData),
      parseWarnings: sourceList(row.rawData, SOURCE_PARSE_WARNINGS_COLUMN),
      missingFields: sourceList(row.rawData, SOURCE_MISSING_FIELDS_COLUMN),
      extractionConfidence: sourceConfidence(row.rawData),
      ocrOnly,
      errorMessage: row.errorMessage,
    };
  }
  const order = ordersById.get(row.orderId);
  return {
    rowId: row.id,
    rowIndex: row.rowIndex,
    fileName,
    rawData: row.rawData,
    kind: rowKindForOrder(order),
    orderId: row.orderId,
    name: ocrOnly
      ? 'ข้อความ OCR จากรูป'
      : order?.customer.name ||
        rawField(row.rawData, 'customerName', 'ชื่อลูกค้า', 'ชื่อ', 'name') ||
        '(รอโหลด)',
    address: ocrOnly
      ? 'เปิดกล่อง OCR เพื่อดูข้อความที่ถอดได้'
      : order?.customer.address ||
        rawField(row.rawData, 'customerAddress', 'address', 'ที่อยู่') ||
        '—',
    value: ocrOnly ? undefined : order?.totalValue,
    item: ocrOnly ? undefined : itemSummary(order, row.rawData),
    imageDataUrl: sourceImageDataUrl(row.rawData),
    imageMimeType: sourceImageMimeType(row.rawData),
    hasSourceImage: row.hasSourceImage || !!sourceImageDataUrl(row.rawData),
    ocrText: sourceOcrText(row.rawData),
    parseWarnings: sourceList(row.rawData, SOURCE_PARSE_WARNINGS_COLUMN),
    missingFields: sourceList(row.rawData, SOURCE_MISSING_FIELDS_COLUMN),
    extractionConfidence: sourceConfidence(row.rawData),
    ocrOnly,
  };
}

export function displayOcrText(row: RowVM) {
  const parts = [row.ocrText?.trim()];
  if (row.parseWarnings && row.parseWarnings.length > 0) {
    parts.push(`ข้อสังเกต: ${row.parseWarnings.join(' · ')}`);
  }
  return parts.filter(Boolean).join('\n\n');
}
