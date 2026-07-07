import { cancelReasonLabel } from '@/data/orderTypes';
import type { Order, OrderResolution, ShippingMethod } from '@/data/orderTypes';
import {
  appendEvent,
  DEFAULT_HANDLER,
  diffCustomer,
  nowIso,
  operatorActor,
  shippingLabel,
} from '@/state/retail/timeline';
import type { CancelOrderInput, RetailState, UpdateOrderDetailsInput } from '@/state/retail/types';

export const CANCELLABLE: Order['status'][] = ['new', 'needs_review', 'ready', 'assigned'];
const DRIVER_BUSY_STATUSES: Order['status'][] = ['in_transit', 'pending_confirmation', 'returning'];

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

function requestedDeliveryFromOrder(order: Order) {
  const metadata = order.metadataJson?.requestedDelivery as
    | { date?: unknown; time?: unknown }
    | undefined;
  const metadataDate = typeof metadata?.date === 'string' ? metadata.date : '';
  const metadataTime = typeof metadata?.time === 'string' ? metadata.time : '';
  if (metadataDate || metadataTime) return { date: metadataDate, time: metadataTime };

  if (order.deliveryPlan?.plannedDate) {
    return { date: order.deliveryPlan.plannedDate, time: order.deliveryPlan.plannedTime ?? '' };
  }

  const match = order.note?.match(
    /นัดส่ง(?:ล่าสุด)?\s+(\d{4}-\d{2}-\d{2})(?:\s+((?:[01]\d|2[0-3]):[0-5]\d))?/,
  );
  return { date: match?.[1] ?? '', time: match?.[2] ?? '' };
}

function requestedDeliveryLabel(date: string | undefined, time: string | undefined) {
  if (!date) return 'ยังไม่ระบุ';
  return time ? `${date} ${time}` : date;
}

function totalItemQty(order: Order) {
  return order.items.reduce((sum, item) => sum + item.qty, 0);
}

export function updateOrderState(
  current: RetailState,
  orderId: string,
  patch: Partial<Order>,
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => (order.id === orderId ? { ...order, ...patch } : order)),
  };
}

export function updateOrderCustomerState(
  current: RetailState,
  orderId: string,
  customer: Order['customer'],
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;
      const changes = diffCustomer(order.customer, customer);
      if (changes.length === 0) return order;

      return appendEvent(
        { ...order, customer },
        {
          type: 'customer_updated',
          at: nowIso(),
          actor: operatorActor(order.handledBy),
          summary: 'แก้ไขข้อมูลผู้รับ',
          changes,
        },
      );
    }),
  };
}

export function updateOrderDetailsState(
  current: RetailState,
  orderId: string,
  input: UpdateOrderDetailsInput,
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const previousDelivery = requestedDeliveryFromOrder(order);
      const nextDelivery = {
        date: input.requestedDeliveryDate ?? previousDelivery.date,
        time: input.requestedDeliveryTime ?? previousDelivery.time,
      };
      const previousQty = totalItemQty(order);
      const nextQty = input.itemQty ?? previousQty;

      const changes = [];
      if (previousDelivery.date !== nextDelivery.date) {
        changes.push({
          field: 'deliveryPlan.plannedDate' as const,
          label: 'วันนัดส่ง',
          before: previousDelivery.date || undefined,
          after: nextDelivery.date || undefined,
        });
      }
      if (previousDelivery.time !== nextDelivery.time) {
        changes.push({
          field: 'deliveryPlan.plannedTime' as const,
          label: 'เวลานัดส่ง',
          before: previousDelivery.time || undefined,
          after: nextDelivery.time || undefined,
        });
      }
      if (previousQty !== nextQty) {
        changes.push({
          field: 'items.qty' as const,
          label: 'จำนวนสินค้า',
          before: `${previousQty} ชิ้น`,
          after: `${nextQty} ชิ้น`,
        });
      }
      if (changes.length === 0) return order;

      const nextItems =
        input.itemQty == null || order.items.length === 0
          ? order.items
          : order.items.map((item, index) => (index === 0 ? { ...item, qty: nextQty } : item));
      const metadataJson = {
        ...(order.metadataJson ?? {}),
        requestedDelivery: {
          date: nextDelivery.date,
          time: nextDelivery.time,
          original: order.metadataJson?.requestedDelivery
            ? (order.metadataJson.requestedDelivery as Record<string, unknown>).original
            : requestedDeliveryLabel(previousDelivery.date, previousDelivery.time),
          updatedAt: nowIso(),
        },
      };
      const deliveryPlan =
        order.deliveryPlan && nextDelivery.date
          ? {
              ...order.deliveryPlan,
              plannedDate: nextDelivery.date,
              plannedTime: nextDelivery.time || undefined,
            }
          : order.deliveryPlan;

      return appendEvent(
        {
          ...order,
          items: nextItems,
          metadataJson,
          deliveryPlan,
        },
        {
          type: 'order_details_updated',
          at: nowIso(),
          actor: operatorActor(order.handledBy),
          summary: 'แก้ไขวันนัด / จำนวนสินค้า',
          changes,
        },
      );
    }),
  };
}

