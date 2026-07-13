// สร้าง/แปลง draft ของฟอร์มแก้ไขออเดอร์นำเข้า + parser ค่าเล็ก ๆ (payment, number, postal)
// แยกออกจาก ImportBatchPanel เพราะเป็น pure function ไม่พึ่ง React
import type { Order } from '@/data/orderTypes';
import { fetchAddressSubdistricts } from '@/lib/retailApi';
import { EMPTY_THAI_ADDRESS, type ThaiAddressValue } from '@/lib/thaiAddress';
import {
  getRequestedDeliveryDraft,
  parseDeliveryFromText,
} from '@/features/inbox/utils/orderSchedule';
import { isOcrOnlyRaw, rawField } from './importRawFields';
import type { RowVM } from './importCardModel';

export type ImportItemDraft = {
  name: string;
  sku: string;
  purity: string;
  weight: string;
  qty: string;
  unitPrice: string;
  note: string;
};

export const EMPTY_ITEM_DRAFT: ImportItemDraft = {
  name: '',
  sku: '',
  purity: '',
  weight: '',
  qty: '1',
  unitPrice: '0',
  note: '',
};

export type ImportEditDraft = {
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

export function normalizePaymentMethod(value: unknown): Order['payment'] {
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

export function toPositiveInt(value: string, fallback = 1) {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

export function toNonNegativeNumber(value: string, fallback = 0) {
  const next = Number(value.replace(/,/g, ''));
  return Number.isFinite(next) && next >= 0 ? next : fallback;
}

export async function fillMissingPostalCode(addr: ThaiAddressValue): Promise<ThaiAddressValue> {
  if (/^\d{5}$/.test(addr.postalCode.trim())) return addr;
  if (!addr.province.trim() || !addr.district.trim() || !addr.subdistrict.trim()) return addr;
  const subdistricts = await fetchAddressSubdistricts(addr.province, addr.district);
  const match = subdistricts.find((item) => item.subdistrict === addr.subdistrict);
  return match?.postalCode ? { ...addr, postalCode: match.postalCode } : addr;
}

function requestedDeliveryFromRawData(rawData: Record<string, string>) {
  const fromColumns = parseDeliveryFromText(
    [
      rawField(
        rawData,
        'deliveryDate',
        'delivery_date',
        'scheduledDate',
        'วันนัดส่ง',
        'นัดส่ง',
        'วันส่ง',
      ),
      rawField(
        rawData,
        'deliveryTime',
        'delivery_time',
        'scheduledTime',
        'เวลานัดส่ง',
        'เวลา',
        'เวลาส่ง',
      ),
    ]
      .filter(Boolean)
      .join(' '),
  );
  if (fromColumns.date || fromColumns.time) return fromColumns;
  return parseDeliveryFromText(rawField(rawData, 'note', 'หมายเหตุ'));
}

// items ของออเดอร์ → ตารางแก้ไข: ใช้ของจริงจาก order ทุก SKU (รองรับออเดอร์หลายแถว/รวมแล้ว)
// ถ้ายังไม่มี order (แถว error) fallback เป็น item เดียวจาก rawData
export function itemDraftsFromRow(
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

export function draftFromRow(row: RowVM, order: Order | undefined): ImportEditDraft {
  const ocrOnly = row.ocrOnly || isOcrOnlyRaw(row.rawData);
  const rawTotalValue = Number(rawField(row.rawData, 'totalValue', 'total', 'ราคารวม', 'มูลค่า'));
  const rawPayment = rawField(row.rawData, 'payment', 'การชำระ', 'ชำระ');
  const rawDelivery = requestedDeliveryFromRawData(row.rawData);
  const orderDelivery = order ? getRequestedDeliveryDraft(order) : { date: '', time: '' };
  // หน้า import ต้องยึดค่าจากแถวไฟล์ที่กำลังตรวจเป็นหลัก เพราะ metadata/deliveryPlan
  // ระดับออเดอร์อาจเป็นค่าจากแถวเดิมหรือแผนส่งเก่าที่ยังค้างอยู่
  const requestedDelivery = {
    date: rawDelivery.date || orderDelivery.date,
    time: rawDelivery.time || orderDelivery.time,
  };
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

export function getRowRequestedDelivery(row: RowVM, order: Order | undefined) {
  const rawDelivery = requestedDeliveryFromRawData(row.rawData);
  if (!order) return rawDelivery;

  const orderDelivery = getRequestedDeliveryDraft(order);
  return {
    date: rawDelivery.date || orderDelivery.date,
    time: rawDelivery.time || orderDelivery.time,
  };
}
