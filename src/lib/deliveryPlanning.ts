import type { Order } from '@/data/mock';

export function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey() {
  return getLocalDateKey(new Date());
}

export function getTomorrowDateKey() {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  return getLocalDateKey(next);
}

export function formatPlanningDate(dateKey: string, locale = 'th-TH') {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(locale, {
    dateStyle: 'medium',
  });
}

export function normalizeOrderPlanning(order: Order): Order {
  return {
    ...order,
    dispatchReadiness: order.dispatchReadiness ?? 'ready',
  };
}

export function isInternalDriverOrder(order: Order) {
  return (order.shippingMethod ?? 'internal_driver') === 'internal_driver';
}

export function isUnreleasedPlannedOrder(order: Order) {
  return order.deliveryPlan?.releaseState === 'planned';
}

export function canPlanOrder(order: Order) {
  return (
    isInternalDriverOrder(order) &&
    order.status === 'ready' &&
    order.deliveryPlan?.releaseState !== 'released'
  );
}

export function isVisibleInExecutionQueue(order: Order) {
  return isInternalDriverOrder(order) && !isUnreleasedPlannedOrder(order);
}

export function canReleasePlannedOrder(order: Order, dateKey = getTodayDateKey()) {
  return (
    canPlanOrder(order) &&
    order.deliveryPlan?.releaseState === 'planned' &&
    order.deliveryPlan.plannedDate === dateKey &&
    !!order.deliveryPlan.plannedDriverId &&
    (order.dispatchReadiness ?? 'ready') === 'ready'
  );
}

export function getPlannedLoadCount(orders: Order[], driverId: string, dateKey: string) {
  return orders.filter(
    (order) =>
      canPlanOrder(order) &&
      order.deliveryPlan?.releaseState === 'planned' &&
      order.deliveryPlan.plannedDate === dateKey &&
      order.deliveryPlan.plannedDriverId === driverId,
  ).length;
}
