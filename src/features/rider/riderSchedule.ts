import type { Order } from '@/data/mock';
import { getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';

export function getRiderJobScheduledAt(order: Order): number | null {
  const plan = order.deliveryPlan;
  if (!plan?.plannedDate || !plan.plannedTime) return null;

  const scheduledAt = new Date(`${plan.plannedDate}T${plan.plannedTime}:00`).getTime();
  return Number.isNaN(scheduledAt) ? null : scheduledAt;
}

export function getRiderJobOverdueMinutes(order: Order, nowMs: number): number | null {
  return getAssignedOrderOverdueMinutes(order, nowMs);
}
