import type { Order } from '@/data/orderTypes';
import type { AcceptanceSummary } from '@/lib/retailApi/drivers';

export type OrderAcceptance = {
  state: 'not_required' | 'on_time' | 'late' | 'overdue_unaccepted' | 'pending';
  responseMinutes: number | null;
  lateMinutes: number;
};

export function getOrderAcceptance(order: Order, nowMs = Date.now()): OrderAcceptance {
  const route = order.deliveryRoute;
  const acceptByMs = route?.acceptBy ? new Date(route.acceptBy).getTime() : Number.NaN;
  const acceptedAtMs = route?.acceptedAt ? new Date(route.acceptedAt).getTime() : Number.NaN;
  const publishedAtMs = route?.publishedAt ? new Date(route.publishedAt).getTime() : Number.NaN;
  if (!route?.requiresAcceptance || Number.isNaN(acceptByMs)) {
    return { state: 'not_required', responseMinutes: null, lateMinutes: 0 };
  }
  const responseMinutes =
    Number.isNaN(acceptedAtMs) || Number.isNaN(publishedAtMs)
      ? null
      : Math.max(0, Math.round((acceptedAtMs - publishedAtMs) / 60_000));
  if (!Number.isNaN(acceptedAtMs)) {
    return acceptedAtMs <= acceptByMs
      ? { state: 'on_time', responseMinutes, lateMinutes: 0 }
      : {
          state: 'late',
          responseMinutes,
          lateMinutes: Math.max(0, Math.round((acceptedAtMs - acceptByMs) / 60_000)),
        };
  }
  return {
    state: acceptByMs < nowMs ? 'overdue_unaccepted' : 'pending',
    responseMinutes: null,
    lateMinutes: 0,
  };
}

export function summarizeOrderAcceptance(orders: Order[], nowMs = Date.now()): AcceptanceSummary {
  const uniqueRoutes = new Map<string, Order>();
  for (const order of orders) {
    if (order.deliveryRoute?.requiresAcceptance && order.deliveryRoute.acceptBy) {
      uniqueRoutes.set(order.deliveryRoute.id, order);
    }
  }
  const values = [...uniqueRoutes.values()].map((order) => getOrderAcceptance(order, nowMs));
  const onTimeRoutes = values.filter((item) => item.state === 'on_time').length;
  const lateValues = values.filter((item) => item.state === 'late');
  const overdueUnacceptedRoutes = values.filter(
    (item) => item.state === 'overdue_unaccepted',
  ).length;
  const pendingRoutes = values.filter((item) => item.state === 'pending').length;
  const acceptedValues = values.filter((item) => item.state === 'on_time' || item.state === 'late');
  const dueCount = onTimeRoutes + lateValues.length + overdueUnacceptedRoutes;
  const responseValues = acceptedValues
    .map((item) => item.responseMinutes)
    .filter((value): value is number => value != null);
  const average = (numbers: number[]) =>
    numbers.length > 0
      ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
      : null;

  return {
    totalRoutes: values.length,
    acceptedRoutes: acceptedValues.length,
    onTimeRoutes,
    lateRoutes: lateValues.length,
    overdueUnacceptedRoutes,
    pendingRoutes,
    onTimeRatePercent: dueCount > 0 ? Math.round((onTimeRoutes / dueCount) * 100) : null,
    averageResponseMinutes: average(responseValues),
    averageLateMinutes: average(lateValues.map((item) => item.lateMinutes)),
  };
}

export function acceptanceLabel(acceptance: OrderAcceptance) {
  if (acceptance.state === 'on_time') return 'รับตรงเวลา';
  if (acceptance.state === 'late') return 'รับช้า';
  if (acceptance.state === 'overdue_unaccepted') return 'ยังไม่รับเกินกำหนด';
  if (acceptance.state === 'pending') return 'รอรับ';
  return 'ไม่กำหนดให้กดรับ';
}
