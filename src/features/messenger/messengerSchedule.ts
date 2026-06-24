import type { Order } from '@/data/mock';
import {
  getAssignedOrderOverdueMinutes,
  SCHEDULED_DELIVERY_GRACE_MINUTES,
} from '@/lib/deliveryPlanning';

export const SCHEDULED_DELIVERY_REMINDER_MINUTES = 15;

export type MessengerJobTiming =
  | { phase: 'upcoming'; minutes: number }
  | { phase: 'grace'; minutes: number };

export function getMessengerJobScheduledAt(order: Order): number | null {
  const plan = order.deliveryPlan;
  if (!plan?.plannedDate || !plan.plannedTime) return null;

  const scheduledAt = new Date(`${plan.plannedDate}T${plan.plannedTime}:00+07:00`).getTime();
  return Number.isNaN(scheduledAt) ? null : scheduledAt;
}

export function getMessengerJobTiming(order: Order, nowMs: number): MessengerJobTiming | null {
  if (order.status !== 'assigned' || order.deliveryRoute?.dispatchMode === 'urgent') return null;

  const scheduledAt = getMessengerJobScheduledAt(order);
  if (scheduledAt == null) return null;

  const reminderAt = scheduledAt - SCHEDULED_DELIVERY_REMINDER_MINUTES * 60_000;
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
