import type { Order } from '@/data/orderTypes';
import { getRequestedDeliveryDraft } from '@/features/inbox/utils/orderSchedule';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { getPlanningDateTimeMs } from '@/lib/deliveryPlanning';

export type FastDispatchSla = {
  urgent: boolean;
  label: string;
  detail: string;
  dueAt: string;
  remainingMs: number;
  state: 'ok' | 'warning' | 'overdue';
  confidence: 'explicit' | 'inferred';
  /** เป้าหมายอิงจากอะไร — วันนัดส่งจริง (appointment) หรือ SLA รับเข้า + 1 วัน (received) */
  basis: 'appointment' | 'received';
  /** เวลาที่ใช้ตัดสิน SLA — หยุดที่เวลาส่งหลักฐานเมื่อจบการวิ่งแล้ว */
  evaluatedAt: string;
  frozenAtProof: boolean;
};

// เป้าหมายเวลาส่ง = วันนัดส่งจริงที่ตั้งไว้ตอน import (ถ้ามี) — ถ้าไม่ระบุเวลา ใช้ปลายวันของวันนัด
function resolveAppointmentDueAt(order: Order): Date | null {
  // งานจาก dispatch route (ad-hoc/template/quick create) — plannedDate/plannedTime ของ
  // deliveryPlan คือเวลาปล่อยรอบ ไม่ใช่นัดหมายลูกค้า จึงห้ามนับเป็นเวลานัด
  const { date, time } = getRequestedDeliveryDraft(order, {
    includePlanFallback: !order.metadataJson?.dispatch,
  });
  if (!date) return null;
  const scheduledMs = getPlanningDateTimeMs(date, time || '23:59');
  if (scheduledMs == null) return null;
  const dt = new Date(scheduledMs);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

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
  // เป้าหมายหลัก = วันนัดส่งจริง (นัดส่ง) ที่ตั้งไว้ตอน import — ตรงกับที่โชว์ในหน้า Inbox/Planning
  // ถ้าไม่มีวันนัด ค่อย fallback เป็น SLA ด่วนแบบเดิม (รับเข้า + 1 วัน)
  const appointmentDueAt = resolveAppointmentDueAt(order);
  const basis: FastDispatchSla['basis'] = appointmentDueAt ? 'appointment' : 'received';
  const dueAt = appointmentDueAt ?? new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
  const deliveryCompletedAt =
    order.proofOfDelivery?.handedOverAt ?? order.proofOfDelivery?.capturedAt;
  const proofCapturedAt = deliveryCompletedAt ? new Date(deliveryCompletedAt) : null;
  const frozenAtProof = Boolean(proofCapturedAt && !Number.isNaN(proofCapturedAt.getTime()));
  const evaluatedAt = frozenAtProof ? proofCapturedAt! : now;
  const remainingMs = dueAt.getTime() - evaluatedAt.getTime();
  const remainingMinutes = Math.max(1, Math.ceil(Math.abs(remainingMs) / 60_000));
  const remainingLabel = formatElapsedDuration(remainingMinutes);
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
      basis,
      evaluatedAt: evaluatedAt.toISOString(),
      frozenAtProof,
    };
  }

  const detail = frozenAtProof
    ? basis === 'appointment'
      ? remainingMs < 0
        ? `ส่งมอบช้ากว่าเวลานัด ${remainingLabel}`
        : `ส่งมอบก่อนเวลานัด ${remainingLabel}`
      : remainingMs < 0
        ? `ส่งมอบเกิน SLA ${remainingLabel}`
        : `ส่งมอบก่อนครบ SLA ${remainingLabel}`
    : basis === 'appointment'
      ? remainingMs < 0
        ? `เกินเวลานัดแล้ว ${remainingLabel}`
        : `ต้องถึงก่อนเวลานัดอีก ${remainingLabel}`
      : remainingMs < 0
        ? `เกิน SLA แล้ว ${remainingLabel}`
        : `ต้องถึงก่อนครบ 1 วันอีก ${remainingLabel}`;

  return {
    urgent,
    label: basis === 'appointment' ? 'ส่งด่วน · ตามวันนัด' : 'ส่งด่วน 1 วัน',
    detail,
    dueAt: dueAt.toISOString(),
    remainingMs,
    state,
    confidence:
      basis === 'appointment' ||
      /ด่วน|1\s*วัน|หนึ่งวัน|same\s*day|next\s*day|urgent|express/i.test(textForSlaDetection(order))
        ? 'explicit'
        : 'inferred',
    basis,
    evaluatedAt: evaluatedAt.toISOString(),
    frozenAtProof,
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
