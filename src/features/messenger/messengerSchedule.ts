import type { Order } from '@/data/orderTypes';
import {
  getPlanningDateTimeMs,
  getAssignedOrderOverdueMinutes,
  SCHEDULED_DELIVERY_GRACE_MINUTES,
} from '@/lib/deliveryPlanning';

export const SCHEDULED_DELIVERY_REMINDER_MINUTES = 15;

export type MessengerJobTiming =
  | { phase: 'scheduled'; minutes: number }
  | { phase: 'upcoming'; minutes: number }
  | { phase: 'grace'; minutes: number };

export function getMessengerJobScheduledAt(order: Order): number | null {
  const plan = order.deliveryPlan;
  if (!plan?.plannedDate || !plan.plannedTime) return null;

  return getPlanningDateTimeMs(plan.plannedDate, plan.plannedTime);
}

export function getMessengerJobTiming(order: Order, nowMs: number): MessengerJobTiming | null {
  if (order.status !== 'assigned' || order.deliveryRoute?.dispatchMode === 'urgent') return null;

  const scheduledAt = getMessengerJobScheduledAt(order);
  if (scheduledAt == null) return null;

  const reminderAt = scheduledAt - SCHEDULED_DELIVERY_REMINDER_MINUTES * 60_000;
  if (nowMs < reminderAt) {
    return { phase: 'scheduled', minutes: Math.max(1, Math.ceil((scheduledAt - nowMs) / 60_000)) };
  }

  if (nowMs >= reminderAt && nowMs < scheduledAt) {
    return { phase: 'upcoming', minutes: Math.max(1, Math.ceil((scheduledAt - nowMs) / 60_000)) };
  }

  const overdueAt = scheduledAt + SCHEDULED_DELIVERY_GRACE_MINUTES * 60_000;
  if (nowMs >= scheduledAt && nowMs < overdueAt) {
    return { phase: 'grace', minutes: Math.max(1, Math.ceil((overdueAt - nowMs) / 60_000)) };
  }

  return null;
}

export function getMessengerJobOverdueMinutes(order: Order, nowMs: number): number | null {
  return getAssignedOrderOverdueMinutes(order, nowMs);
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
  const scheduledAt = getMessengerJobScheduledAt(order);
  if (scheduledAt == null) return null;

  const diffMs = scheduledAt - nowMs;
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
