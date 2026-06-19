import { type Driver, type Order } from '@/data/mock';
import { getTomorrowDateKey, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';

export function getDefaultPlanningDate(orders: Order[]) {
  const activePlanDates = orders
    .filter((order) => isUnreleasedPlannedOrder(order))
    .map((order) => order.deliveryPlan?.plannedDate)
    .filter((value): value is string => Boolean(value))
    .sort();

  return activePlanDates[0] ?? getTomorrowDateKey();
}

export function formatDriverStatus(driver: Driver) {
  if (driver.status === 'available') return { label: 'ว่าง', variant: 'success' as const };
  if (driver.status === 'on_delivery') return { label: 'กำลังส่ง', variant: 'muted' as const };
  return { label: 'หยุด', variant: 'warning' as const };
}

export function matchesPlanningQuery(order: Order, drivers: Driver[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const plannedDriverName = order.deliveryPlan?.plannedDriverId
    ? (drivers.find((driver) => driver.id === order.deliveryPlan?.plannedDriverId)?.name ?? '')
    : '';

  return [
    order.code,
    order.customer.name,
    order.customer.phone,
    order.customer.address,
    plannedDriverName,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}