export function confirmOrderState(
  current: RetailState,
  orderId: string,
  shippingMethod?: ShippingMethod,
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const nextMethod: ShippingMethod =
        shippingMethod ?? order.shippingMethod ?? 'internal_driver';
      const next: Order = {
        ...order,
        status: 'ready',
        confidence: Math.max(order.confidence, 90),
        dispatchReadiness: order.dispatchReadiness ?? 'ready',
        shippingMethod: nextMethod,
      };

      if (order.status === 'ready') return next;

      return appendEvent(next, {
        type: 'order_confirmed',
        at: nowIso(),
        actor: operatorActor(order.handledBy),
        summary: nextMethod === 'thai_post' ? 'ยืนยันเข้าคิวไปรษณีย์' : 'ยืนยันเข้าคิวจัดส่งภายใน',
        details: `ช่องทาง: ${shippingLabel(nextMethod)}`,
      });
    }),
  };
}

export function setShippingMethodState(
  current: RetailState,
  orderId: string,
  method: ShippingMethod,
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const previous = order.shippingMethod ?? 'internal_driver';
      if (previous === method) return order;

      return appendEvent(
        { ...order, shippingMethod: method },
        {
          type: 'shipping_method_changed',
          at: nowIso(),
          actor: operatorActor(order.handledBy),
          summary: 'เปลี่ยนวิธีจัดส่ง',
          changes: [
            {
              field: 'shippingMethod',
              label: 'วิธีจัดส่ง',
              before: shippingLabel(previous),
              after: shippingLabel(method),
            },
          ],
        },
      );
    }),
  };
}

export function cancelOrderState(
  current: RetailState,
  orderId: string,
  input: CancelOrderInput,
): RetailState {
  const order = current.orders.find((item) => item.id === orderId);
  if (!order) return current;
  if (!CANCELLABLE.includes(order.status)) return current;

  const resolution: OrderResolution = {
    type: 'cancelled',
    reason: input.reason,
    note: input.note,
    recordedBy: input.recordedBy ?? order.handledBy ?? DEFAULT_HANDLER,
    recordedAt: new Date().toISOString(),
  };

  const wasAssigned = order.status === 'assigned';

  return {
    ...current,
    orders: current.orders.map((item) => {
      if (item.id !== orderId) return item;

      const next: Order = {
        ...item,
        status: 'cancelled',
        resolution,
        assignedDriverId: undefined,
      };

      return appendEvent(next, {
        type: 'order_cancelled',
        at: resolution.recordedAt,
        actor: operatorActor(resolution.recordedBy),
        summary: 'ยกเลิกออเดอร์',
        details: [
          `เหตุผล: ${cancelReasonLabel[input.reason] ?? input.reason}`,
          input.note ? `หมายเหตุ: ${input.note}` : undefined,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }),
    drivers: current.drivers.map((driver) =>
      wasAssigned && driver.id === order.assignedDriverId
        ? {
            ...driver,
            activeOrders: Math.max(0, driver.activeOrders - 1),
            status:
              Math.max(0, driver.activeOrders - 1) > 0 &&
              driverHasBusyOrder(current.orders, driver.id, orderId)
                ? 'on_delivery'
                : driver.status === 'off_duty'
                  ? 'off_duty'
                  : 'available',
          }
        : driver,
    ),
  };
}
