import type { Order } from '@/data/orderTypes';

export type FastDispatchSla = {
  urgent: boolean;
  label: string;
  detail: string;
  dueAt: string;
  remainingMs: number;
  state: 'ok' | 'warning' | 'overdue';
  confidence: 'explicit' | 'inferred';
};

const FAST_DISPATCH_PATTERNS = [
  /ด่วน/i,
  /1\s*วัน/i,
  /หนึ่งวัน/i,
  /same\s*day/i,
  /next\s*day/i,
  /urgent/i,
  /express/i,
];

function textForSlaDetection(order: Order) {
  const metadata = order.metadataJson?.import;
  const columns = metadata?.columns ? Object.values(metadata.columns).join(' ') : '';
  return [order.note, order.rawText, order.rawPreview, order.customer.address, columns]
    .filter(Boolean)
    .join(' ');
}

export function isFastDispatchOrder(order: Order) {
  const text = textForSlaDetection(order);
  if (FAST_DISPATCH_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return order.deliveryRoute?.dispatchMode === 'urgent';
}

export function getFastDispatchSla(order: Order, now = new Date()): FastDispatchSla {
  const receivedAt = new Date(order.receivedAt);
  const baseTime = Number.isNaN(receivedAt.getTime()) ? now : receivedAt;
  const dueAt = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
  const remainingMs = dueAt.getTime() - now.getTime();
  const remainingHours = Math.ceil(Math.abs(remainingMs) / 3_600_000);
  const urgent = isFastDispatchOrder(order);
  const state: FastDispatchSla['state'] =
    remainingMs < 0 ? 'overdue' : remainingMs <= 4 * 3_600_000 ? 'warning' : 'ok';

  if (!urgent) {
    return {
      urgent,
      label: 'มาตรฐาน',
      detail: 'ไม่พบ SLA ด่วนจากข้อมูลนำเข้า',
      dueAt: dueAt.toISOString(),
      remainingMs,
      state,
      confidence: 'inferred',
    };
  }

  return {
    urgent,
    label: 'ส่งด่วน 1 วัน',
    detail:
      remainingMs < 0
        ? `เกิน SLA แล้ว ${remainingHours} ชม.`
        : `เหลือ ${remainingHours} ชม. ก่อนครบ 1 วัน`,
    dueAt: dueAt.toISOString(),
    remainingMs,
    state,
    confidence: /ด่วน|1\s*วัน|หนึ่งวัน|same\s*day|next\s*day|urgent|express/i.test(
      textForSlaDetection(order),
    )
      ? 'explicit'
      : 'inferred',
  };
}

export function formatFastDispatchDueAt(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
