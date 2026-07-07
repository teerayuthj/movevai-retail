import type { Order } from '@/data/orderTypes';

export const SCHEDULED_DELIVERY_GRACE_MINUTES = 15;
const PLANNING_TIME_ZONE = 'Asia/Bangkok';
const BANGKOK_UTC_OFFSET_MINUTES = 7 * 60;

function getPlanningDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: valueOf('year'),
    month: valueOf('month'),
    day: valueOf('day'),
    hour: valueOf('hour'),
    minute: valueOf('minute'),
    second: valueOf('second'),
  };
}

export function getLocalDateKey(date: Date) {
  const { year, month: monthValue, day: dayValue } = getPlanningDateParts(date);
  const month = `${monthValue}`.padStart(2, '0');
  const day = `${dayValue}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey() {
  return getLocalDateKey(new Date());
}

export function getTomorrowDateKey() {
  const todayStart = getPlanningDateTimeMs(getTodayDateKey(), '00:00');
  const next = todayStart == null ? Date.now() + 86_400_000 : todayStart + 86_400_000;
  return getLocalDateKey(new Date(next));
}

export function formatPlanningDate(dateKey: string, locale = 'th-TH') {
  return new Date(`${dateKey}T00:00:00+07:00`).toLocaleDateString(locale, {
    dateStyle: 'medium',
    timeZone: PLANNING_TIME_ZONE,
  });
}

/** เวลาเริ่มต้นของช่องเวลาจัดส่ง: ปัดขึ้นเป็นชั่วโมงถัดไป (13:20 → 14:00, 13:00 → 13:00) */
export function getNextHourTime(date = new Date()) {
  const { hour, minute, second } = getPlanningDateParts(date);
  const nextHour = minute > 0 || second > 0 || date.getMilliseconds() > 0 ? hour + 1 : hour;
  return `${`${nextHour % 24}`.padStart(2, '0')}:00`;
}

export function formatPlanningTime(time: string | undefined) {
  return time ? `${time} น.` : undefined;
}

export function formatPlanningDateTime(dateKey: string, time?: string, locale = 'th-TH') {
  const date = formatPlanningDate(dateKey, locale);
  const formattedTime = formatPlanningTime(time);
  return formattedTime ? `${date} ${formattedTime}` : date;
}

export function getPlanningDateTimeMs(dateKey: string, time: string) {
  const dateMatch = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!dateMatch || !timeMatch) return null;

  const [, yearValue, monthValue, dayValue] = dateMatch;
  const [, hourValue, minuteValue] = timeMatch;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const scheduled = new Date(
    Date.UTC(year, month - 1, day, hour, minute - BANGKOK_UTC_OFFSET_MINUTES, 0, 0),
  );
  const normalized = getPlanningDateParts(scheduled);

  if (
    normalized.year !== year ||
    normalized.month !== month ||
    normalized.day !== day ||
    normalized.hour !== hour ||
    normalized.minute !== minute
  ) {
    return null;
  }

  return scheduled.getTime();
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

export type AssignedOrderOverdue = {
  minutes: number;
  /** นับจากอะไร — เวลานัดจริงของออเดอร์ หรือ SLA รับงานด่วน (dispatch + 5 นาที) */
  basis: 'appointment' | 'urgent_accept';
};

export function getAssignedOrderOverdue(
  order: Order,
  nowMs = Date.now(),
): AssignedOrderOverdue | null {
  if (order.status !== 'assigned') return null;

  // มีเวลานัดจริง → เวลานัดเป็นตัวตัดสินเสมอ (รวมงานด่วน) ให้ตรงกับ SLA ที่ admin เห็น
  const plan = order.deliveryPlan;
  const scheduledAt =
    plan?.plannedDate && plan.plannedTime
      ? getPlanningDateTimeMs(plan.plannedDate, plan.plannedTime)
      : null;
  if (scheduledAt != null) {
    const overdueAt = scheduledAt + SCHEDULED_DELIVERY_GRACE_MINUTES * 60_000;
    if (nowMs < overdueAt) return null;
    return { minutes: Math.floor((nowMs - scheduledAt) / 60_000), basis: 'appointment' };
  }

  // งานด่วนที่ไม่มีเวลานัด → ใช้ SLA รับงานแบบเดิม
  if (order.deliveryRoute?.dispatchMode === 'urgent' && order.deliveryRoute.acceptBy) {
    const acceptBy = new Date(order.deliveryRoute.acceptBy).getTime();
    if (Number.isNaN(acceptBy) || nowMs < acceptBy) return null;
    return { minutes: Math.floor((nowMs - acceptBy) / 60_000), basis: 'urgent_accept' };
  }

  return null;
}

export function getAssignedOrderOverdueMinutes(order: Order, nowMs = Date.now()) {
  return getAssignedOrderOverdue(order, nowMs)?.minutes ?? null;
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

// อนุมัติจาก Inbox แล้ว (ready + คนขับภายใน) แต่ยังไม่ถูกจัดรอบ — รอ admin กำหนดวัน/เวลา/คนขับ
// โผล่ในลิสต์ "รอจัดรอบ" ของหน้า Planning โดยไม่ผูกกับวันใดวันหนึ่ง จนกว่าจะบันทึกแผน
export function isUnscheduledPlanningOrder(order: Order) {
  return canPlanOrder(order) && order.deliveryPlan?.releaseState !== 'planned';
}

export function isVisibleInExecutionQueue(order: Order) {
  return (
    isInternalDriverOrder(order) &&
    !isUnreleasedPlannedOrder(order) &&
    order.deliveryPlan?.releaseState !== 'released' &&
    !order.deliveryRoute
  );
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
