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

/** เวลาเริ่มต้นของช่องเวลาจัดส่ง: ปัดขึ้นเป็นชั่วโมงถัดไป (13:20 → 14:00, 13:00 → 13:00) */
export function getNextHourTime(date = new Date()) {
  const next = new Date(date);
  if (next.getMinutes() > 0 || next.getSeconds() > 0 || next.getMilliseconds() > 0) {
    next.setHours(next.getHours() + 1);
  }
  next.setMinutes(0, 0, 0);
  return `${`${next.getHours()}`.padStart(2, '0')}:00`;
}

export function formatPlanningTime(time: string | undefined) {
  return time ? `${time} น.` : undefined;
}

export function formatPlanningDateTime(dateKey: string, time?: string, locale = 'th-TH') {
  const date = formatPlanningDate(dateKey, locale);
  const formattedTime = formatPlanningTime(time);
  return formattedTime ? `${date} ${formattedTime}` : date;
}

export function formatOverdueDuration(minutes: number) {
  if (minutes < 1) return 'ถึงเวลานัดส่งแล้ว';
  if (minutes < 60) return `เลยเวลานัดส่ง ${minutes} นาที`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return `เลยเวลานัดส่ง ${hours} ชม.${remainingMinutes ? ` ${remainingMinutes} นาที` : ''}`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `เลยเวลานัดส่ง ${days} วัน${remainingHours ? ` ${remainingHours} ชม.` : ''}`;
}

export function getAssignedOrderOverdueMinutes(order: Order, nowMs = Date.now()) {
  const plan = order.deliveryPlan;
  if (order.status !== 'assigned' || !plan?.plannedDate || !plan.plannedTime) return null;

  const scheduledAt = new Date(`${plan.plannedDate}T${plan.plannedTime}:00+07:00`).getTime();
  if (Number.isNaN(scheduledAt) || nowMs < scheduledAt) return null;
  return Math.floor((nowMs - scheduledAt) / 60_000);
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
