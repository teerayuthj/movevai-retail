import type { Order } from '@/data/orderTypes';
import { formatPlanningDateTime } from '@/lib/deliveryPlanning';

export type RequestedDeliveryDraft = {
  date: string;
  time: string;
};

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const TIME_RE = /(?:[01]\d|2[0-3]):[0-5]\d/;
const LATEST_MARKER_RE = /\s*นัดส่งล่าสุด\s+\d{4}-\d{2}-\d{2}(?:\s+(?:[01]\d|2[0-3]):[0-5]\d)?/g;

function normalizeTime(value: string | undefined) {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(TIME_RE);
  return match?.[0] ?? '';
}

function normalizeDate(value: string | undefined) {
  if (!value) return '';
  const trimmed = value.trim();
  const match = trimmed.match(DATE_RE);
  return match?.[0] ?? '';
}

function rawField(raw: Record<string, string> | undefined, ...keys: string[]) {
  if (!raw) return '';
  const normalized = Object.entries(raw).map(([key, value]) => [
    key.toLowerCase().replace(/[\s_-]+/g, ''),
    value,
  ]);
  for (const key of keys) {
    const wanted = key.toLowerCase().replace(/[\s_-]+/g, '');
    const found = normalized.find(([rawKey]) => rawKey === wanted);
    if (found?.[1]) return found[1];
  }
  return '';
}

export function parseDeliveryFromText(text: string | undefined): RequestedDeliveryDraft {
  if (!text) return { date: '', time: '' };

  const latest = text.match(
    /นัดส่งล่าสุด\s+(\d{4}-\d{2}-\d{2})(?:\s+((?:[01]\d|2[0-3]):[0-5]\d))?/,
  );
  if (latest) return { date: latest[1], time: latest[2] ?? '' };

  const scheduled = text.match(/นัดส่ง\s+(\d{4}-\d{2}-\d{2})(?:\s+((?:[01]\d|2[0-3]):[0-5]\d))?/);
  if (scheduled) return { date: scheduled[1], time: scheduled[2] ?? '' };

  return { date: normalizeDate(text), time: normalizeTime(text) };
}

export function getRawRequestedDelivery(order: Order): RequestedDeliveryDraft {
  const raw = order.metadataJson?.import?.columns;
  const date = normalizeDate(
    rawField(
      raw,
      'deliveryDate',
      'delivery_date',
      'scheduledDate',
      'วันนัดส่ง',
      'นัดส่ง',
      'วันส่ง',
    ),
  );
  const time = normalizeTime(
    rawField(
      raw,
      'deliveryTime',
      'delivery_time',
      'scheduledTime',
      'เวลานัดส่ง',
      'เวลา',
      'เวลาส่ง',
    ),
  );
  if (date || time) return { date, time };
  return parseDeliveryFromText(rawField(raw, 'note', 'หมายเหตุ') || order.rawText);
}

export function getRequestedDeliveryDraft(order: Order): RequestedDeliveryDraft {
  const metadata = order.metadataJson?.requestedDelivery as
    | { date?: unknown; time?: unknown; plannedDate?: unknown; plannedTime?: unknown }
    | undefined;
  // Backend import records use plannedDate/plannedTime, while edits made in the
  // frontend use date/time. Normalize both shapes here so an explicit imported
  // appointment always wins over an older date embedded in note/rawText.
  const metadataDate =
    typeof metadata?.date === 'string'
      ? metadata.date
      : typeof metadata?.plannedDate === 'string'
        ? metadata.plannedDate
        : undefined;
  const metadataTime =
    typeof metadata?.time === 'string'
      ? metadata.time
      : typeof metadata?.plannedTime === 'string'
        ? metadata.plannedTime
        : undefined;
  const date = normalizeDate(metadataDate);
  const time = normalizeTime(metadataTime);
  if (date || time) return { date, time };

  // ค่าวันนัดในไฟล์เป็นคำขอของลูกค้า ส่วน deliveryPlan เป็นรอบที่ทีมจัดส่งวางไว้
  // เมื่อยังไม่มีการแก้ไขโดยผู้ใช้ ให้ฟอร์มแสดงค่าจากไฟล์เสมอ เพื่อไม่ให้ดูขัดแย้ง
  // กับข้อมูลดิบที่แสดงข้างออเดอร์
  const rawRequestedDelivery = getRawRequestedDelivery(order);
  if (rawRequestedDelivery.date || rawRequestedDelivery.time) return rawRequestedDelivery;

  if (order.deliveryPlan?.plannedDate) {
    return { date: order.deliveryPlan.plannedDate, time: order.deliveryPlan.plannedTime ?? '' };
  }

  const fromNote = parseDeliveryFromText(order.note);
  if (fromNote.date || fromNote.time) return fromNote;
  return { date: '', time: '' };
}

export function formatRequestedDelivery(draft: RequestedDeliveryDraft) {
  if (!draft.date) return 'ยังไม่ระบุ';
  return formatPlanningDateTime(draft.date, draft.time || undefined);
}

export function buildNoteWithRequestedDelivery(
  note: string | undefined,
  draft: RequestedDeliveryDraft,
) {
  const base = (note ?? '').replace(LATEST_MARKER_RE, '').trim();
  if (!draft.date) return base;
  const marker = `นัดส่งล่าสุด ${draft.date}${draft.time ? ` ${draft.time}` : ''}`;
  return [base, marker].filter(Boolean).join(' ');
}

export function getOrderItemQty(order: Order) {
  return order.items.reduce((sum, item) => sum + item.qty, 0);
}
