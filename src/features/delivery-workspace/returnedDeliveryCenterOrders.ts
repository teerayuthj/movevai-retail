import type { Order, PlanningCancelReason } from '@/data/orderTypes';
import { isAdHocRouteOrder } from '@/lib/orderSourceLink';

export type ReturnedDeliveryCenterOrder = {
  order: Order;
  routeId: string;
  routeCode: string;
  returnedAt?: string;
  reason?: PlanningCancelReason;
  note?: string;
  driverCode?: string;
  driverName?: string;
};

export type ReturnedDeliveryCenterGroup = {
  id: string;
  routeCode: string;
  returnedAt?: string;
  orders: ReturnedDeliveryCenterOrder[];
};

function latestRouteCancellation(order: Order) {
  return [...(order.activityLog ?? [])]
    .reverse()
    .find((event) => event.type === 'delivery_route_cancelled');
}

function fallbackRouteCode(order: Order) {
  const summary = latestRouteCancellation(order)?.summary ?? '';
  return summary.match(/Route\s+([^\s(]+)/)?.[1];
}

function returnTimestamp(order: Order) {
  return (
    order.metadataJson?.dispatch?.returnedFromRoute?.returnedAt ??
    latestRouteCancellation(order)?.at
  );
}

export function isUnresolvedDeliveryCenterRouteReturn(order: Order) {
  if (isAdHocRouteOrder(order) || order.status !== 'ready') return false;
  if (order.deliveryPlan || order.deliveryRoute) return false;
  const returnedAt = returnTimestamp(order);
  if (!returnedAt) return false;
  const resolvedAt = order.metadataJson?.dispatch?.routeReturnResolution?.resolvedAt;
  if (!resolvedAt) return true;
  return new Date(resolvedAt).getTime() < new Date(returnedAt).getTime();
}

export function groupReturnedDeliveryCenterOrders(orders: Order[]): ReturnedDeliveryCenterGroup[] {
  const groups = new Map<string, ReturnedDeliveryCenterOrder[]>();
  orders.filter(isUnresolvedDeliveryCenterRouteReturn).forEach((order) => {
    const returned = order.metadataJson?.dispatch?.returnedFromRoute;
    const routeCode = returned?.routeCode ?? fallbackRouteCode(order) ?? 'Route เดิม';
    const routeId = returned?.routeId ?? routeCode;
    const item: ReturnedDeliveryCenterOrder = {
      order,
      routeId,
      routeCode,
      returnedAt: returnTimestamp(order),
      reason: returned?.reason,
      note: returned?.note ?? latestRouteCancellation(order)?.details,
      driverCode: returned?.driverCode,
      driverName: returned?.driverName,
    };
    groups.set(routeId, [...(groups.get(routeId) ?? []), item]);
  });

  return [...groups.entries()]
    .map(([id, groupedOrders]) => ({
      id,
      routeCode: groupedOrders[0]?.routeCode ?? 'Route เดิม',
      returnedAt: groupedOrders
        .map((item) => item.returnedAt ?? '')
        .sort((a, b) => b.localeCompare(a))[0],
      orders: groupedOrders.sort(
        (a, b) => new Date(b.order.receivedAt).getTime() - new Date(a.order.receivedAt).getTime(),
      ),
    }))
    .sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));
}
