import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Route,
  Pencil,
  Coins,
  Copy,
  RotateCcw,
  Layers,
  Download,
  Sparkles,
  Package,
  CalendarDays,
  X,
  UserRound,
  Eye,
  Image as ImageIcon,
  Merge,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Split,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  fetchImportBatches,
  fetchImportBatch,
  downloadImportBatchCsv,
  updateImportedOrder,
  mergeImportOrders,
  splitImportOrderRows,
  addOrderActivity,
  parseAddress,
  fetchAddressSubdistricts,
  syncAppOrder,
  type ImportBatch,
  type ImportBatchDetail,
  type ImportBatchRow,
  type ImportOrderItemInput,
  type ImportRejectReason,
} from '@/lib/retailApi';
import { downloadCsv } from '@/lib/export';
import { formatTHB, shippingMethodLabel, type Order, type ShippingMethod } from '@/data/orderTypes';
import { useRetailStore } from '@/state/retailStore';
import { importRejectReasonLabel } from '@/state/retail/moderation';
import { cn } from '@/lib/utils';
import ThaiAddressPicker from '@/components/ThaiAddressPicker';
import {
  buildNoteWithRequestedDelivery,
  getRequestedDeliveryDraft,
  parseDeliveryFromText,
} from '@/features/inbox/utils/orderSchedule';
import { isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import {
  EMPTY_THAI_ADDRESS,
  composeThaiAddress,
  extractStreet,
  type ThaiAddressValue,
} from '@/lib/thaiAddress';

// order ที่ยังอยู่ขั้นตรวจใน Inbox (ยังไม่ปล่อยเข้าคิว)
const REVIEW_STATUSES: Order['status'][] = ['new', 'needs_review', 'parsing'];
const ALL_SCOPE = 'all';

// ดึงทีละหน้า แล้ว infinite scroll ต่อ — ค่า default 30 วันย้อนหลัง (0 = ทั้งหมด)
const BATCH_PAGE_SIZE = 20;
const DEFAULT_DAYS = 30;
// ค่าพิเศษใน dropdown = โหมดเลือกช่วงวันที่เอง (from–to)
const CUSTOM_DAYS = -1;
const SOURCE_IMAGE_DATA_URL_COLUMN = 'sourceImageDataUrl';
const SOURCE_IMAGE_MIME_TYPE_COLUMN = 'sourceImageMimeType';
const SOURCE_OCR_TEXT_COLUMN = 'sourceOcrText';
const SOURCE_PARSE_WARNINGS_COLUMN = 'parseWarnings';
const SOURCE_MISSING_FIELDS_COLUMN = 'missingFields';
const SOURCE_EXTRACTION_CONFIDENCE_COLUMN = 'extractionConfidence';
const DAY_WINDOW_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: '30 วันล่าสุด' },
  { value: 90, label: '90 วันล่าสุด' },
  { value: 180, label: '180 วันล่าสุด' },
  { value: 365, label: '1 ปีล่าสุด' },
  { value: 0, label: 'ทั้งหมด' },
  { value: CUSTOM_DAYS, label: 'กำหนดช่วงเอง…' },
];
// ปุ่ม action บน order card — ทุกปุ่มขนาด/จัดกลางเหมือนกัน ให้ grid เรียงเป็นระเบียบ
const CARD_ACTION_CLASS =
  'inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-40';

const IMPORT_BATCH_READ_STORAGE_KEY = 'movevai:inbox-import-batch-read-v1';
const IMPORT_LIST_COLLAPSED_STORAGE_KEY = 'movevai:inbox-import-list-collapsed-v1';

function readStoredBatchIds() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMPORT_BATCH_READ_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function writeStoredBatchIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMPORT_BATCH_READ_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be disabled or full; keep the in-memory read state for this session.
  }
}

function readStoredListCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(IMPORT_LIST_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredListCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMPORT_LIST_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // localStorage may be disabled or full; keep the in-memory collapsed state for this session.
  }
}

