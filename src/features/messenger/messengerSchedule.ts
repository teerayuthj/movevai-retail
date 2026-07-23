import type { Order } from '@/data/orderTypes';
import {
  getPlanningDateTimeMs,
  getAssignedOrderOverdue,
  getOrderAppointmentDateTimeMs,
  SCHEDULED_DELIVERY_GRACE_MINUTES,
  type AssignedOrderOverdue,
} from '@/lib/deliveryPlanning';

export const SCHEDULED_DELIVERY_REMINDER_MINUTES = 15;
/** Planning เปิดให้ Messenger รับเที่ยวในช่วง 10 นาทีก่อนเวลาออก */
export const SCHEDULED_DELIVERY_ACCEPTANCE_LEAD_MINUTES = 10;

export type MessengerJobTiming =
  | { phase: 'scheduled'; minutes: number }
  | { phase: 'upcoming'; minutes: number }
  | { phase: 'grace'; minutes: number };

export function getMessengerJobScheduledAt(order: Order): number | null {
  const plan = order.deliveryPlan;
  if (!plan?.plannedDate || !plan.plannedTime) return null;

  return getPlanningDateTimeMs(plan.plannedDate, plan.plannedTime);
}

export function getMessengerAppointmentAt(order: Order): number | null {
  return getOrderAppointmentDateTimeMs(order);
}

export function getMessengerJobAcceptanceOpensAt(order: Order): number | null {
  if (order.deliveryRoute?.dispatchMode !== 'scheduled') return null;
  const scheduledAt = getMessengerJobScheduledAt(order);
  return scheduledAt == null
    ? null
    : scheduledAt - SCHEDULED_DELIVERY_ACCEPTANCE_LEAD_MINUTES * 60_000;
}

export function canMessengerAcceptJob(order: Order, nowMs: number) {
  const acceptanceOpensAt = getMessengerJobAcceptanceOpensAt(order);
  return acceptanceOpensAt == null || nowMs >= acceptanceOpensAt;
}

export function canMessengerStartJob(order: Order, nowMs: number) {
  if (order.deliveryRoute?.dispatchMode !== 'scheduled') return true;
  const scheduledAt = getMessengerJobScheduledAt(order);
  return scheduledAt == null || nowMs >= scheduledAt;
}

export function getMessengerJobTiming(order: Order, nowMs: number): MessengerJobTiming | null {
  if (order.status !== 'assigned') return null;

  const appointmentAt = getMessengerAppointmentAt(order);
  if (appointmentAt == null) return null;

  const reminderAt = appointmentAt - SCHEDULED_DELIVERY_REMINDER_MINUTES * 60_000;
  if (nowMs < reminderAt) {
    return {
      phase: 'scheduled',
      minutes: Math.max(1, Math.ceil((appointmentAt - nowMs) / 60_000)),
    };
  }

  if (nowMs >= reminderAt && nowMs < appointmentAt) {
    return { phase: 'upcoming', minutes: Math.max(1, Math.ceil((appointmentAt - nowMs) / 60_000)) };
  }

  const overdueAt = appointmentAt + SCHEDULED_DELIVERY_GRACE_MINUTES * 60_000;
  if (nowMs >= appointmentAt && nowMs < overdueAt) {
    return { phase: 'grace', minutes: Math.max(1, Math.ceil((overdueAt - nowMs) / 60_000)) };
  }

  return null;
}

export function getMessengerJobOverdue(order: Order, nowMs: number): AssignedOrderOverdue | null {
  return getAssignedOrderOverdue(order, nowMs);
}

export function getMessengerJobOverdueMinutes(order: Order, nowMs: number): number | null {
  return getMessengerJobOverdue(order, nowMs)?.minutes ?? null;
}

// เวลานัดของงานที่ "กำลังส่งอยู่" — messenger เห็นเป็นเป้าหมาย (เหลือ/เลยเท่าไร)
// ไม่ใช่นาฬิกาจับเวลา เพื่อไม่กดดันตอนขับรถ
export type MessengerAppointmentCountdown =
  | { phase: 'before'; minutes: number }
  | { phase: 'after'; minutes: number };

export function getMessengerAppointmentCountdown(
  order: Order,
  nowMs: number,
): MessengerAppointmentCountdown | null {
  if (order.status !== 'in_transit') return null;
  const appointmentAt = getMessengerAppointmentAt(order);
  if (appointmentAt == null) return null;

  const diffMs = appointmentAt - nowMs;
  if (diffMs >= 0) return { phase: 'before', minutes: Math.max(1, Math.ceil(diffMs / 60_000)) };
  return { phase: 'after', minutes: Math.floor(-diffMs / 60_000) };
}

/** เวลาเริ่มส่งแบบ HH:MM สำหรับแสดงนิ่ง ๆ บนงานที่กำลังส่ง — null ถ้าไม่มีข้อมูล */
export function formatInTransitStartTime(order: Order): string | null {
  if (order.status !== 'in_transit' || !order.inTransitAt) return null;
  const startedMs = new Date(order.inTransitAt).getTime();
  if (Number.isNaN(startedMs)) return null;
  return new Date(startedMs).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
