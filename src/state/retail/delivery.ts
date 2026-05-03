import { failNextActionLabel, failReasonLabel } from '@/data/mock';
import { isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import type { Driver, FailReason, Order } from '@/data/mock';
import {
  appendEvent,
  DEFAULT_HANDLER,
  nowIso,
  operatorActor,
  SYSTEM_ACTOR,
} from '@/state/retail/timeline';
import type {
  FailDeliveryInput,
  MarkReturnedInput,
  MarkReturningInput,
  RetailState,
} from '@/state/retail/types';

const FAILABLE: Order['status'][] = ['assigned', 'in_transit'];

function reduceDriverLoad(driver: Driver): Driver {
  const activeOrders = Math.max(0, driver.activeOrders - 1);

  return {
    ...driver,
    activeOrders,
    status: activeOrders === 0 && driver.status === 'on_delivery' ? 'available' : driver.status,
  };
}

function chooseDriverForOrder(order: Order, drivers: Driver[]) {
  const highValue = order.totalValue >= 500000 || order.insured;

  const available = drivers
    .filter((driver) => driver.status !== 'off_duty')
    .filter((driver) => driver.activeOrders < driver.capacity)
    .filter((driver) => !highValue || driver.highValueCertified)
    .sort((a, b) => {
      const capacityLeft = b.capacity - b.activeOrders - (a.capacity - a.activeOrders);
      if (capacityLeft !== 0) return capacityLeft;
      return b.rating - a.rating;
    });

  return available[0];
}

export function assignOrderState(
  current: RetailState,
  orderId: string,
  driverId: string,
): RetailState {
  const target = current.orders.find((order) => order.id === orderId);
  const nextDriver = current.drivers.find((driver) => driver.id === driverId);
  if (
    !target ||
    !nextDriver ||
    nextDriver.status === 'off_duty' ||
    isUnreleasedPlannedOrder(target)
  )
    return current;

  const previousDriverId = target.assignedDriverId;
  const alreadyAssignedToDriver = target.status === 'assigned' && previousDriverId === driverId;
  const previousDriver = previousDriverId
    ? current.drivers.find((driver) => driver.id === previousDriverId)
    : undefined;
  const at = nowIso();

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const updated: Order = {
        ...order,
        status: 'assigned',
        assignedDriverId: driverId,
      };

      if (alreadyAssignedToDriver) return updated;

      return appendEvent(updated, {
        type: 'driver_assigned',
        at,
        actor: operatorActor(order.handledBy),
        summary: previousDriverId
          ? `เปลี่ยนคนขับเป็น ${nextDriver.name}`
          : `มอบหมายคนขับ ${nextDriver.name}`,
        details: `${nextDriver.zone} · งาน ${Math.min(
          nextDriver.capacity,
          nextDriver.activeOrders + 1,
        )}/${nextDriver.capacity}`,
        changes: [
          {
            field: 'assignedDriverId',
            label: 'คนขับ',
            before: previousDriver?.name,
            after: nextDriver.name,
          },
        ],
      });
    }),
    drivers: current.drivers.map((driver) => {
      if (driver.id === previousDriverId && previousDriverId !== driverId) {
        return reduceDriverLoad(driver);
      }

      if (driver.id === driverId && !alreadyAssignedToDriver) {
        const activeOrders = Math.min(driver.capacity, driver.activeOrders + 1);
        return {
          ...driver,
          activeOrders,
          status: activeOrders > 0 ? 'on_delivery' : driver.status,
        };
      }

      return driver;
    }),
  };
}

