import { failNextActionLabel, failReasonLabel } from '@/data/mock';
import { isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import { describeProof, planAutoAssignments } from '@/lib/deliveryExecution';
import type {
  DeliveryProofEditorRole,
  Driver,
  FailReason,
  Order,
  ProofOfDelivery,
  ProofOfDeliveryHistoryEntry,
} from '@/data/mock';
import {
  appendEvent,
  DEFAULT_HANDLER,
  nowIso,
  operatorActor,
  SYSTEM_ACTOR,
} from '@/state/retail/timeline';
import type {
  ConfirmDeliveryInput,
  FailDeliveryInput,
  MarkReturnedInput,
  MarkReturningInput,
  RetailState,
  SubmitDeliveryInput,
} from '@/state/retail/types';

const FAILABLE: Order['status'][] = ['assigned', 'in_transit', 'pending_confirmation'];
const DRIVER_BUSY_STATUSES: Order['status'][] = ['in_transit', 'pending_confirmation', 'returning'];
export const deliveryProofRevisionLimits: Record<DeliveryProofEditorRole, number> = {
  messenger: 1,
  admin: 2,
};

export function getDeliveryProofRevisionCount(
  order: Pick<Order, 'proofHistory'>,
  editorRole: DeliveryProofEditorRole,
) {
  return (order.proofHistory ?? []).filter((entry) => entry.replacedByRole === editorRole).length;
}

export function canReviseDeliveryProof(
  order: Pick<Order, 'proofHistory'>,
  editorRole: DeliveryProofEditorRole,
) {
  return getDeliveryProofRevisionCount(order, editorRole) < deliveryProofRevisionLimits[editorRole];
}

function driverHasBusyOrder(
  orders: Order[],
  driverId: string | undefined,
  excludingOrderId?: string,
): boolean {
  if (!driverId) return false;

  return orders.some(
    (order) =>
      order.id !== excludingOrderId &&
      order.assignedDriverId === driverId &&
      DRIVER_BUSY_STATUSES.includes(order.status),
  );
}

function reduceDriverLoad(driver: Driver, orders: Order[], completedOrderId: string): Driver {
  const activeOrders = Math.max(0, driver.activeOrders - 1);
  const shouldStayBusy =
    activeOrders > 0 && driverHasBusyOrder(orders, driver.id, completedOrderId);

  return {
    ...driver,
    activeOrders,
    status: shouldStayBusy
      ? 'on_delivery'
      : driver.status === 'off_duty'
        ? 'off_duty'
        : 'available',
  };
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
        return reduceDriverLoad(driver, current.orders, orderId);
      }

      if (driver.id === driverId && !alreadyAssignedToDriver) {
        const activeOrders = Math.min(driver.capacity, driver.activeOrders + 1);
        return {
          ...driver,
          activeOrders,
        };
      }

      return driver;
    }),
  };
}

/**
 * จ่ายงานอัตโนมัติตามแผนของ planAutoAssignments
 * @param orderIds ถ้าระบุ จะจ่ายเฉพาะออเดอร์ในลิสต์ (ใช้ตอนผู้ใช้เลือกบางรายการใน preview)
 */
