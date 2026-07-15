import type { Order } from '@/data/orderTypes';
import { getAssignedOrderOverdue, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';

export type BoardActionKind = 'unassigned' | 'accept_overdue' | 'start_overdue' | 'push_failed';

export type BoardAction = {
  kind: BoardActionKind;
  overdueMinutes?: number;
};

function minutesPast(iso: string | undefined, nowMs: number) {
  if (!iso) return null;
  const deadline = new Date(iso).getTime();
  if (Number.isNaN(deadline) || nowMs < deadline) return null;
  return Math.max(1, Math.floor((nowMs - deadline) / 60_000));
}

export function getBoardAction(order: Order, nowMs: number): BoardAction | null {
  if (order.status === 'ready' && !isUnreleasedPlannedOrder(order)) {
    return { kind: 'unassigned' };
  }

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

export function boardActionLabel(action: BoardAction) {
  if (action.kind === 'unassigned') return 'รอจัดคนขับ';
  if (action.kind === 'push_failed') return 'แจ้งเตือนคนขับไม่สำเร็จ';
  if (action.kind === 'start_overdue') {
    return `รับงานแล้วแต่ยังไม่เริ่ม · เกิน ${action.overdueMinutes ?? 0} นาที`;
  }
  return `คนขับยังไม่รับ · เกิน ${action.overdueMinutes ?? 0} นาที`;
}

export function boardActionPriority(action: BoardAction) {
  if (action.kind === 'push_failed') return 3;
  if (action.kind === 'accept_overdue' || action.kind === 'start_overdue') return 2;
  return 1;
}