export function autoAssignReadyOrdersState(current: RetailState): RetailState {
  let workingDrivers = current.drivers;
  const assigned: Record<string, string> = {};
  const at = nowIso();

  current.orders
    .filter((order) => order.status === 'ready' && !isUnreleasedPlannedOrder(order))
    .forEach((order) => {
      const driver = chooseDriverForOrder(order, workingDrivers);
      if (!driver) return;

      assigned[order.id] = driver.id;
      workingDrivers = workingDrivers.map((item) =>
        item.id === driver.id
          ? {
              ...item,
              activeOrders: Math.min(item.capacity, item.activeOrders + 1),
              status: 'on_delivery',
            }
          : item,
      );
    });

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!assigned[order.id]) return order;

      const driver = current.drivers.find((item) => item.id === assigned[order.id]);
      const updated: Order = {
        ...order,
        status: 'assigned',
        assignedDriverId: assigned[order.id],
      };

      return appendEvent(updated, {
        type: 'driver_auto_assigned',
        at,
        actor: SYSTEM_ACTOR,
        summary: driver ? `Auto-assign คนขับ ${driver.name}` : 'Auto-assign คนขับ',
        details: driver ? `${driver.zone} · ⭐ ${driver.rating}` : undefined,
        changes: [
          {
            field: 'assignedDriverId',
            label: 'คนขับ',
            before: undefined,
            after: driver?.name ?? assigned[order.id],
          },
        ],
      });
    }),
    drivers: workingDrivers,
  };
}

export function startDeliveryState(current: RetailState, orderId: string): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;
      if (order.status === 'in_transit') return order;

      const driver = current.drivers.find((item) => item.id === order.assignedDriverId);

      return appendEvent(
        { ...order, status: 'in_transit' },
        {
          type: 'delivery_started',
          at: nowIso(),
          actor: operatorActor(order.handledBy),
          summary: driver ? `ออกเดินทาง — ${driver.name}` : 'ออกเดินทางส่งสินค้า',
        },
      );
    }),
  };
}

export function completeDeliveryState(
  current: RetailState,
  orderId: string,
  success = true,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order) return current;

  const at = nowIso();
  const driver = current.drivers.find((item) => item.id === order.assignedDriverId);

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      const next: Order = {
        ...item,
        status: success ? 'delivered' : 'failed',
      };

      return appendEvent(
        next,
        success
          ? {
              type: 'delivery_completed',
              at,
              actor: operatorActor(item.handledBy),
              summary: 'ส่งสำเร็จ',
              details: driver ? `คนขับ ${driver.name}` : undefined,
            }
          : {
              type: 'delivery_failed',
              at,
              actor: operatorActor(item.handledBy),
              summary: 'ส่งไม่สำเร็จ',
            },
      );
    }),
    drivers: current.drivers.map((item) =>
      item.id === order.assignedDriverId ? reduceDriverLoad(item) : item,
    ),
  };
}

export function setDriverStatusState(
  current: RetailState,
  driverId: string,
  status: Driver['status'],
): RetailState {
  return {
    ...current,
    drivers: current.drivers.map((driver) =>
      driver.id === driverId ? { ...driver, status } : driver,
    ),
  };
}