function BatchListItem({
  batch,
  selected,
  unread,
  onClick,
}: {
  batch: ImportBatch;
  selected: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  const senderName = batch.lineSenderDisplayName?.trim();
  const senderId = batch.lineSenderUserId?.trim();
  const senderLabel = senderName || (senderId ? `LINE ${senderId.slice(0, 8)}...` : null);
  const isProcessing = batch.status === 'PENDING' || batch.status === 'PROCESSING';

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-border bg-muted' : 'border-transparent hover:bg-muted/60',
      )}
    >
      <button type="button" onClick={onClick} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
            <FileSpreadsheet
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                unread ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <span className={cn('truncate text-xs font-medium', unread && 'font-semibold')}>
              {batch.fileName}
            </span>
          </div>
          {isProcessing ? (
            <Badge variant="info" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              กำลังนำเข้า
            </Badge>
          ) : (
            unread && (
              <Badge variant="info" className="h-5 shrink-0 px-1.5 text-[10px]">
                รายการใหม่
              </Badge>
            )
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {senderLabel && (
            <>
              <span className="inline-flex min-w-0 items-center gap-1">
                {batch.lineSenderPictureUrl ? (
                  <img
                    src={batch.lineSenderPictureUrl}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <UserRound className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{senderLabel}</span>
              </span>
              <span>·</span>
            </>
          )}
          <span>
            {new Date(batch.createdAt).toLocaleString('th', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {isProcessing && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-info">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span>
                {batch.status === 'PENDING' ? 'รอเข้าคิวประมวลผล…' : 'กำลังอ่านข้อมูลจากไฟล์…'}
              </span>
              {batch.totalRows > 0 && (
                <span className="text-muted-foreground">
                  {batch.importedRows}/{batch.totalRows} แถว
                </span>
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-info/15">
              <div
                className={cn(
                  'h-full rounded-full bg-info transition-all',
                  batch.totalRows > 0 ? '' : 'w-1/3 animate-pulse',
                )}
                style={
                  batch.totalRows > 0
                    ? {
                        width: `${Math.min(100, Math.round((batch.importedRows / batch.totalRows) * 100))}%`,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        )}

        {(batch.status === 'DONE' || batch.status === 'ERROR') && (
          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <span className="text-success">✓ {batch.importedRows} orders</span>
            {batch.errorRows > 0 && (
              <span className="text-destructive">✗ {batch.errorRows} error</span>
            )}
            {batch.totalRows > 0 && (
              <span className="text-muted-foreground">/ {batch.totalRows} แถว</span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

type Tab = 'review' | 'approved' | 'rejected' | 'all';
type RowKind = 'error' | 'review' | 'approved' | 'rejected';

type RowVM = {
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
  ocrText?: string;
  parseWarnings?: string[];
  missingFields?: string[];
  extractionConfidence?: number;
  ocrOnly?: boolean;
  errorMessage?: string | null;
};

// 1 card = 1 draft order (อาจมาจากหลายแถวต้นทาง เมื่อ CSV มี orderNo เดียวกันหรือ admin กดรวม)
// แถว ERROR ไม่มี order → card เดี่ยวของตัวเอง
type CardVM = {
  key: string;
  orderId?: string;
  kind: RowKind;
  rows: RowVM[];
  primary: RowVM;
};

function buildCards(rows: RowVM[]): CardVM[] {
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

function orderItemStats(order: Order | undefined) {
  const skuCount = order?.items.length ?? 0;
  const totalQty = order?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;
  return { skuCount, totalQty };
}

// สรุปสินค้าให้สั้น: "ชื่อสินค้า ×2 (+1)" — โชว์ชิ้นแรก แล้วบอกจำนวนรายการที่เหลือ
function itemSummary(order: Order | undefined, raw: Record<string, string>): string | undefined {
  if (isOcrOnlyRaw(raw)) return undefined;
  const first = order?.items[0];
  const name = first?.name || rawField(raw, 'itemName', 'item', 'product', 'สินค้า', 'ชื่อสินค้า');
  if (!name) return undefined;
  const qty = first?.qty ?? (Number(rawField(raw, 'qty', 'quantity', 'จำนวน')) || 0);
  const extra = order && order.items.length > 1 ? ` (+${order.items.length - 1})` : '';
  return `${name}${qty > 1 ? ` ×${qty}` : ''}${extra}`;
}

// ค่า placeholder จาก import ("-", "0", ว่าง) ไม่มีข้อมูลจริง — ไม่ต้องโชว์ให้รก
function hasItemValue(value: string | undefined | null) {
  const trimmed = value?.trim();
  return !!trimmed && trimmed !== '-' && trimmed !== '0';
}

function OrderItemPreviewList({ order }: { order: Order }) {
  const visibleItems = order.items.slice(0, 4);
  const hiddenCount = Math.max(0, order.items.length - visibleItems.length);

  return (
    <div className="mt-2 rounded-md border bg-background">
      <div className="divide-y">
        {visibleItems.map((item, index) => (
          <div
            key={`${item.sku}-${index}`}
            className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate text-xs font-medium">{item.name}</span>
                {hasItemValue(item.purity) && (
                  <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                    {item.purity}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {hasItemValue(item.sku) && <span className="font-mono">{item.sku}</span>}
                {hasItemValue(item.weight) && <span>นน. {item.weight}</span>}
                <span>ราคา/ชิ้น {formatTHB(item.unitPrice)}</span>
              </div>
            </div>
            <div className="text-right text-xs tabular-nums">
              <div className="font-semibold">× {item.qty}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatTHB(item.qty * item.unitPrice)}
              </div>
            </div>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          อีก {hiddenCount.toLocaleString('th-TH')} SKU
        </div>
      )}
    </div>
  );
}

type ImportItemDraft = {
  name: string;
  sku: string;
  purity: string;
  weight: string;
  qty: string;
  unitPrice: string;
  note: string;
};

const EMPTY_ITEM_DRAFT: ImportItemDraft = {
  name: '',
  sku: '',
  purity: '',
  weight: '',
  qty: '1',
  unitPrice: '0',
  note: '',
};

type ImportEditDraft = {
  rawData: Record<string, string>;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  addr: ThaiAddressValue;
  customerIdCard: string;
  totalValue: string;
  payment: Order['payment'];
  note: string;
  deliveryDate: string;
  deliveryTime: string;
  items: ImportItemDraft[];
};

function rawField(raw: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const found = Object.entries(raw).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (found && found[1]) return found[1];
  }
  return '';
}

function sourceImageDataUrl(raw: Record<string, string>) {
  const value = raw[SOURCE_IMAGE_DATA_URL_COLUMN]?.trim();
  return value?.startsWith('data:image/') ? value : undefined;
}

function sourceImageMimeType(raw: Record<string, string>) {
  return raw[SOURCE_IMAGE_MIME_TYPE_COLUMN]?.trim() || undefined;
}

function sourceOcrText(raw: Record<string, string>) {
  return raw[SOURCE_OCR_TEXT_COLUMN]?.trim() || undefined;
}

function sourceList(raw: Record<string, string>, key: string) {
  return (raw[key] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function sourceConfidence(raw: Record<string, string>) {
  const value = Number(raw[SOURCE_EXTRACTION_CONFIDENCE_COLUMN]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined;
}

function isOcrOnlyRaw(raw: Record<string, string>) {
  const warnings = sourceList(raw, SOURCE_PARSE_WARNINGS_COLUMN).join(' ').toLowerCase();
  const missing = new Set(sourceList(raw, SOURCE_MISSING_FIELDS_COLUMN));
  return (
    !!sourceOcrText(raw) &&
    ((missing.has('customerName') &&
      missing.has('customerPhone') &&
      missing.has('customerAddress')) ||
      warnings.includes('no customer') ||
      warnings.includes('no order'))
  );
}

function visibleRawEntries(raw: Record<string, string>) {
  return Object.entries(raw).filter(([key, value]) => {
    if (
      key === SOURCE_IMAGE_DATA_URL_COLUMN ||
      key === SOURCE_IMAGE_MIME_TYPE_COLUMN ||
      key === SOURCE_OCR_TEXT_COLUMN ||
      key === SOURCE_PARSE_WARNINGS_COLUMN ||
      key === SOURCE_MISSING_FIELDS_COLUMN ||
      key === SOURCE_EXTRACTION_CONFIDENCE_COLUMN
    ) {
      return false;
    }
    if (isOcrOnlyRaw(raw)) {
      return (
        value.trim() !== '' &&
        !['qty', 'payment', 'unitPrice', 'totalValue', 'itemName', 'note'].includes(key)
      );
    }
    return true;
  });
}

function rowKindForOrder(order: Order | undefined): RowKind {
  if (!order) return 'review';
  if (order.status === 'rejected') return 'rejected';
  if (REVIEW_STATUSES.includes(order.status)) return 'review';
  return 'approved';
}

function hasPublishedDeliveryJob(order: Order | undefined) {
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

function canOpenFastDispatch(card: CardVM, order: Order | undefined) {
  return (
    !!card.orderId &&
    card.kind !== 'error' &&
    card.kind !== 'rejected' &&
    !(order && isUnreleasedPlannedOrder(order)) &&
    !hasPublishedDeliveryJob(order)
  );
}

function canOpenPlanning(card: CardVM, order: Order | undefined) {
  return (
    !!card.orderId &&
    card.kind !== 'error' &&
    card.kind !== 'rejected' &&
    !hasPublishedDeliveryJob(order)
  );
}

function getDeliveryQueueBadge(order: Order | undefined) {
  if (hasPublishedDeliveryJob(order)) return 'มีคิวส่งมอบแล้ว';
  if (order && isUnreleasedPlannedOrder(order)) return 'อยู่ใน Planning แล้ว';
  return null;
}

function toRowVM(row: ImportBatchRow, fileName: string, ordersById: Map<string, Order>): RowVM {
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
    ocrText: sourceOcrText(row.rawData),
    parseWarnings: sourceList(row.rawData, SOURCE_PARSE_WARNINGS_COLUMN),
    missingFields: sourceList(row.rawData, SOURCE_MISSING_FIELDS_COLUMN),
    extractionConfidence: sourceConfidence(row.rawData),
    ocrOnly,
  };
}

// items ของออเดอร์ → ตารางแก้ไข: ใช้ของจริงจาก order ทุก SKU (รองรับออเดอร์หลายแถว/รวมแล้ว)
// ถ้ายังไม่มี order (แถว error) fallback เป็น item เดียวจาก rawData
function itemDraftsFromRow(
  row: RowVM,
  order: Order | undefined,
  ocrOnly: boolean,
): ImportItemDraft[] {
  if (order && order.items.length > 0) {
    return order.items.map((item) => ({
      name: ocrOnly && item.name === 'สินค้าจากรูป LINE' ? '' : item.name,
      sku: item.sku || '-',
      purity: item.purity || '-',
      weight: item.weight || '0',
      qty: String(item.qty),
      unitPrice: String(item.unitPrice),
      note: item.note ?? '',
    }));
  }
  const rawItemQty = Number(rawField(row.rawData, 'qty', 'quantity', 'จำนวน'));
  const rawItemUnitPrice = Number(rawField(row.rawData, 'price', 'unitPrice', 'itemPrice', 'ราคา'));
  return [
    {
      name: ocrOnly
        ? ''
        : rawField(row.rawData, 'itemName', 'item', 'product', 'สินค้า', 'ชื่อสินค้า'),
      sku: rawField(row.rawData, 'sku', 'itemSku', 'รหัสสินค้า') || '-',
      purity: rawField(row.rawData, 'purity', 'ความบริสุทธิ์') || '-',
      weight: rawField(row.rawData, 'weight', 'น้ำหนัก') || '0',
      qty: String(Number.isFinite(rawItemQty) && rawItemQty > 0 ? rawItemQty : 1),
      unitPrice: String(Number.isFinite(rawItemUnitPrice) ? rawItemUnitPrice : 0),
      note: '',
    },
  ];
}

function draftFromRow(row: RowVM, order: Order | undefined): ImportEditDraft {
  const ocrOnly = row.ocrOnly || isOcrOnlyRaw(row.rawData);
  const rawTotalValue = Number(rawField(row.rawData, 'totalValue', 'total', 'ราคารวม', 'มูลค่า'));
  const rawPayment = rawField(row.rawData, 'payment', 'การชำระ', 'ชำระ');
  const rawDelivery = parseDeliveryFromText(
    [
      rawField(row.rawData, 'deliveryDate', 'delivery_date', 'นัดส่ง', 'วันส่ง'),
      rawField(row.rawData, 'deliveryTime', 'delivery_time', 'เวลา', 'เวลาส่ง'),
      rawField(row.rawData, 'note', 'หมายเหตุ'),
    ]
      .filter(Boolean)
      .join(' '),
  );
  const requestedDelivery = order ? getRequestedDeliveryDraft(order) : rawDelivery;
  const orderCustomerName =
    ocrOnly && order?.customer.name === '(รอตรวจจากรูป LINE)' ? '' : order?.customer.name;
  const orderCustomerAddress = ocrOnly ? '' : order?.customer.address;
  return {
    rawData: row.rawData,
    customerName:
      orderCustomerName ??
      rawField(row.rawData, 'customerName', 'customer_name', 'ชื่อลูกค้า', 'ชื่อ', 'name'),
    customerPhone:
      order?.customer.phone ??
      rawField(row.rawData, 'customerPhone', 'phone', 'tel', 'เบอร์โทร', 'เบอร์'),
    customerAddress:
      orderCustomerAddress ?? rawField(row.rawData, 'customerAddress', 'address', 'ที่อยู่'),
    customerIdCard:
      order?.customer.idCard ?? rawField(row.rawData, 'idCard', 'เลขบัตร', 'บัตรประชาชน'),
    totalValue: String(order?.totalValue ?? (Number.isFinite(rawTotalValue) ? rawTotalValue : 0)),
    payment: normalizePaymentMethod(order?.payment ?? rawPayment),
    note:
      ocrOnly && (order?.note === row.ocrText || rawField(row.rawData, 'note', 'หมายเหตุ'))
        ? ''
        : (order?.note ?? rawField(row.rawData, 'note', 'หมายเหตุ')),
    deliveryDate: requestedDelivery.date,
    deliveryTime: requestedDelivery.time,
    items: itemDraftsFromRow(row, order, ocrOnly),
    addr: EMPTY_THAI_ADDRESS,
  };
}

function displayOcrText(row: RowVM) {
  const parts = [row.ocrText?.trim()];
  if (row.parseWarnings && row.parseWarnings.length > 0) {
    parts.push(`ข้อสังเกต: ${row.parseWarnings.join(' · ')}`);
  }
  return parts.filter(Boolean).join('\n\n');
}

type OcrDisplayLine = { kind: 'heading' | 'bullet' | 'text' | 'blank'; text: string };

function stripInlineMarkdown(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

// OCR จาก typhoon-ocr กลับมาเป็น markdown — แปลงเป็นบรรทัดอ่านง่ายสำหรับ user โดยไม่แตะข้อมูลดิบใน rawData
function ocrDisplayLines(text: string): OcrDisplayLine[] {
  const out: OcrDisplayLine[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      out.push({ kind: 'blank', text: '' });
      continue;
    }
    if (line.includes('|') && line.includes('-') && /^[|\s:-]+$/.test(line)) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push({ kind: 'heading', text: stripInlineMarkdown(heading[1]) });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      out.push({ kind: 'bullet', text: stripInlineMarkdown(bullet[1]) });
      continue;
    }
    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => stripInlineMarkdown(cell))
        .filter(Boolean);
      out.push({ kind: 'text', text: cells.join('  ·  ') });
      continue;
    }
    out.push({ kind: 'text', text: stripInlineMarkdown(line) });
  }
  return out.filter(
    (line, index, all) => line.kind !== 'blank' || all[index - 1]?.kind !== 'blank',
  );
}

function ocrPlainText(text: string) {
  return ocrDisplayLines(text)
    .map((line) => (line.kind === 'bullet' ? `• ${line.text}` : line.text))
    .join('\n')
    .trim();
}

async function copyTextToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // clipboard API ใช้ไม่ได้บน http ที่ไม่ใช่ localhost / document ไม่มี focus — fallback เป็น execCommand
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      scratch.remove();
    }
  }
}

function normalizePaymentMethod(value: unknown): Order['payment'] {
  if (typeof value !== 'string') return 'prepaid';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'cod' || normalized.includes('ปลายทาง')) return 'cod';
  if (normalized.includes('โอนตอนส่ง') || normalized.includes('โอนเมื่อส่ง')) {
    return 'transfer_on_delivery';
  }
  if (
    normalized === 'transfer_on_delivery' ||
    normalized === 'prepaid' ||
    normalized === 'transfer' ||
    normalized === 'paid' ||
    normalized === 'โอน' ||
    normalized === 'โอนแล้ว' ||
    normalized.includes('ชำระแล้ว')
  ) {
    return normalized === 'transfer_on_delivery' ? 'transfer_on_delivery' : 'prepaid';
  }
  return 'prepaid';
}

function toPositiveInt(value: string, fallback = 1) {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function toNonNegativeNumber(value: string, fallback = 0) {
  const next = Number(value.replace(/,/g, ''));
  return Number.isFinite(next) && next >= 0 ? next : fallback;
}

async function fillMissingPostalCode(addr: ThaiAddressValue): Promise<ThaiAddressValue> {
  if (/^\d{5}$/.test(addr.postalCode.trim())) return addr;
  if (!addr.province.trim() || !addr.district.trim() || !addr.subdistrict.trim()) return addr;
  const subdistricts = await fetchAddressSubdistricts(addr.province, addr.district);
  const match = subdistricts.find((item) => item.subdistrict === addr.subdistrict);
  return match?.postalCode ? { ...addr, postalCode: match.postalCode } : addr;
}

function TabChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: 'accent' | 'muted' | 'success';
}) {
  const activeClass =
    tone === 'success'
      ? 'border-success bg-success/10 text-success'
      : tone === 'muted'
        ? 'border-foreground/40 text-foreground'
        : 'border-primary bg-primary/5 text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? activeClass : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label} {count}
    </button>
  );
}

// เมื่อ filter ของแท็บปัจจุบันว่าง ให้ชี้ว่ารายการไปอยู่แท็บไหน (ไม่ได้หาย — แค่เปลี่ยนสถานะ)
function TabEmptyState({
  tab,
  stats,
  onJump,
}: {
  tab: Tab;
  stats: { review: number; approved: number; rejected: number; error: number; total: number };
  onJump: (tab: Tab) => void;
}) {
  const reviewCount = stats.review + stats.error;
  const suggestions: { tab: Tab; label: string; count: number }[] = [];
  if (tab !== 'approved' && stats.approved > 0)
    suggestions.push({ tab: 'approved', label: 'อนุมัติแล้ว', count: stats.approved });
  if (tab !== 'review' && reviewCount > 0)
    suggestions.push({ tab: 'review', label: 'รอตรวจ', count: reviewCount });
  if (tab !== 'rejected' && stats.rejected > 0)
    suggestions.push({ tab: 'rejected', label: 'ปฏิเสธ', count: stats.rejected });

  // ตรวจครบแล้ว (ไม่เหลือรอตรวจ แต่มีของในไฟล์) → เป็นสถานะที่ดี ไม่ใช่ error
  const reviewedClean = tab === 'review' && stats.total > 0;
  const title = reviewedClean
    ? 'ตรวจครบแล้ว — ไม่มีรายการรอตรวจ'
    : tab === 'approved'
      ? 'ยังไม่มีรายการที่อนุมัติเข้าคิว'
      : tab === 'rejected'
        ? 'ไม่มีรายการที่ปฏิเสธ'
        : 'ไม่มีรายการในกลุ่มนี้';

  return (
    <div className="flex flex-col items-center gap-2">
      {reviewedClean ? (
        <CheckCircle2 className="h-6 w-6 text-success/70" />
      ) : (
        <Clock className="h-6 w-6 text-muted-foreground/50" />
      )}
      <div className="text-sm text-muted-foreground">{title}</div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <span>รายการอยู่ที่:</span>
          {suggestions.map((s) => (
            <button
              key={s.tab}
              type="button"
              onClick={() => onJump(s.tab)}
              className="rounded-full border border-border px-2.5 py-1 font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {s.label} {s.count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RowStatusBadge({ kind }: { kind: RowKind }) {
  if (kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <XCircle className="h-3 w-3 shrink-0" /> ผิดพลาด
      </span>
    );
  }
  if (kind === 'review') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <Clock className="h-3 w-3 shrink-0" /> รอตรวจ
      </span>
    );
  }
  if (kind === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <XCircle className="h-3 w-3 shrink-0" /> ปฏิเสธ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
      <CheckCircle2 className="h-3 w-3 shrink-0" /> อนุมัติแล้ว
    </span>
  );
}

const REJECT_REASONS: ImportRejectReason[] = [
  'incomplete_data',
  'duplicate',
  'wrong_group',
  'other',
];

function BatchWorkspace({
  scope,
  batches,
  onFastDispatchOrder,
  onPlanningOrder,
  onDownloadBatch,
  downloadingBatchId,
}: {
  scope: string; // batchId | 'all'
  batches: ImportBatch[];
  onFastDispatchOrder?: (orderId: string) => void;
  onPlanningOrder?: (orderId: string) => void;
  onDownloadBatch: (batch: Pick<ImportBatch, 'id' | 'fileName'>) => void;
  downloadingBatchId: string | null;
}) {
  const { orders, approveImportOrders, rejectImportOrders, restoreImportOrders, syncFromBackend } =
    useRetailStore();
  const [details, setDetails] = useState<ImportBatchDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('review');
  // ผู้ใช้กดเลือกแท็บเองหรือยัง — ถ้ายัง ให้ระบบเลือก default ที่มีของให้
  const [tabTouched, setTabTouched] = useState(false);
  const selectTab = (next: Tab) => {
    setTabTouched(true);
    setTab(next);
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<ShippingMethod>('internal_driver');
  const [reason, setReason] = useState<ImportRejectReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [editingRow, setEditingRow] = useState<RowVM | null>(null);
  const [editDraft, setEditDraft] = useState<ImportEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [previewImage, setPreviewImage] = useState<{
    src: string;
    fileName: string;
    rowIndex: number;
  } | null>(null);

  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const targetBatchIds = useMemo(
    () => (scope === ALL_SCOPE ? batches.map((b) => b.id) : [scope]),
    [scope, batches],
  );

  // batch ที่ยังประมวลผลอยู่ในสโคปนี้ — driver ของ processing state + refetch เมื่อ backend อ่านเสร็จ
  const processingBatches = useMemo(
    () =>
      targetBatchIds
        .map((id) => batchById.get(id))
        .filter(
          (b): b is ImportBatch => !!b && (b.status === 'PENDING' || b.status === 'PROCESSING'),
        ),
    [targetBatchIds, batchById],
  );

  // signature เปลี่ยนเฉพาะเมื่อ batch ที่เกี่ยวข้องมี progress ขยับ (status/แถวนำเข้า) →
  // ให้ refetch rows ใหม่อัตโนมัติตอน PENDING/PROCESSING → DONE โดยไม่ต้องกด refresh
  const batchStatusKey = useMemo(
    () =>
      targetBatchIds
        .map((id) => {
          const b = batchById.get(id);
          return b ? `${id}:${b.status}:${b.importedRows}:${b.errorRows}` : id;
        })
        .join('|'),
    [targetBatchIds, batchById],
  );

  // โหลดครั้งแรกให้ขึ้น spinner เต็มพาเนล; refetch เบื้องหลัง (poll → DONE) ไม่ต้อง flash
  const initialLoadRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!initialLoadRef.current) {
      setLoading(true);
      setSelected(new Set());
    }
    Promise.all(targetBatchIds.map((id) => fetchImportBatch(id)))
      .then((res) => {
        if (!cancelled) setDetails(res);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error('โหลดรายการนำเข้าไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          initialLoadRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
    // targetBatchIds ถูกจับผ่าน batchStatusKey แล้ว (id อยู่ใน key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchStatusKey]);

  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const rows = useMemo<RowVM[]>(
    () =>
      details.flatMap((detail) =>
        detail.rows.map((row) => toRowVM(row, detail.fileName, ordersById)),
      ),
    [details, ordersById],
  );

  // 1 card = 1 draft order — CSV ที่มี orderNo เดียวกันหลายแถว (หรือถูก merge แล้ว) รวมเป็น card เดียว
  const cards = useMemo(() => buildCards(rows), [rows]);

  const stats = useMemo(() => {
    let review = 0;
    let approved = 0;
    let rejected = 0;
    let error = 0;
    let value = 0;
    for (const card of cards) {
      if (card.kind === 'review') review += 1;
      else if (card.kind === 'approved') approved += 1;
      else if (card.kind === 'rejected') rejected += 1;
      else error += 1;
      if (card.primary.value) value += card.primary.value;
    }
    return {
      review,
      approved,
      rejected,
      error,
      value,
      total: cards.length,
      totalRows: rows.length,
    };
  }, [cards, rows.length]);

  // ถ้าผู้ใช้ยังไม่กดแท็บเอง ให้เด้งไปแท็บแรกที่มีรายการ (ตรวจครบแล้ว → ไปดู "อนุมัติแล้ว" แทนหน้าว่าง)
  useEffect(() => {
    if (loading || tabTouched) return;
    if (stats.review + stats.error > 0) setTab('review');
    else if (stats.approved > 0) setTab('approved');
    else if (stats.rejected > 0) setTab('rejected');
    else setTab('all');
  }, [loading, tabTouched, stats.review, stats.error, stats.approved, stats.rejected]);

  const visibleCards = useMemo(() => {
    if (tab === 'all') return cards;
    if (tab === 'review') return cards.filter((c) => c.kind === 'review' || c.kind === 'error');
    if (tab === 'approved') return cards.filter((c) => c.kind === 'approved');
    return cards.filter((c) => c.kind === 'rejected');
  }, [cards, tab]);

  // เลือกได้เฉพาะออเดอร์ที่ยังรอตรวจ (มี order อยู่ใน store)
  const selectableIds = useMemo(
    () =>
      visibleCards
        .filter((c) => c.kind === 'review' && c.orderId && ordersById.has(c.orderId))
        .map((c) => c.orderId!),
    [visibleCards, ordersById],
  );

  // รอตรวจทั้งหมดในสโคปนี้ (ไม่ผูกกับแท็บที่เปิดอยู่) — ใช้กับปุ่ม "อนุมัติทั้งหมด"
  const reviewIds = useMemo(
    () =>
      cards
        .filter((c) => c.kind === 'review' && c.orderId && ordersById.has(c.orderId))
        .map((c) => c.orderId!),
    [cards, ordersById],
  );

  // กลุ่มที่ backend เสนอว่า "น่าจะรวมได้" — โชว์เฉพาะกลุ่มที่ทุกออเดอร์ยังรอตรวจอยู่
  const mergeSuggestions = useMemo(() => {
    const reviewOrderIds = new Set(reviewIds);
    return details
      .flatMap((detail) =>
        (detail.groupSuggestions ?? []).map((s) => ({ ...s, fileName: detail.fileName })),
      )
      .map((s) => ({ ...s, orderIds: s.orderIds.filter((id) => reviewOrderIds.has(id)) }))
      .filter((s) => s.orderIds.length >= 2);
  }, [details, reviewIds]);

  const toggle = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const bulkApprove = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    void runAction(`อนุมัติเข้าคิว ${ids.length} รายการ · ${shippingMethodLabel[method]}`, () =>
      approveImportOrders(ids, method),
    );
  };

  const approveAllInScope = () => {
    if (reviewIds.length === 0) return;
    void runAction(
      `อนุมัติทั้งรายการ ${reviewIds.length} ออเดอร์ · ${shippingMethodLabel[method]}`,
      () => approveImportOrders(reviewIds, method),
    );
  };

  const ensureInternalDriverReady = async (orderId: string) => {
    await approveImportOrders([orderId], 'internal_driver');
    const order = ordersById.get(orderId);
    if (!order) return;

    await syncAppOrder({
      ...order,
      status: 'ready',
      confidence: Math.max(order.confidence, 90),
      dispatchReadiness: order.dispatchReadiness ?? 'ready',
      shippingMethod: 'internal_driver',
    });
    await syncFromBackend();
  };

  const approveAndOpenFastDispatch = (orderId: string) => {
    void runAction('เปิดหน้าส่งทันที', async () => {
      await ensureInternalDriverReady(orderId);
      onFastDispatchOrder?.(orderId);
    });
  };

  const approveAndOpenPlanning = (orderId: string) => {
    void runAction('เปิดหน้าจัดรอบส่ง', async () => {
      await ensureInternalDriverReady(orderId);
      onPlanningOrder?.(orderId);
    });
  };

  // ปฏิเสธแล้วเด้ง toast ที่บอกชัดว่า "ไปอยู่แท็บ ปฏิเสธ" + ปุ่มดึงกลับ (undo) ในตัว
  // แก้ปัญหาแถวหายวับจากแท็บรอตรวจโดยไม่รู้ว่าไปไหน
  const rejectOrders = async (ids: string[], input?: { reason?: ImportRejectReason }) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await rejectImportOrders(ids, input?.reason ? { reason: input.reason } : undefined);
      setSelected(new Set());
      const count = ids.length;
      toast.success(count === 1 ? 'ปฏิเสธออเดอร์แล้ว' : `ปฏิเสธ ${count} รายการแล้ว`, {
        description: 'ย้ายไปที่แท็บ “ปฏิเสธ” แล้ว — ยังกดดึงกลับมาตรวจใหม่ได้',
        duration: 6000,
        action: {
          label: 'ดึงกลับ',
          onClick: () => {
            void restoreImportOrders(ids)
              .then(() =>
                toast.success(
                  count === 1 ? 'ดึงกลับมาตรวจใหม่แล้ว' : `ดึงกลับ ${count} รายการแล้ว`,
                ),
              )
              .catch((error) =>
                toast.error(error instanceof Error ? error.message : 'ดึงกลับไม่สำเร็จ'),
              );
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ปฏิเสธไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const bulkReject = () => {
    void rejectOrders([...selected], reason ? { reason } : undefined);
  };

  const reloadDetails = async () => {
    const res = await Promise.all(targetBatchIds.map((id) => fetchImportBatch(id)));
    setDetails(res);
  };

  // รวมหลาย draft orders เป็นออเดอร์เดียว (ตัวแรกเป็นหลัก) — ย้อนกลับได้ด้วย "แยกตามแถวต้นทาง"
  const mergeOrders = (orderIds: string[]) => {
    if (orderIds.length < 2) return;
    void runAction(
      `รวม ${orderIds.length} รายการเป็น 1 ออเดอร์แล้ว — ตรวจอีกครั้งก่อนอนุมัติ`,
      async () => {
        await mergeImportOrders(orderIds);
        await Promise.all([reloadDetails(), syncFromBackend()]);
      },
    );
  };

  // แยกออเดอร์ที่มีหลายแถวต้นทาง กลับเป็น 1 ออเดอร์ต่อ 1 แถว (แถวแรกอยู่ที่ออเดอร์เดิม)
  const splitCard = (card: CardVM) => {
    if (!card.orderId || card.rows.length < 2) return;
    const rowIds = card.rows.slice(1).map((row) => row.rowId);
    void runAction(`แยกออเดอร์กลับเป็น ${card.rows.length} รายการตามแถวต้นทางแล้ว`, async () => {
      await splitImportOrderRows(card.orderId!, rowIds);
      await Promise.all([reloadDetails(), syncFromBackend()]);
    });
  };

  const startEditRow = (row: RowVM) => {
    if (!row.orderId) return;
    const draft = draftFromRow(row, ordersById.get(row.orderId));
    setEditingRow(row);
    setEditDraft(draft);
    // ที่อยู่จาก CSV มักมายาว ๆ บรรทัดเดียว → เดา ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ให้อัตโนมัติ
    void applyAutoFill(draft.customerAddress, { silent: true });
  };

  // แยกที่อยู่ยาว ๆ → เติม picker อัตโนมัติ แล้วเหลือเฉพาะบ้านเลขที่/ถนนในช่อง free-text
  const applyAutoFill = async (rawText: string, opts?: { silent?: boolean }) => {
    const raw = rawText.trim();
    if (!raw) return;
    setAutoFilling(true);
    try {
      const parsed = await parseAddress(raw);
      if (!parsed || parsed.score === 0) {
        if (!opts?.silent) toast.error('ไม่สามารถแยกที่อยู่อัตโนมัติได้ กรุณาเลือกเอง');
        return;
      }
      const addr: ThaiAddressValue = {
        province: parsed.province,
        district: parsed.district,
        subdistrict: parsed.subdistrict,
        postalCode: parsed.postalCode,
      };
      setEditDraft((prev) =>
        prev ? { ...prev, addr, customerAddress: extractStreet(raw, addr) } : prev,
      );
      if (!opts?.silent) toast.success('แยกที่อยู่อัตโนมัติแล้ว — ตรวจสอบความถูกต้องอีกครั้ง');
    } catch {
      if (!opts?.silent) toast.error('แยกที่อยู่ไม่สำเร็จ');
    } finally {
      setAutoFilling(false);
    }
  };

  const updateItemDraft = (index: number, patch: Partial<ImportItemDraft>) => {
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
          }
        : prev,
    );
  };

  const addItemDraft = () => {
    setEditDraft((prev) =>
      prev ? { ...prev, items: [...prev.items, { ...EMPTY_ITEM_DRAFT }] } : prev,
    );
  };

  const removeItemDraft = (index: number) => {
    setEditDraft((prev) =>
      prev && prev.items.length > 1
        ? { ...prev, items: prev.items.filter((_, i) => i !== index) }
        : prev,
    );
  };

  const saveEditRow = async () => {
    if (!editingRow?.orderId || !editDraft) return;
    let addr = editDraft.addr;
    try {
      addr = await fillMissingPostalCode(editDraft.addr);
      if (addr.postalCode !== editDraft.addr.postalCode) {
        setEditDraft((prev) => (prev ? { ...prev, addr } : prev));
      }
    } catch {
      // ถ้า lookup ไม่สำเร็จ ให้ validation ด้านล่างแจ้งผู้ใช้กรอกเอง
    }
    // customerAddress = ส่วน free-text, addr = ที่เลือกจาก picker → รวมเป็นที่อยู่เต็ม
    const fullAddress = composeThaiAddress(editDraft.customerAddress, addr);
    // นับเฉพาะแถวสินค้าที่กรอกชื่อแล้ว — แถวว่างที่เผลอกดเพิ่มไว้ถูกตัดทิ้งตอนบันทึก
    const filledItems = editDraft.items.filter((item) => item.name.trim() !== '');
    const missing = [
      !editDraft.customerName.trim() && 'ชื่อผู้รับ',
      !editDraft.customerPhone.trim() && 'เบอร์โทร',
      !fullAddress.trim() && 'ที่อยู่',
      // กันลืมรหัสไปรษณีย์ (เผลอกด X แล้วไม่เติมกลับ) — ต้องครบ 5 หลัก
      !/^\d{5}$/.test(addr.postalCode.trim()) && 'รหัสไปรษณีย์ (5 หลัก)',
      filledItems.length === 0 && 'สินค้า (อย่างน้อย 1 รายการ)',
    ].filter(Boolean);
    if (missing.length > 0) {
      toast.error(`กรอกข้อมูลให้ครบก่อนบันทึก: ${missing.join(', ')}`);
      return;
    }

    setSavingEdit(true);
    try {
      const existingOrder = ordersById.get(editingRow.orderId);
      const beforeDelivery = existingOrder
        ? getRequestedDeliveryDraft(existingOrder)
        : { date: '', time: '' };
      const afterDelivery = {
        date: editDraft.deliveryDate,
        time: editDraft.deliveryTime,
      };
      const beforeQty = existingOrder?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;
      const itemsPayload = filledItems.map((item) => ({
        sku: item.sku.trim() || '-',
        name: item.name.trim(),
        purity: item.purity.trim() || '-',
        weight: item.weight.trim() || '0',
        qty: toPositiveInt(item.qty),
        unitPrice: toNonNegativeNumber(item.unitPrice),
        note: item.note.trim() || undefined,
      })) satisfies ImportOrderItemInput[];
      const afterQty = itemsPayload.reduce((sum, item) => sum + item.qty, 0);
      const firstItem = itemsPayload[0]!;
      const nextMissingFields = [
        !editDraft.customerName.trim() && 'customerName',
        !editDraft.customerPhone.trim() && 'customerPhone',
        !fullAddress.trim() && 'customerAddress',
      ].filter(Boolean) as string[];
      // คอลัมน์สินค้าใน rawData เป็นตัวแทนของแถวต้นทาง (รับได้ 1 SKU) — ใช้ SKU แรก
      const nextRawData = {
        ...editDraft.rawData,
        customerName: editDraft.customerName.trim(),
        customerPhone: editDraft.customerPhone.trim(),
        customerAddress: fullAddress.trim(),
        itemName: firstItem.name,
        sku: firstItem.sku,
        purity: firstItem.purity,
        weight: firstItem.weight,
        qty: String(firstItem.qty),
        unitPrice: String(firstItem.unitPrice),
        totalValue: String(toNonNegativeNumber(editDraft.totalValue)),
        payment: normalizePaymentMethod(editDraft.payment),
        note: editDraft.note.trim(),
        [SOURCE_MISSING_FIELDS_COLUMN]: nextMissingFields.join(','),
        [SOURCE_EXTRACTION_CONFIDENCE_COLUMN]:
          nextMissingFields.length === 0
            ? String(Math.max(editingRow.extractionConfidence ?? 0, 90))
            : String(editingRow.extractionConfidence ?? 60),
      };
      const changeRows = [
        beforeDelivery.date !== afterDelivery.date && {
          field: 'deliveryPlan.plannedDate',
          label: 'วันนัดส่ง',
          before: beforeDelivery.date || undefined,
          after: afterDelivery.date || undefined,
        },
        beforeDelivery.time !== afterDelivery.time && {
          field: 'deliveryPlan.plannedTime',
          label: 'เวลานัดส่ง',
          before: beforeDelivery.time || undefined,
          after: afterDelivery.time || undefined,
        },
        beforeQty !== afterQty && {
          field: 'items.qty',
          label: 'จำนวนสินค้า',
          before: beforeQty ? `${beforeQty} ชิ้น` : undefined,
          after: `${afterQty} ชิ้น`,
        },
      ].filter(Boolean);

      await updateImportedOrder(editingRow.orderId, {
        rawData: nextRawData,
        customer: {
          name: editDraft.customerName.trim(),
          phone: editDraft.customerPhone.trim(),
          address: fullAddress.trim(),
          idCard: editDraft.customerIdCard.trim() || undefined,
        },
        items: itemsPayload,
        totalValue: toNonNegativeNumber(editDraft.totalValue),
        payment: normalizePaymentMethod(editDraft.payment),
        note: buildNoteWithRequestedDelivery(editDraft.note.trim(), afterDelivery).trim() || null,
      });
      if (changeRows.length > 0) {
        await addOrderActivity(editingRow.orderId, {
          type: 'order_details_updated',
          actor: {
            kind: 'operator',
            handler: existingOrder?.handledBy ?? {
              name: 'พนักงาน Ausiris',
              department: 'Import Review',
            },
          },
          summary: 'แก้ไขวันนัด / จำนวนสินค้า',
          details: `${editingRow.fileName} · แถวที่ ${editingRow.rowIndex + 1}`,
          changes: changeRows,
        });
      }
      await Promise.all([reloadDetails(), syncFromBackend()]);
      toast.success('บันทึกข้อมูลจาก LINE import แล้ว');
      setEditingRow(null);
      setEditDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (details.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูลนำเข้า</div>;
  }

  const title = scope === ALL_SCOPE ? `รวมทุกรายการ (${details.length})` : details[0].fileName;
  const showFile = scope === ALL_SCOPE;
  const errorSummary = scope === ALL_SCOPE ? null : details[0].errorSummary;
  const senderName =
    scope === ALL_SCOPE
      ? null
      : details[0].lineSenderDisplayName?.trim() ||
        (details[0].lineSenderUserId ? `LINE ${details[0].lineSenderUserId.slice(0, 8)}...` : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header + summary */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {scope === ALL_SCOPE ? (
              <Layers className="h-4 w-4 text-primary" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-success" />
            )}
            <span className="text-sm font-medium">{title}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {senderName && (
              <span className="inline-flex items-center gap-1">
                {details[0].lineSenderPictureUrl ? (
                  <img
                    src={details[0].lineSenderPictureUrl}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <UserRound className="h-3 w-3 shrink-0" />
                )}
                ส่งโดย {senderName}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3 text-muted-foreground" />
              {stats.total} ออเดอร์ · {stats.totalRows} แถว · มูลค่ารวม {formatTHB(stats.value)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {reviewIds.length > 0 && (
            <>
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as ShippingMethod)}
                className="h-8 text-xs"
              >
                <option value="internal_driver">คนขับภายใน</option>
                <option value="thai_post">ไปรษณีย์ไทย</option>
              </Select>
              <Button type="button" size="sm" disabled={busy} onClick={approveAllInScope}>
                <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติทั้งหมด ({reviewIds.length})
              </Button>
            </>
          )}
          {scope !== ALL_SCOPE && details[0] && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={downloadingBatchId === details[0].id}
              onClick={() => onDownloadBatch(details[0])}
            >
              {downloadingBatchId === details[0].id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export Text/CSV
            </Button>
          )}
        </div>
      </div>

      {/* กำลังนำเข้า — batch ยังประมวลผลอยู่ใน backend; รายการจะเด้งเข้ามาเองเมื่อเสร็จ (auto-poll) */}
      {processingBatches.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-info/40 bg-info/5 px-3 py-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-info">
              {scope === ALL_SCOPE
                ? `กำลังนำเข้า ${processingBatches.length} ไฟล์จาก LINE…`
                : 'กำลังอ่านข้อมูลจากไฟล์นี้…'}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              ระบบกำลังแปลงไฟล์เป็นออเดอร์ — รายการจะปรากฏที่นี่อัตโนมัติเมื่อเสร็จ ไม่ต้องรีเฟรช
            </div>
          </div>
          {(() => {
            const totalRows = processingBatches.reduce((sum, b) => sum + b.totalRows, 0);
            const importedRows = processingBatches.reduce((sum, b) => sum + b.importedRows, 0);
            return totalRows > 0 ? (
              <span className="shrink-0 text-xs font-medium tabular-nums text-info">
                {importedRows}/{totalRows} แถว
              </span>
            ) : null;
          })()}
        </div>
      )}

      {/* status tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TabChip
          active={tab === 'review'}
          onClick={() => selectTab('review')}
          label="รอตรวจ"
          count={stats.review + stats.error}
          tone="accent"
        />
        <TabChip
          active={tab === 'approved'}
          onClick={() => selectTab('approved')}
          label="อนุมัติแล้ว"
          count={stats.approved}
          tone="success"
        />
        <TabChip
          active={tab === 'rejected'}
          onClick={() => selectTab('rejected')}
          label="ปฏิเสธ"
          count={stats.rejected}
          tone="muted"
        />
        <TabChip
          active={tab === 'all'}
          onClick={() => selectTab('all')}
          label="ทั้งหมด"
          count={stats.total}
          tone="accent"
        />
      </div>

      {/* กลุ่มที่น่าจะรวมได้ — เสนอเท่านั้น admin ตัดสินใจกดรวมเอง (บางไฟล์ตั้งใจเป็นหลายออเดอร์จริง) */}
      {(tab === 'review' || tab === 'all') &&
        mergeSuggestions.map((suggestion) => (
          <div
            key={suggestion.key}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/40 bg-info/5 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <Merge className="h-3.5 w-3.5 shrink-0 text-info" />
              <span className="min-w-0">
                พบ {suggestion.rowIndexes.length} แถว (แถวที่{' '}
                {suggestion.rowIndexes.map((i) => i + 1).join(', ')}) ที่เบอร์+ที่อยู่เดียวกัน —
                อาจเป็น 1 ออเดอร์ / {suggestion.rowIndexes.length} SKU
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-info/60 text-xs text-info hover:bg-info/10"
              disabled={busy}
              onClick={() => mergeOrders(suggestion.orderIds)}
            >
              <Merge className="h-3 w-3" /> รวมเป็น 1 ออเดอร์
            </Button>
          </div>
        ))}

      {/* order review list */}
      <div
        className={cn(
          'mt-3 min-h-0 flex-1 space-y-2 overflow-auto rounded-lg border bg-muted/20 p-2',
          editingRow && 'max-h-72 flex-none',
        )}
      >
        <div className="sticky top-0 z-10 -mx-2 -mt-2 flex items-center justify-between gap-2 border-b bg-muted/90 px-3 py-2 text-xs backdrop-blur">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              aria-label="เลือกทั้งหมดที่รอตรวจ"
              checked={allSelected}
              onChange={toggleAll}
              disabled={selectableIds.length === 0}
              className="h-3.5 w-3.5"
            />
            เลือกออเดอร์รอตรวจ
          </label>
          <span className="text-muted-foreground">
            {visibleCards.length.toLocaleString('th-TH')} รายการ
          </span>
        </div>

        {visibleCards.length === 0 && (
          <div className="px-3 py-10 text-center">
            {processingBatches.length > 0 ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-info" />
                <div className="text-sm">กำลังประมวลผลไฟล์นำเข้า…</div>
                <div className="text-[11px]">
                  ออเดอร์จะแสดงที่นี่อัตโนมัติเมื่อระบบอ่านข้อมูลเสร็จ
                </div>
              </div>
            ) : (
              <TabEmptyState tab={tab} stats={stats} onJump={selectTab} />
            )}
          </div>
        )}

        {visibleCards.map((card) => {
          const r = card.primary;
          const order = card.orderId ? ordersById.get(card.orderId) : undefined;
          const selectable = card.kind === 'review' && !!card.orderId && !!order;
          const checked = !!card.orderId && selected.has(card.orderId);
          const editable = !!card.orderId && card.kind !== 'error';
          const showFastDispatchAction = !!card.orderId && canOpenFastDispatch(card, order);
          const showPlanningAction = !!card.orderId && canOpenPlanning(card, order);
          const deliveryQueueBadge = getDeliveryQueueBadge(order);
          const rowLabel =
            card.rows.length === 1
              ? `แถว ${r.rowIndex + 1}`
              : `แถว ${card.rows.map((row) => row.rowIndex + 1).join(', ')}`;
          const { skuCount, totalQty } = orderItemStats(order);
          const skuSummary =
            skuCount > 0
              ? `${skuCount.toLocaleString('th-TH')} SKU · ${totalQty.toLocaleString('th-TH')} ชิ้น`
              : r.item;

          return (
            <div
              key={card.key}
              className={cn(
                'rounded-lg border bg-background p-3 transition-colors hover:border-border',
                checked && 'border-primary/40 bg-primary/5',
                card.kind === 'rejected' && 'bg-muted/40 text-muted-foreground',
              )}
            >
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`เลือกออเดอร์จาก${rowLabel}`}
                      checked={checked}
                      disabled={!selectable}
                      onChange={() => card.orderId && toggle(card.orderId)}
                      className="h-3.5 w-3.5 disabled:opacity-30"
                    />
                    <RowStatusBadge kind={card.kind} />
                    {deliveryQueueBadge && (
                      <Badge variant="success" className="h-5 gap-1 px-1.5 text-[10px]">
                        <Route className="h-3 w-3" />
                        {deliveryQueueBadge}
                      </Badge>
                    )}
                    {card.rows.length > 1 && (
                      <Badge variant="info" className="h-5 gap-1 px-1.5 text-[10px]">
                        <Layers className="h-3 w-3" />
                        รวม {card.rows.length} แถว
                      </Badge>
                    )}
                    {skuSummary && (
                      <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px]">
                        <Package className="h-3 w-3" />
                        {skuSummary}
                      </Badge>
                    )}
                    {r.imageDataUrl && (
                      <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px]">
                        <ImageIcon className="h-3 w-3" />
                        รูปต้นฉบับ
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {showFile ? `${r.fileName} · ${rowLabel}` : rowLabel}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'mt-2 truncate text-sm font-semibold',
                      card.kind === 'rejected' && 'line-through',
                    )}
                  >
                    {r.name}
                  </div>

                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {card.kind === 'error' && r.errorMessage ? (
                      <span className="text-destructive">{r.errorMessage}</span>
                    ) : (
                      r.address
                    )}
                  </div>

                  {order ? (
                    <OrderItemPreviewList order={order} />
                  ) : (
                    r.item && (
                      <div className="mt-2 flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.item}</span>
                      </div>
                    )
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-2 xl:w-[230px]">
                  <div className="flex items-baseline justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 xl:block xl:text-right">
                    <div className="text-[11px] text-muted-foreground">มูลค่ารวม</div>
                    <div className="text-sm font-semibold tabular-nums text-warning">
                      {r.value != null ? formatTHB(r.value) : '—'}
                    </div>
                  </div>

                  {/* ปุ่มเรียงเป็น grid 2 คอลัมน์ขนาดเท่ากัน (จำนวนคี่ → ปุ่มสุดท้ายเต็มแถว)
                      เรียงตามความสำคัญ: อนุมัติ/Fast Dispatch ก่อน, ปฏิเสธไว้ท้ายสุด */}
                  <div className="grid grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
                    {showFastDispatchAction && onFastDispatchOrder && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approveAndOpenFastDispatch(card.orderId!)}
                            className={cn(
                              CARD_ACTION_CLASS,
                              'border-primary bg-primary/5 text-primary hover:bg-primary/10',
                            )}
                          >
                            <Send className="h-3 w-3" />
                            ส่งทันที
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" className="max-w-[240px]">
                          <p className="font-semibold">อนุมัติแล้วไปหน้าส่งทันที</p>
                          <p className="mt-0.5 font-normal leading-snug text-background/80">
                            เปิดหน้า “ส่งทันที” พร้อมโฟกัส order นี้ให้เลย — เลือกคนขับแล้วมอบงานให้
                            Messenger ได้ทันที
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {showPlanningAction && onPlanningOrder && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => approveAndOpenPlanning(card.orderId!)}
                            className={cn(
                              CARD_ACTION_CLASS,
                              'border-info/50 bg-info/5 text-info hover:bg-info/10',
                            )}
                          >
                            <CalendarDays className="h-3 w-3" />
                            จัดรอบส่ง
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" className="max-w-[240px]">
                          <p className="font-semibold">อนุมัติแล้วไปหน้า Planning</p>
                          <p className="mt-0.5 font-normal leading-snug text-background/80">
                            เปิดหน้า Planning พร้อมโฟกัส order นี้ในลิสต์ “รอจัดรอบ” —
                            เลือกวัน/เวลา/คนขับ แล้วบันทึกเพื่อมอบงานให้ Messenger
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {card.kind === 'review' && card.orderId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runAction('อนุมัติ 1 รายการ', () =>
                            approveImportOrders([card.orderId!], method),
                          )
                        }
                        className={cn(
                          CARD_ACTION_CLASS,
                          'border-success/60 text-success hover:bg-success/10',
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        อนุมัติ
                      </button>
                    )}
                    {editable && (
                      <button
                        type="button"
                        disabled={busy || savingEdit}
                        onClick={() => startEditRow(r)}
                        className={cn(
                          CARD_ACTION_CLASS,
                          'border-border text-foreground hover:bg-muted',
                        )}
                      >
                        <Pencil className="h-3 w-3" />
                        แก้ไข
                      </button>
                    )}
                    {r.imageDataUrl && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPreviewImage({
                            src: r.imageDataUrl!,
                            fileName: r.fileName,
                            rowIndex: r.rowIndex,
                          })
                        }
                        className={cn(
                          CARD_ACTION_CLASS,
                          'border-border text-foreground hover:bg-muted',
                        )}
                      >
                        <Eye className="h-3 w-3" />
                        ดูรูป
                      </button>
                    )}
                    {card.kind === 'review' && card.orderId && card.rows.length > 1 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => splitCard(card)}
                            className={cn(
                              CARD_ACTION_CLASS,
                              'border-border text-foreground hover:bg-muted',
                            )}
                          >
                            <Split className="h-3 w-3" />
                            แยกตามแถว
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="end" className="max-w-[240px]">
                          <p className="font-semibold">แยกตามแถวต้นทาง</p>
                          <p className="mt-0.5 font-normal leading-snug text-background/80">
                            แตกกลับเป็น {card.rows.length} ออเดอร์ตามแถวเดิมในไฟล์ —
                            ใช้เมื่อรวมผิดหรือไฟล์ตั้งใจให้เป็นคนละออเดอร์
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {card.kind === 'review' && card.orderId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void rejectOrders([card.orderId!])}
                        className={cn(
                          CARD_ACTION_CLASS,
                          'border-border text-muted-foreground hover:bg-muted',
                        )}
                      >
                        <XCircle className="h-3 w-3" />
                        ปฏิเสธ
                      </button>
                    )}
                    {card.kind === 'rejected' && card.orderId && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runAction('ดึงกลับ 1 รายการ', () => restoreImportOrders([card.orderId!]))
                        }
                        className={cn(
                          CARD_ACTION_CLASS,
                          'border-border text-foreground hover:bg-muted',
                        )}
                      >
                        <RotateCcw className="h-3 w-3" /> ดึงกลับ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {editingRow && editDraft && (
        <div className="mt-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">แก้ไขข้อมูลจาก LINE import</div>
              <div className="text-xs text-muted-foreground">
                {editingRow.fileName} · แถวที่ {editingRow.rowIndex + 1}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={savingEdit}
                onClick={() => {
                  setEditingRow(null);
                  setEditDraft(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button type="button" size="sm" disabled={savingEdit} onClick={saveEditRow}>
                {savingEdit ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                บันทึก
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">ชื่อผู้รับ</span>
              <input
                value={editDraft.customerName}
                onChange={(e) => setEditDraft({ ...editDraft, customerName: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">เบอร์โทร</span>
              <input
                value={editDraft.customerPhone}
                onChange={(e) => setEditDraft({ ...editDraft, customerPhone: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">เลขบัตร</span>
              <input
                value={editDraft.customerIdCard}
                onChange={(e) => setEditDraft({ ...editDraft, customerIdCard: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
            <div className="space-y-2 text-xs md:col-span-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">ที่อยู่ (บ้านเลขที่ / ถนน)</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={autoFilling || !editDraft.customerAddress.trim()}
                  onClick={() => applyAutoFill(editDraft.customerAddress)}
                  title="แยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ จากข้อความที่อยู่อัตโนมัติ"
                >
                  {autoFilling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  เติมอัตโนมัติ
                </Button>
              </div>
              <input
                value={editDraft.customerAddress}
                onChange={(e) => setEditDraft({ ...editDraft, customerAddress: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
              <ThaiAddressPicker
                value={editDraft.addr}
                onChange={(addr) => setEditDraft({ ...editDraft, addr })}
              />
              <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-muted-foreground">
                ที่อยู่เต็ม: {composeThaiAddress(editDraft.customerAddress, editDraft.addr) || '—'}
              </p>
            </div>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">มูลค่ารวม</span>
              <input
                inputMode="decimal"
                value={editDraft.totalValue}
                onChange={(e) => setEditDraft({ ...editDraft, totalValue: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">วันนัดส่ง</span>
              <input
                type="date"
                value={editDraft.deliveryDate}
                onChange={(e) => setEditDraft({ ...editDraft, deliveryDate: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">เวลานัดส่ง</span>
              <input
                type="time"
                value={editDraft.deliveryTime}
                onChange={(e) => setEditDraft({ ...editDraft, deliveryTime: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">การชำระเงิน</span>
              <Select
                value={editDraft.payment}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, payment: e.target.value as Order['payment'] })
                }
                className="h-8"
              >
                <option value="prepaid">โอนแล้ว</option>
                <option value="cod">เก็บเงินปลายทาง</option>
                <option value="transfer_on_delivery">โอนตอนส่ง</option>
              </Select>
            </label>
            <label className="space-y-1 text-xs md:col-span-4">
              <span className="text-muted-foreground">หมายเหตุ</span>
              <input
                value={editDraft.note}
                onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3"
              />
            </label>
          </div>

          <div className="mt-3 rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="text-xs font-medium">
                สินค้าในออเดอร์
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {editDraft.items.length.toLocaleString('th-TH')} SKU ·{' '}
                  {editDraft.items
                    .reduce((sum, item) => sum + toPositiveInt(item.qty), 0)
                    .toLocaleString('th-TH')}{' '}
                  ชิ้น
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                disabled={savingEdit}
                onClick={addItemDraft}
              >
                <Plus className="h-3 w-3" /> เพิ่ม SKU
              </Button>
            </div>
            <div className="hidden gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground md:grid md:grid-cols-[2fr_1fr_1fr_1fr_72px_1fr_32px]">
              <span>สินค้า</span>
              <span>SKU</span>
              <span>Purity</span>
              <span>น้ำหนัก</span>
              <span>จำนวน</span>
              <span>ราคา/ชิ้น</span>
              <span />
            </div>
            <div className="divide-y">
              {editDraft.items.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-2 px-3 py-2 md:grid-cols-[2fr_1fr_1fr_1fr_72px_1fr_32px] md:items-center"
                >
                  <input
                    value={item.name}
                    placeholder="ชื่อสินค้า"
                    aria-label={`สินค้า SKU ที่ ${index + 1}`}
                    onChange={(e) => updateItemDraft(index, { name: e.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-3 text-xs"
                  />
                  <input
                    value={item.sku}
                    placeholder="SKU"
                    aria-label={`รหัส SKU ที่ ${index + 1}`}
                    onChange={(e) => updateItemDraft(index, { sku: e.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-3 text-xs"
                  />
                  <input
                    value={item.purity}
                    placeholder="Purity"
                    aria-label={`Purity SKU ที่ ${index + 1}`}
                    onChange={(e) => updateItemDraft(index, { purity: e.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-3 text-xs"
                  />
                  <input
                    value={item.weight}
                    placeholder="น้ำหนัก"
                    aria-label={`น้ำหนัก SKU ที่ ${index + 1}`}
                    onChange={(e) => updateItemDraft(index, { weight: e.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-3 text-xs"
                  />
                  <input
                    inputMode="numeric"
                    value={item.qty}
                    placeholder="จำนวน"
                    aria-label={`จำนวน SKU ที่ ${index + 1}`}
                    onChange={(e) => updateItemDraft(index, { qty: e.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-3 text-xs"
                  />
                  <input
                    inputMode="decimal"
                    value={item.unitPrice}
                    placeholder="ราคา/ชิ้น"
                    aria-label={`ราคาต่อชิ้น SKU ที่ ${index + 1}`}
                    onChange={(e) => updateItemDraft(index, { unitPrice: e.target.value })}
                    className="h-8 w-full rounded-md border bg-background px-3 text-xs"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 justify-self-end text-muted-foreground hover:text-destructive"
                    aria-label={`ลบ SKU ที่ ${index + 1}`}
                    disabled={savingEdit || editDraft.items.length <= 1}
                    onClick={() => removeItemDraft(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {editingRow.ocrText && (
            <div className="mt-3 rounded-md border bg-background">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <div className="text-xs font-medium">ข้อความ OCR จากรูป</div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="คัดลอกข้อความ OCR ทั้งหมด"
                  className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                  onClick={async () => {
                    const copied = await copyTextToClipboard(
                      ocrPlainText(displayOcrText(editingRow)),
                    );
                    if (copied) {
                      toast.success('คัดลอกข้อความ OCR ทั้งหมดแล้ว');
                    } else {
                      toast.error('คัดลอกไม่สำเร็จ — กรุณาเลือกข้อความแล้วคัดลอกเอง');
                    }
                  }}
                >
                  <Copy className="h-3 w-3" /> คัดลอกทั้งหมด
                </Button>
              </div>
              <div
                className="min-h-24 w-full max-w-full resize overflow-auto px-3 py-2 text-xs leading-5"
                style={{
                  height: `${Math.min(13, Math.max(6, ocrDisplayLines(displayOcrText(editingRow)).length * 1.25 + 1.5))}rem`,
                }}
              >
                {ocrDisplayLines(displayOcrText(editingRow)).map((line, index) =>
                  line.kind === 'blank' ? (
                    <div key={index} className="h-2" />
                  ) : line.kind === 'heading' ? (
                    <div key={index} className="mt-1 font-semibold first:mt-0">
                      {line.text}
                    </div>
                  ) : line.kind === 'bullet' ? (
                    <div key={index} className="flex gap-1.5">
                      <span className="shrink-0 text-muted-foreground">•</span>
                      <span className="min-w-0 break-words">{line.text}</span>
                    </div>
                  ) : (
                    <div key={index} className="break-words">
                      {line.text}
                    </div>
                  ),
                )}
              </div>
            </div>
          )}

          <div className="mt-3 rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="text-xs font-medium">ข้อมูลต้นทาง</div>
              <div className="text-[11px] text-muted-foreground">
                {visibleRawEntries(editDraft.rawData).length} คอลัมน์
              </div>
            </div>
            <div className="divide-y">
              {visibleRawEntries(editDraft.rawData).map(([key, value]) => (
                <div key={key} className="grid gap-2 px-3 py-2 md:grid-cols-[180px_1fr]">
                  <div className="min-w-0 break-words rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {key}
                  </div>
                  <textarea
                    value={value}
                    rows={value.length > 48 || value.includes('\n') ? 2 : 1}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        rawData: { ...editDraft.rawData, [key]: e.target.value },
                      })
                    }
                    className="min-h-8 w-full min-w-0 resize-y rounded-md border bg-background px-3 py-1.5 font-mono text-xs leading-5"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="ดูรูปต้นฉบับจาก LINE"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{previewImage.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  แถวที่ {previewImage.rowIndex + 1} · รูปต้นฉบับจาก LINE
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => setPreviewImage(null)}
                aria-label="ปิดรูป"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-3">
              <img
                src={previewImage.src}
                alt=""
                className="max-h-[78vh] max-w-full rounded-md object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {errorSummary && stats.error > 0 && tab !== 'approved' && tab !== 'rejected' && (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <div className="mb-1 text-[11px] font-medium text-destructive">สาเหตุข้อผิดพลาด</div>
          <pre className="whitespace-pre-wrap text-[10px] text-destructive/80">{errorSummary}</pre>
        </div>
      )}

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
          <span className="text-xs font-medium text-primary">เลือก {selected.size} รายการ</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value as ShippingMethod)}
              className="h-8 text-xs"
            >
              <option value="internal_driver">คนขับภายใน</option>
              <option value="thai_post">ไปรษณีย์ไทย</option>
            </Select>
            <Button size="sm" disabled={busy} onClick={bulkApprove}>
              <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ ({selected.size})
            </Button>
            {selected.size >= 2 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => mergeOrders([...selected])}
                  >
                    <Merge className="h-3.5 w-3.5" /> รวมเป็น 1 ออเดอร์
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  <p className="font-semibold">รวม {selected.size} รายการเป็นออเดอร์เดียว</p>
                  <p className="mt-0.5 font-normal leading-snug text-background/80">
                    สินค้าทุก SKU และแถวต้นทางย้ายไปอยู่ออเดอร์แรกที่เลือก ยอดรวมถูกบวกให้ —
                    แยกกลับได้ด้วย “แยกตามแถว”
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <Separator orientation="vertical" className="h-6" />
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as ImportRejectReason | '')}
              className="h-8 text-xs"
            >
              <option value="">เหตุผล (ไม่บังคับ)</option>
              {REJECT_REASONS.map((value) => (
                <option key={value} value={value}>
                  {importRejectReasonLabel[value]}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" disabled={busy} onClick={bulkReject}>
              <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportBatchPanel({
  onFastDispatchOrder,
  onPlanningOrder,
}: {
  onFastDispatchOrder?: (orderId: string) => void;
  onPlanningOrder?: (orderId: string) => void;
}) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedId, setSelectedId] = useState<string>(ALL_SCOPE);
  const [readBatchIds, setReadBatchIds] = useState<Set<string>>(() => readStoredBatchIds());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [range, setRange] = useState<DateRange | undefined>();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(() => readStoredListCollapsed());
  const listRef = useRef<HTMLDivElement>(null);
  // กันยิงซ้ำระหว่างกำลังโหลดหน้าใหม่ (ref อ่านได้ทันทีไม่ต้องรอ re-render)
  const loadingRef = useRef(false);
  const pageRef = useRef(1);

  const customMode = days === CUSTOM_DAYS;
  const rangeReady = !!(range?.from && range?.to);
  // พารามิเตอร์ช่วงเวลาที่จะส่งให้ backend — null = โหมดกำหนดเองแต่ยังเลือกไม่ครบ (ยังไม่ยิง)
  const windowParams = useMemo<{ days?: number; from?: string; to?: string } | null>(() => {
    if (!customMode) return { days };
    if (range?.from && range?.to) {
      return { from: format(range.from, 'yyyy-MM-dd'), to: format(range.to, 'yyyy-MM-dd') };
    }
    return null;
  }, [customMode, days, range]);
  // key คงที่สำหรับ dep ของ reload — กัน object identity เปลี่ยนทุก render
  const windowKey = windowParams ? JSON.stringify(windowParams) : 'pending';

  const toggleListCollapsed = () => {
    setListCollapsed((prev) => {
      const next = !prev;
      writeStoredListCollapsed(next);
      return next;
    });
  };

  const markBatchRead = (batchId: string) => {
    setReadBatchIds((current) => {
      if (current.has(batchId)) return current;
      const next = new Set(current);
      next.add(batchId);
      writeStoredBatchIds(next);
      return next;
    });
  };

  const exportBatchCsv = async (batch: Pick<ImportBatch, 'id' | 'fileName'>) => {
    setDownloadingBatchId(batch.id);
    try {
      const result = await downloadImportBatchCsv(batch.id);
      downloadCsv(result.fileName ?? batch.fileName, result.content);
      toast.success(`บันทึกไฟล์ ${result.fileName ?? batch.fileName} แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export ไม่สำเร็จ');
    } finally {
      setDownloadingBatchId(null);
    }
  };

  // โหลดหน้าแรก (reset) ตามช่วงเวลาปัจจุบัน
  const reload = useCallback(() => {
    if (loadingRef.current) return;
    // โหมดกำหนดเองแต่ยังเลือกช่วงไม่ครบ → ล้างรายการ รอผู้ใช้เลือก
    if (!windowParams) {
      setBatches([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      return;
    }
    loadingRef.current = true;
    setLoading(true);
    pageRef.current = 1;
    fetchImportBatches({ page: 1, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        setBatches(res.batches);
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch((error) => {
        console.error(error);
        toast.error('โหลดประวัติการนำเข้าไม่สำเร็จ');
      })
      .finally(() => {
        setLoading(false);
        loadingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  // โหลดหน้าถัดไปต่อท้าย (infinite scroll)
  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore || !windowParams) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    fetchImportBatches({ page: nextPage, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        pageRef.current = nextPage;
        // กันรายการซ้ำ (เผลอมีไฟล์ใหม่เข้ามาระหว่างเลื่อน) — dedupe ตาม id
        setBatches((prev) => {
          const seen = new Set(prev.map((b) => b.id));
          return [...prev, ...res.batches.filter((b) => !seen.has(b.id))];
        });
        setTotal(res.total);
        setHasMore(res.hasMore);
      })
      .catch((error) => {
        console.error(error);
        toast.error('โหลดรายการเพิ่มไม่สำเร็จ');
      })
      .finally(() => {
        setLoadingMore(false);
        loadingRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, windowKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  // จำนวน batch ปัจจุบัน (อ่านใน poll callback ที่ต้อง stable identity)
  const batchCountRef = useRef(0);
  useEffect(() => {
    batchCountRef.current = batches.length;
  }, [batches.length]);

  // refresh เบื้องหลังแบบเงียบ ๆ — ดึงหน้าแรกมา merge ทับของเดิม (อัปเดตสถานะ batch ที่กำลังประมวลผล
  // + เติมไฟล์ใหม่ที่เพิ่งเข้ามาจาก LINE) โดยไม่รีเซ็ตหน้าที่ infinite-scroll โหลดไว้แล้ว
  const pollRefresh = useCallback(() => {
    if (loadingRef.current || !windowParams) return;
    fetchImportBatches({ page: 1, limit: BATCH_PAGE_SIZE, ...windowParams })
      .then((res) => {
        setBatches((prev) => {
          if (prev.length === 0) return res.batches;
          const incomingById = new Map(res.batches.map((b) => [b.id, b]));
          const seen = new Set(prev.map((b) => b.id));
          const merged = prev.map((b) => incomingById.get(b.id) ?? b);
          const fresh = res.batches.filter((b) => !seen.has(b.id));
          return fresh.length > 0 ? [...fresh, ...merged] : merged;
        });
        setTotal(res.total);
        if (batchCountRef.current === 0) setHasMore(res.hasMore);
      })
      .catch(() => {
        // เงียบ — เป็น background poll ไม่ต้องรบกวนผู้ใช้ด้วย toast
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  const inProgressCount = batches.filter(
    (b) => b.status === 'PENDING' || b.status === 'PROCESSING',
  ).length;

  // มี batch กำลังประมวลผล → poll ถี่เพื่อโชว์ความคืบหน้าแบบเรียลไทม์;
  // ปกติ → poll ห่างเพื่อรับไฟล์/รูปใหม่จาก LINE เข้ามาเองโดยไม่ต้องกด refresh
  useEffect(() => {
    if (!windowParams) return;
    const intervalMs = inProgressCount > 0 ? 3000 : 20000;
    const timer = window.setInterval(pollRefresh, intervalMs);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgressCount > 0, windowKey, pollRefresh]);

  // เลื่อน scrollbar ลงใกล้สุด → โหลดหน้าถัดไป
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el || !hasMore || loadingRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) loadMore();
  }, [hasMore, loadMore]);

  // ถ้าหน้าแรกสั้นจนไม่มี scrollbar แต่ยังมีรายการต่อ → โหลดต่อเองให้เลื่อนได้
  useEffect(() => {
    const el = listRef.current;
    if (!el || loading || loadingMore || !hasMore) return;
    if (el.scrollHeight <= el.clientHeight) loadMore();
  }, [loading, loadingMore, hasMore, batches.length, loadMore]);

  const hasBatches = batches.length > 0;
  const unreadCount = batches.filter((batch) => !readBatchIds.has(batch.id)).length;
  const workspaceKey =
    selectedId === ALL_SCOPE ? `all:${batches.map((b) => b.id).join(',')}` : selectedId;

  if (listCollapsed) {
    return (
      <div className="grid gap-4 lg:grid-cols-[44px_1fr]">
        <Card className="flex h-[calc(100vh-16rem)] flex-col items-center gap-2 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={toggleListCollapsed}
                aria-label="ขยายรายการไฟล์/รูปนำเข้า"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">ขยายรายการนำเข้า</TooltipContent>
          </Tooltip>
          {unreadCount > 0 && (
            <Badge variant="info" className="h-5 min-w-5 justify-center px-1 text-[10px]">
              {unreadCount}
            </Badge>
          )}
          <span
            className="mt-1 text-[11px] font-medium text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            รายการนำเข้า
          </span>
        </Card>

        <Card className="app-scroll h-[calc(100vh-16rem)] overflow-auto p-4">
          {hasBatches ? (
            <BatchWorkspace
              key={workspaceKey}
              scope={selectedId}
              batches={batches}
              onFastDispatchOrder={onFastDispatchOrder}
              onPlanningOrder={onPlanningOrder}
              onDownloadBatch={(batch) => void exportBatchCsv(batch)}
              downloadingBatchId={downloadingBatchId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> ยังไม่มีรายการนำเข้า
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="flex h-[calc(100vh-16rem)] flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-medium">ไฟล์/รูปนำเข้าจาก LINE</span>
              {inProgressCount > 0 && (
                <Badge variant="info" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  นำเข้า {inProgressCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={reload}
                disabled={loading}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={toggleListCollapsed}
                    aria-label="หุบรายการไฟล์/รูปนำเข้า เพื่อขยายพื้นที่ทำงาน"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">หุบรายการ ขยายพื้นที่ทำงาน</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Select
              value={days}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDays(next);
                if (next === CUSTOM_DAYS && !rangeReady) setRangeOpen(true);
              }}
              disabled={loading}
              containerClassName="flex-1"
              className="h-8"
              aria-label="ช่วงเวลาย้อนหลัง"
            >
              {DAY_WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            {total > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {batches.length}/{total}
              </span>
            )}
          </div>
          {customMode && (
            <div className="mt-2 flex items-center gap-2">
              <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 flex-1 justify-start px-2 text-sm font-normal"
                  >
                    <CalendarDays className="mr-1.5 h-4 w-4" />
                    {rangeReady ? (
                      <span>
                        {format(range!.from!, 'd MMM yy', { locale: th })} –{' '}
                        {format(range!.to!, 'd MMM yy', { locale: th })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">เลือกช่วงวันที่</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    locale={th}
                    selected={range}
                    onSelect={setRange}
                    numberOfMonths={1}
                    disabled={{ after: new Date() }}
                    autoFocus
                  />
                </PopoverContent>
              </Popover>
              {range?.from && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="ล้างช่วงวันที่"
                  onClick={() => setRange(undefined)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <Separator />
        <CardContent
          ref={listRef}
          onScroll={handleScroll}
          className="app-scroll flex-1 space-y-2 overflow-auto p-3"
        >
          {loading && batches.length === 0 && (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && customMode && !rangeReady && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              เลือกช่วงวันที่เพื่อดูรายการ
              <div className="mt-1 text-[11px]">กดปุ่มปฏิทินด้านบนแล้วเลือกวันเริ่ม–สิ้นสุด</div>
            </div>
          )}
          {!loading && !hasBatches && !(customMode && !rangeReady) && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {customMode ? 'ไม่พบรายการในช่วงวันที่ที่เลือก' : 'ยังไม่มีการนำเข้าไฟล์หรือรูป'}
              <div className="mt-1 text-[11px]">
                {customMode ? 'ลองขยายช่วงวันที่' : 'ส่งไฟล์ .csv หรือรูปภาพใน LINE เพื่อเริ่มต้น'}
              </div>
            </div>
          )}
          {hasBatches && (
            <button
              type="button"
              onClick={() => setSelectedId(ALL_SCOPE)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                selectedId === ALL_SCOPE
                  ? 'border-border bg-muted'
                  : 'border-transparent hover:bg-muted/60',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Layers className="h-3.5 w-3.5 text-primary" /> ทุกรายการ (รวม)
              </span>
              <span className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                    ใหม่ {unreadCount}
                  </Badge>
                )}
                <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                  {batches.length} รายการ
                </Badge>
              </span>
            </button>
          )}
          {batches.map((batch) => (
            <BatchListItem
              key={batch.id}
              batch={batch}
              selected={selectedId === batch.id}
              unread={!readBatchIds.has(batch.id)}
              onClick={() => {
                markBatchRead(batch.id);
                setSelectedId(batch.id);
              }}
            />
          ))}
          {loadingMore && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && !loadingMore && hasBatches && !hasMore && (
            <div className="py-3 text-center text-[11px] text-muted-foreground">
              แสดงครบทุกรายการในช่วงเวลานี้แล้ว
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="app-scroll h-[calc(100vh-16rem)] overflow-auto p-4">
        {hasBatches ? (
          <BatchWorkspace
            key={workspaceKey}
            scope={selectedId}
            batches={batches}
            onFastDispatchOrder={onFastDispatchOrder}
            onPlanningOrder={onPlanningOrder}
            onDownloadBatch={(batch) => void exportBatchCsv(batch)}
            downloadingBatchId={downloadingBatchId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> ยังไม่มีรายการนำเข้า
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
