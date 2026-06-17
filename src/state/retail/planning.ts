import { dispatchReadinessLabel, type DispatchReadiness, type Order } from '@/data/mock';
import type { OrderActivityChange } from '@/data/mock';
import {
  canPlanOrder,
  canReleasePlannedOrder,
  formatPlanningDate,
  getTodayDateKey,
} from '@/lib/deliveryPlanning';
import { appendEvent, nowIso, operatorActor } from '@/state/retail/timeline';
import type { PlanOrdersInput, RetailState } from '@/state/retail/types';

function driverNameById(current: RetailState, driverId: string | undefined) {
  if (!driverId) return undefined;
  return current.drivers.find((driver) => driver.id === driverId)?.name ?? driverId;
}

function buildPlanDetails(
  plannedDate: string,
  plannedDriverName: string | undefined,
  readiness: DispatchReadiness,
  note?: string,
) {
  return [
    `วันที่ส่ง: ${formatPlanningDate(plannedDate)}`,
    plannedDriverName ? `คนขับ: ${plannedDriverName}` : 'ยังไม่เลือกคนขับ',
    `ความพร้อมสินค้า: ${dispatchReadinessLabel[readiness]}`,
    note ? `หมายเหตุ: ${note}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function planOrdersState(
  current: RetailState,
  orderIds: string[],
  input: PlanOrdersInput,
): RetailState {
  const targetIds = new Set(orderIds);
  const at = nowIso();

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!targetIds.has(order.id) || !canPlanOrder(order)) return order;

      const nextReadiness = input.dispatchReadiness ?? order.dispatchReadiness ?? 'ready';
      const previousPlan = order.deliveryPlan;
      const nextPlan = {
        plannedDate: input.plannedDate,
        plannedDriverId: input.plannedDriverId,
        releaseState: 'planned' as const,
        note: input.note ?? previousPlan?.note,
      };
      const changes: OrderActivityChange[] = [];

      if (previousPlan?.plannedDate !== nextPlan.plannedDate) {
        changes.push({
          field: 'deliveryPlan.plannedDate',
          label: 'วันจัดส่ง',
          before: previousPlan?.plannedDate
            ? formatPlanningDate(previousPlan.plannedDate)
            : undefined,
          after: formatPlanningDate(nextPlan.plannedDate),
        });
      }

      if (previousPlan?.plannedDriverId !== nextPlan.plannedDriverId) {
        changes.push({
          field: 'deliveryPlan.plannedDriverId',
          label: 'คนขับตามแผน',
          before: driverNameById(current, previousPlan?.plannedDriverId),
          after: driverNameById(current, nextPlan.plannedDriverId),
        });
      }

      if (previousPlan?.releaseState !== 'planned') {
        changes.push({
          field: 'deliveryPlan.releaseState',
          label: 'สถานะแผน',
          before: previousPlan?.releaseState === 'released' ? 'ปล่อยเข้าคิวแล้ว' : undefined,
          after: 'วางแผนแล้ว',
        });
      }

      if ((order.dispatchReadiness ?? 'ready') !== nextReadiness) {
        changes.push({
          field: 'dispatchReadiness',
          label: 'ความพร้อมสินค้า',
          before: dispatchReadinessLabel[order.dispatchReadiness ?? 'ready'],
          after: dispatchReadinessLabel[nextReadiness],
        });
      }

      const next: Order = {
        ...order,
        dispatchReadiness: nextReadiness,
        deliveryPlan: nextPlan,
      };

      if (changes.length === 0) return next;

      return appendEvent(next, {
        type:
          previousPlan?.releaseState === 'planned' ? 'delivery_plan_updated' : 'delivery_planned',
        at,
        actor: operatorActor(order.handledBy),
        summary:
          previousPlan?.releaseState === 'planned'
            ? 'อัปเดตแผนจัดส่งล่วงหน้า'
            : 'วางแผนจัดส่งล่วงหน้า',
        details: buildPlanDetails(
          nextPlan.plannedDate,
          driverNameById(current, nextPlan.plannedDriverId),
          nextReadiness,
          nextPlan.note,
        ),
        changes,
      });
    }),
  };
}

export function clearPlannedOrdersState(current: RetailState, orderIds: string[]): RetailState {
  const targetIds = new Set(orderIds);
  const at = nowIso();

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!targetIds.has(order.id) || order.deliveryPlan?.releaseState !== 'planned') return order;

      const previousPlan = order.deliveryPlan;
      const next: Order = {
        ...order,
        deliveryPlan: undefined,
      };

      return appendEvent(next, {
        type: 'delivery_plan_cleared',
        at,
        actor: operatorActor(order.handledBy),
        summary: 'ล้างแผนจัดส่งล่วงหน้า',
        details: previousPlan
          ? [
              `วันที่เดิม: ${formatPlanningDate(previousPlan.plannedDate)}`,
              previousPlan.plannedDriverId
                ? `คนขับเดิม: ${driverNameById(current, previousPlan.plannedDriverId)}`
                : 'ยังไม่ได้เลือกคนขับ',
            ].join(' · ')
          : undefined,
        changes: [
          {
            field: 'deliveryPlan.plannedDate',
            label: 'วันจัดส่ง',
            before: previousPlan ? formatPlanningDate(previousPlan.plannedDate) : undefined,
            after: 'ยกเลิกแผน',
          },
          {
            field: 'deliveryPlan.plannedDriverId',
            label: 'คนขับตามแผน',
            before: driverNameById(current, previousPlan?.plannedDriverId),
            after: 'ยังไม่เลือก',
          },
        ],
      });
    }),
  };
}

export function setDispatchReadinessState(
  current: RetailState,
  orderId: string,
  readiness: DispatchReadiness,
  note?: string,
): RetailState {
  const at = nowIso();

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId || !canPlanOrder(order)) return order;
      const previous = order.dispatchReadiness ?? 'ready';
      if (previous === readiness && note === undefined) return order;

      const next: Order = {
        ...order,
        dispatchReadiness: readiness,
        deliveryPlan: order.deliveryPlan
          ? {
              ...order.deliveryPlan,
              note: note ?? order.deliveryPlan.note,
            }
          : order.deliveryPlan,
      };

      return appendEvent(next, {
        type: 'delivery_plan_updated',
        at,
        actor: operatorActor(order.handledBy),
        summary: 'อัปเดตความพร้อมสินค้าก่อนจัดส่ง',
        details: [
          `ความพร้อมสินค้า: ${dispatchReadinessLabel[readiness]}`,
          note ? `หมายเหตุ: ${note}` : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        changes: [
          {
            field: 'dispatchReadiness',
            label: 'ความพร้อมสินค้า',
            before: dispatchReadinessLabel[previous],
            after: dispatchReadinessLabel[readiness],
          },
        ],
      });
    }),
  };
}

export function releasePlannedOrdersState(current: RetailState, orderIds: string[]): RetailState {
  const targetIds = new Set(orderIds);
  const today = getTodayDateKey();
  const at = nowIso();
  const releasedCounts = current.orders.reduce<Record<string, number>>((acc, order) => {
    if (!targetIds.has(order.id) || !canReleasePlannedOrder(order, today)) return acc;
    const plannedDriverId = order.deliveryPlan?.plannedDriverId;
    if (!plannedDriverId) return acc;
    acc[plannedDriverId] = (acc[plannedDriverId] ?? 0) + 1;
    return acc;
  }, {});

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!targetIds.has(order.id) || !canReleasePlannedOrder(order, today)) return order;

      const plannedDriverId = order.deliveryPlan?.plannedDriverId;
      const nextStatus: Order['status'] = plannedDriverId ? 'assigned' : 'ready';
      const next: Order = {
        ...order,
        status: nextStatus,
        assignedDriverId: plannedDriverId ?? order.assignedDriverId,
        deliveryPlan: order.deliveryPlan
          ? {
              ...order.deliveryPlan,
              releaseState: 'released',
              releasedAt: at,
            }
          : order.deliveryPlan,
      };

      return appendEvent(next, {
        type: 'delivery_plan_released',
        at,
        actor: operatorActor(order.handledBy),
        summary: plannedDriverId ? 'ปล่อยแผนเข้าคิวและมอบหมายคนขับ' : 'ปล่อยแผนเข้าคิวจัดส่ง',
        details: [
          `วันที่ส่ง: ${formatPlanningDate(today)}`,
          plannedDriverId
            ? `คนขับ: ${driverNameById(current, plannedDriverId)}`
            : 'ยังไม่มอบหมายคนขับ',
          order.dispatchReadiness === 'awaiting_items'
            ? `ความพร้อมสินค้า: ${dispatchReadinessLabel.awaiting_items}`
            : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
        changes: [
          {
            field: 'deliveryPlan.releaseState',
            label: 'สถานะแผน',
            before: 'วางแผนแล้ว',
            after: 'ปล่อยเข้าคิวแล้ว',
          },
          ...(plannedDriverId
            ? [
                {
                  field: 'assignedDriverId' as const,
                  label: 'คนขับ',
                  before: driverNameById(current, order.assignedDriverId),
                  after: driverNameById(current, plannedDriverId),
                },
                {
                  field: 'status' as const,
                  label: 'สถานะออเดอร์',
                  before: 'พร้อมส่ง',
                  after: 'มอบหมายแล้ว',
                },
              ]
            : []),
        ],
      });
    }),
    drivers: current.drivers.map((driver) => {
      const added = releasedCounts[driver.id] ?? 0;
      if (added === 0) return driver;

      return {
        ...driver,
        activeOrders: driver.activeOrders + added,
      };
    }),
  };
}