export function failDeliveryState(
  current: RetailState,
  orderId: string,
  input: FailDeliveryInput,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order) return current;
  if (!FAILABLE.includes(order.status)) return current;

  const recordedBy = input.recordedBy ?? order.handledBy ?? DEFAULT_HANDLER;
  const recordedAt = new Date().toISOString();

  const failDetails = [
    `เหตุผล: ${failReasonLabel[input.reason] ?? input.reason}`,
    `ขั้นตอนต่อไป: ${failNextActionLabel[input.nextAction]}`,
    input.note ? `หมายเหตุ: ${input.note}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  if (input.nextAction === 'retry') {
    return {
      ...current,
      orders: current.orders.map((item) => {
        if (item.id !== orderId) return item;

        const next: Order = {
          ...item,
          status: 'assigned',
          resolution: {
            type: 'failed',
            reason: input.reason,
            note: input.note,
            nextAction: 'retry',
            recordedBy,
            recordedAt,
          },
        };

        const failed = appendEvent(next, {
          type: 'delivery_failed',
          at: recordedAt,
          actor: operatorActor(recordedBy),
          summary: 'ส่งไม่สำเร็จ — นัดส่งใหม่',
          details: failDetails,
        });

        return appendEvent(failed, {
          type: 'delivery_retried',
          at: recordedAt,
          actor: operatorActor(recordedBy),
          summary: 'นัดส่งใหม่ — กลับเข้าคิว',
        });
      }),
    };
  }

  const isReturn = input.nextAction === 'return';
  const nextStatus: Order['status'] = isReturn ? 'returning' : 'failed';

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      const next: Order = {
        ...item,
        status: nextStatus,
        resolution: {
          type: isReturn ? 'returning' : 'failed',
          reason: input.reason,
          note: input.note,
          nextAction: input.nextAction,
          recordedBy,
          recordedAt,
        },
      };

      const failed = appendEvent(next, {
        type: 'delivery_failed',
        at: recordedAt,
        actor: operatorActor(recordedBy),
        summary: 'ส่งไม่สำเร็จ',
        details: failDetails,
      });

      return isReturn
        ? appendEvent(failed, {
            type: 'return_started',
            at: recordedAt,
            actor: operatorActor(recordedBy),
            summary: 'เริ่มส่งกลับสาขา',
          })
        : failed;
    }),
    drivers: current.drivers.map((driver) =>
      driver.id === order.assignedDriverId ? reduceDriverLoad(driver) : driver,
    ),
  };
}

export function markReturningState(
  current: RetailState,
  orderId: string,
  input: MarkReturningInput,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order) return current;
  if (order.status !== 'failed') return current;

  const recordedAt = nowIso();

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      const recordedBy = input.recordedBy ?? item.handledBy ?? DEFAULT_HANDLER;
      const next: Order = {
        ...item,
        status: 'returning',
        resolution: {
          type: 'returning',
          reason: input.reason,
          note: input.note,
          recordedBy,
          recordedAt,
        },
      };

      return appendEvent(next, {
        type: 'return_started',
        at: recordedAt,
        actor: operatorActor(recordedBy),
        summary: 'เริ่มส่งกลับสาขา',
        details: [
          `เหตุผล: ${failReasonLabel[input.reason] ?? input.reason}`,
          input.note ? `หมายเหตุ: ${input.note}` : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }),
  };
}

export function markReturnedState(
  current: RetailState,
  orderId: string,
  input?: MarkReturnedInput,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order) return current;
  if (order.status !== 'returning') return current;

  const previous = order.resolution;
  const recordedAt = nowIso();

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      const recordedBy = input?.recordedBy ?? item.handledBy ?? DEFAULT_HANDLER;
      const next: Order = {
        ...item,
        status: 'returned',
        resolution: {
          type: 'returned',
          reason: previous?.reason as FailReason | undefined,
          note: input?.note ?? previous?.note,
          recordedBy,
          recordedAt,
        },
      };

      return appendEvent(next, {
        type: 'return_completed',
        at: recordedAt,
        actor: operatorActor(recordedBy),
        summary: 'รับคืนเข้าสาขาแล้ว',
        details:
          (input?.note ?? previous?.note)
            ? `หมายเหตุ: ${input?.note ?? previous?.note}`
            : undefined,
      });
    }),
  };
}

export function retryDeliveryState(current: RetailState, orderId: string): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order) return current;
  if (order.status !== 'failed') return current;
  if (!order.assignedDriverId) return current;

  const driver = current.drivers.find((item) => item.id === order.assignedDriverId);
  if (!driver || driver.status === 'off_duty') return current;
  if (driver.activeOrders >= driver.capacity) return current;

  const at = nowIso();

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      const next: Order = {
        ...item,
        status: 'assigned',
        resolution: undefined,
      };

      return appendEvent(next, {
        type: 'delivery_retried',
        at,
        actor: operatorActor(item.handledBy),
        summary: `นัดส่งใหม่กับ ${driver.name}`,
      });
    }),
    drivers: current.drivers.map((item) =>
      item.id === driver.id
        ? {
            ...item,
            activeOrders: Math.min(item.capacity, item.activeOrders + 1),
            status: 'on_delivery',
          }
        : item,
    ),
  };
}
