import type { Order, PlanningCancelReason } from '@/data/orderTypes';
import { getNextPlanningSlot } from '@/lib/deliveryPlanning';
import { isAdHocRouteOrder } from '@/lib/orderSourceLink';
import type { RouteBuilderDraft, RouteBuilderJob, RouteBuilderStop } from './routeBuilderDraft';

export type ReturnedRouteTrip = {
  id: string;
  title: string;
  routeCode?: string;
  returnedAt?: string;
  reason?: PlanningCancelReason;
  note?: string;
  driverCode?: string;
  driverName?: string;
  orders: Order[];
  jobs: { pickup: Order | null; dropoff: Order | null }[];
};

type DispatchMetadata = NonNullable<Order['metadataJson']>['dispatch'];

function cancelledRouteActivity(order: Order) {
  return [...(order.activityLog ?? [])]
    .reverse()
    .find((event) => event.type === 'delivery_route_cancelled');
}

export function isReturnedAdHocRouteOrder(order: Order) {
  if (!isAdHocRouteOrder(order) || order.status !== 'ready') return false;
  if (order.deliveryPlan || order.deliveryRoute) return false;
  return Boolean(order.metadataJson?.dispatch?.returnedFromRoute || cancelledRouteActivity(order));
}

function returnedRouteCode(order: Order) {
  const explicit = order.metadataJson?.dispatch?.returnedFromRoute?.routeCode;
  if (explicit) return explicit;
  const summary = cancelledRouteActivity(order)?.summary ?? '';
  return summary.match(/Route\s+([^\s(]+)/)?.[1];
}

function groupKey(order: Order) {
  const dispatch = order.metadataJson?.dispatch;
  return (
    dispatch?.adHocRouteRunId ||
    dispatch?.returnedFromRoute?.routeId ||
    returnedRouteCode(order) ||
    order.id
  );
}

function orderStopIndex(order: Order) {
  return order.metadataJson?.dispatch?.stopIndex ?? Number.MAX_SAFE_INTEGER;
}

function pairJobs(orders: Order[]): Array<{ pickup: Order | null; dropoff: Order | null }> {
  const sorted = [...orders].sort((a, b) => orderStopIndex(a) - orderStopIndex(b));
  const pickups = sorted.filter((order) => order.metadataJson?.dispatch?.routeLeg === 'pickup');
  const dropoffs = sorted.filter((order) => order.metadataJson?.dispatch?.routeLeg === 'dropoff');
  const claimedDropoffs = new Set<string>();
  const jobs: Array<{ pickup: Order | null; dropoff: Order | null }> = pickups.map((pickup) => {
    const targetStopId = pickup.metadataJson?.dispatch?.deliverTo?.stopId;
    const matched =
      dropoffs.find(
        (dropoff) =>
          !claimedDropoffs.has(dropoff.id) &&
          targetStopId &&
          dropoff.metadataJson?.dispatch?.stopId === targetStopId,
      ) ?? dropoffs.find((dropoff) => !claimedDropoffs.has(dropoff.id));
    if (matched) claimedDropoffs.add(matched.id);
    return { pickup, dropoff: matched ?? null };
  });
  dropoffs
    .filter((dropoff) => !claimedDropoffs.has(dropoff.id))
    .forEach((dropoff) => jobs.push({ pickup: null, dropoff }));
  return jobs.length > 0 ? jobs : sorted.map((order) => ({ pickup: order, dropoff: null }));
}

export function groupReturnedAdHocRouteTrips(orders: Order[]): ReturnedRouteTrip[] {
  const grouped = new Map<string, Order[]>();
  orders.filter(isReturnedAdHocRouteOrder).forEach((order) => {
    const key = groupKey(order);
    grouped.set(key, [...(grouped.get(key) ?? []), order]);
  });

  return [...grouped.entries()]
    .map(([id, groupedOrders]) => {
      const first = [...groupedOrders].sort((a, b) => orderStopIndex(a) - orderStopIndex(b))[0];
      const returned = first.metadataJson?.dispatch?.returnedFromRoute;
      const activity = cancelledRouteActivity(first);
      return {
        id,
        title: first.metadataJson?.dispatch?.title ?? 'เที่ยวจาก Route Builder',
        routeCode: returnedRouteCode(first),
        returnedAt: returned?.returnedAt ?? activity?.at,
        reason: returned?.reason,
        note: returned?.note ?? activity?.details,
        driverCode: returned?.driverCode,
        driverName: returned?.driverName,
        orders: groupedOrders,
        jobs: pairJobs(groupedOrders),
      } satisfies ReturnedRouteTrip;
    })
    .sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));
}

function toDraftStop(order: Order): RouteBuilderStop {
  const dispatch = order.metadataJson?.dispatch;
  const prefix = dispatch?.routeLeg === 'pickup' ? 'รับ — ' : 'ส่ง — ';
  const name = order.customer.name.startsWith(prefix)
    ? order.customer.name.slice(prefix.length)
    : order.customer.name;
  return {
    id: dispatch?.stopId ?? order.id,
    kind: dispatch?.routeLeg ?? 'pickup',
    name,
    contact: dispatch?.contactName,
    phone: order.customer.phone === '-' ? undefined : order.customer.phone,
    address: order.customer.address,
    lat: dispatch?.geo?.lat,
    lng: dispatch?.geo?.lng,
    deliverToStopId: dispatch?.deliverTo?.stopId,
    sourceLabel: 'เที่ยวที่ดึงกลับ',
    sourceAddressId: '',
  };
}

function completeJob(job: ReturnedRouteTrip['jobs'][number], index: number): RouteBuilderJob {
  const pickup = job.pickup ? toDraftStop(job.pickup) : null;
  const dropoff = job.dropoff ? toDraftStop(job.dropoff) : null;
  return {
    id: `returned-${index + 1}-${pickup?.id ?? dropoff?.id ?? 'job'}`,
    pickup: pickup ? { ...pickup, kind: 'pickup', deliverToStopId: dropoff?.id } : null,
    dropoff: dropoff ? { ...dropoff, kind: 'dropoff', deliverToStopId: undefined } : null,
  };
}

export function buildDraftFromReturnedTrip(trip: ReturnedRouteTrip): RouteBuilderDraft {
  const firstDispatch = trip.orders[0]?.metadataJson?.dispatch as DispatchMetadata | undefined;
  const draft = firstDispatch?.routeDraft;
  const returned = firstDispatch?.returnedFromRoute;
  const fallbackSlot = getNextPlanningSlot();
  return {
    jobs: trip.jobs.map(completeJob),
    plannedDate: draft?.plannedDate ?? returned?.plannedDate ?? fallbackSlot.date,
    plannedTime: draft?.plannedTime ?? returned?.plannedTime ?? '',
    appointmentDate: draft?.appointmentDate ?? returned?.appointmentDate ?? fallbackSlot.date,
    appointmentTime: draft?.appointmentTime ?? returned?.appointmentTime ?? fallbackSlot.time,
    driverId: draft?.driverCode ?? returned?.driverCode ?? '',
    messengerTitle: firstDispatch?.messengerTitle ?? '',
    note: firstDispatch?.routeNote ?? '',
    mode:
      (draft?.dispatchMode ?? returned?.dispatchMode) === 'scheduled' ? 'scheduled' : 'immediate',
    acceptWithinMinutes: draft?.acceptWithinMinutes ?? 15,
  };
}
