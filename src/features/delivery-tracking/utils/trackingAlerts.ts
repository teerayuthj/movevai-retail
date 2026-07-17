import type { Order } from '@/data/orderTypes';
import { getAssignedOrderOverdue } from '@/lib/deliveryPlanning';

export type TrackingAlertKind = 'accept_overdue' | 'start_overdue' | 'push_failed';

export type TrackingAlert = {
  kind: TrackingAlertKind;
  overdueMinutes?: number;
};

function minutesPast(iso: string | undefined, nowMs: number) {
  if (!iso) return null;
  const deadline = new Date(iso).getTime();
  if (Number.isNaN(deadline) || nowMs < deadline) return null;
  return Math.max(1, Math.floor((nowMs - deadline) / 60_000));
}

/** งาน assigned ที่ผิดปกติและต้องให้ admin เข้าไปแก้ในหน้าติดตามการจัดส่ง — null = ปกติ */
export function getTrackingAlert(order: Order, nowMs: number): TrackingAlert | null {
  if (order.status !== 'assigned') return null;
  const route = order.deliveryRoute;

  if (route?.pushStatus === 'failed') {
    return { kind: 'push_failed' };
  }

  if (route?.acceptedAt) {
    const overdueMinutes = minutesPast(route.startBy, nowMs);
    return overdueMinutes == null ? null : { kind: 'start_overdue', overdueMinutes };
  }

  if (route?.requiresAcceptance) {
    const routeOverdueMinutes = minutesPast(route.acceptBy, nowMs);
    if (routeOverdueMinutes != null) {
      return { kind: 'accept_overdue', overdueMinutes: routeOverdueMinutes };
    }

    const scheduledOverdue = getAssignedOrderOverdue(order, nowMs);
    if (scheduledOverdue) {
      return { kind: 'accept_overdue', overdueMinutes: scheduledOverdue.minutes };
    }
  }

  return null;
}
