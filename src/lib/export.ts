import type { Order, PostalService } from '@/data/orderTypes';
import { postalServiceLabel } from '@/data/orderTypes';

const POSTAL_CSV_HEADERS = [
  'ลำดับ',
  'เลขที่อ้างอิง',
  'บริการ',
  'ชื่อผู้รับ',
  'เบอร์โทร',
  'ที่อยู่',
  'รหัสไปรษณีย์',
  'น้ำหนัก (กรัม)',
  'มูลค่าประกัน (บาท)',
  'COD (บาท)',
  'หมายเหตุ',
] as const;

function extractPostcode(address: string): string {
  const match = address.match(/\b\d{5}\b/);
  return match?.[0] ?? '';
}

function sumWeightGrams(order: Order): number {
  let total = 0;
  for (const item of order.items) {
    const match = item.weight.match(/([\d,.]+)\s*(ก\.|กรัม|g)/i);
    if (match) {
      const grams = Number.parseFloat(match[1].replace(/,/g, ''));
      if (!Number.isNaN(grams)) total += grams * item.qty;
      continue;
    }
    const kgMatch = item.weight.match(/([\d,.]+)\s*(กก|กิโลกรัม|kg)/i);
    if (kgMatch) {
      const kg = Number.parseFloat(kgMatch[1].replace(/,/g, ''));
      if (!Number.isNaN(kg)) total += kg * 1000 * item.qty;
    }
  }
  return Math.round(total);
}

function escapeCsv(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildPostalCsv(orders: Order[], service: PostalService): string {
  const rows: string[] = [];
  rows.push(POSTAL_CSV_HEADERS.map(escapeCsv).join(','));

  orders.forEach((order, index) => {
    const codAmount = order.payment === 'cod' ? order.totalValue : 0;
    const row = [
      index + 1,
      order.orderNo.replace(/^#/, ''),
      postalServiceLabel[service],
      order.customer.name,
      order.customer.phone,
      order.customer.address,
      extractPostcode(order.customer.address),
      sumWeightGrams(order),
      order.insured ? order.totalValue : 0,
      codAmount,
      order.note ?? '',
    ];
    rows.push(row.map(escapeCsv).join(','));
  });

  return rows.join('\r\n');
}

export function downloadCsv(filename: string, content: string) {
  // prepend BOM so Excel opens Thai characters correctly
  const blob = new Blob(['﻿' + content], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function nextBatchId(existing: string[]): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const prefix = `BATCH-${yyyy}${mm}${dd}`;
  const todayBatches = existing.filter((id) => id.startsWith(prefix));
  const seq = todayBatches.length + 1;
  return `${prefix}-${String(seq).padStart(2, '0')}`;
}