export function autoAssignReadyOrdersState(current: RetailState, orderIds?: string[]): RetailState {
  const at = nowIso();
  const now = Date.parse(at);
  const selected = orderIds ? new Set(orderIds) : null;

  const assigned: Record<string, string> = {};
  let workingDrivers = current.drivers;

  planAutoAssignments(current.orders, current.drivers, now).forEach((proposal) => {
    if (!proposal.driverId) return;
    if (selected && !selected.has(proposal.order.id)) return;

    assigned[proposal.order.id] = proposal.driverId;
    workingDrivers = workingDrivers.map((item) =>
      item.id === proposal.driverId
        ? {
            ...item,
            activeOrders: Math.min(item.capacity, item.activeOrders + 1),
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
  const target = current.orders.find((order) => order.id === orderId);
  if (!target || target.status !== 'assigned') return current;

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const driver = current.drivers.find((item) => item.id === order.assignedDriverId);
      const messengerActor = operatorActor({
        name: driver?.name ?? 'คนขับ',
        department: 'จัดส่งภายใน',
        role: 'Messenger',
      });

      return appendEvent(
        { ...order, status: 'in_transit' },
        {
          type: 'delivery_started',
          at: nowIso(),
          actor: messengerActor,
          summary: driver ? `messenger รับงาน — ${driver.name}` : 'messenger รับงานและเริ่มจัดส่ง',
        },
      );
    }),
    drivers: current.drivers.map((driver) =>
      driver.id === target.assignedDriverId && driver.status !== 'off_duty'
        ? { ...driver, status: 'on_delivery' }
        : driver,
    ),
  };
}

/**
 * messenger ปิดงาน: บันทึกหลักฐาน (POD) แล้ว
 * - ทุกงานต้องเข้ารอตรวจสอบก่อน เพื่อให้ CS/admin ยืนยันหลักฐานก่อนปิดจริง
 * - capacity คนขับยังถูกถือไว้จนกว่า CS/admin จะยืนยันปิดงาน
 */
export function submitDeliveryState(
  current: RetailState,
  orderId: string,
  input: SubmitDeliveryInput,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order || !['in_transit', 'pending_confirmation'].includes(order.status)) return current;

  const isRevision = order.status === 'pending_confirmation';
  const { editorRole = 'messenger', recordedBy, ...proofInput } = input;
  if (isRevision && !canReviseDeliveryProof(order, editorRole)) {
    const label = editorRole === 'admin' ? 'admin' : 'messenger';
    throw new Error(
      `${label} แก้ไขหลักฐานได้สูงสุด ${deliveryProofRevisionLimits[editorRole]} ครั้ง`,
    );
  }

  const at = nowIso();
  const driver = current.drivers.find((item) => item.id === order.assignedDriverId);
  const actorHandler =
    editorRole === 'admin'
      ? (recordedBy ?? order.handledBy ?? DEFAULT_HANDLER)
      : {
          name: driver?.name ?? 'คนขับ',
          department: 'จัดส่งภายใน',
          role: 'Messenger',
        };
  const proofActor = operatorActor(actorHandler);

  const proof: ProofOfDelivery = {
    ...proofInput,
    capturedByDriverId: order.assignedDriverId ?? '',
    capturedAt: at,
  };
  const proofDetails = describeProof(proof).join(' · ');

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;
      const nextProofHistory: ProofOfDeliveryHistoryEntry[] =
        isRevision && item.proofOfDelivery
          ? [
              ...(item.proofHistory ?? []),
              {
                ...item.proofOfDelivery,
                replacedAt: at,
                replacedByRole: editorRole,
                replacedByName: actorHandler.name,
                revisionNumber: (item.proofHistory ?? []).length + 1,
              },
            ]
          : (item.proofHistory ?? []);

      const next: Order = {
        ...item,
        status: 'pending_confirmation',
        proofOfDelivery: proof,
        proofHistory: nextProofHistory,
      };

      return appendEvent(next, {
        type: isRevision ? 'delivery_proof_revised' : 'delivery_submitted',
        at,
        actor: proofActor,
        summary: isRevision
          ? editorRole === 'admin'
            ? 'admin แก้ไขและส่งหลักฐานใหม่'
            : 'messenger แก้ไขและส่งหลักฐานใหม่'
          : editorRole === 'admin'
            ? 'admin บันทึกหลักฐาน — รอตรวจสอบ'
            : 'messenger ส่งมอบแล้ว — รอตรวจสอบ',
        details: proofDetails || undefined,
      });
    }),
    drivers: current.drivers,
  };
}

/** CS ยืนยันหลักฐาน → ปิดงานเป็น delivered และคืน capacity คนขับ */
export function confirmDeliveryState(
  current: RetailState,
  orderId: string,
  input?: ConfirmDeliveryInput,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order || order.status !== 'pending_confirmation') return current;

  const at = nowIso();
  const recordedBy = input?.recordedBy ?? order.handledBy ?? DEFAULT_HANDLER;

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      return appendEvent(
        { ...item, status: 'delivered' },
        {
          type: 'delivery_confirmed',
          at,
          actor: operatorActor(recordedBy),
          summary: 'CS ยืนยันปิดงาน — ส่งสำเร็จ',
          details: input?.note ? `หมายเหตุ: ${input.note}` : undefined,
        },
      );
    }),
    drivers: current.drivers.map((item) =>
      item.id === order.assignedDriverId ? reduceDriverLoad(item, current.orders, orderId) : item,
    ),
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
      item.id === order.assignedDriverId ? reduceDriverLoad(item, current.orders, orderId) : item,
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
      driver.id === order.assignedDriverId
        ? reduceDriverLoad(driver, current.orders, orderId)
        : driver,
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
          }
        : item,
    ),
  };
}
