import { cancelReasonLabel } from '@/data/mock';
import type { Order, OrderResolution, ShippingMethod } from '@/data/mock';
import {
  appendEvent,
  DEFAULT_HANDLER,
  diffCustomer,
  nowIso,
  operatorActor,
  PARSER_ACTOR,
  shippingLabel,
} from '@/state/retail/timeline';
import type { CancelOrderInput, RetailState } from '@/state/retail/types';

export const CANCELLABLE: Order['status'][] = ['new', 'needs_review', 'ready', 'assigned'];

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

export function finishParsingOrderState(current: RetailState, orderId: string): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const next: Order = {
        ...order,
        status: 'needs_review',
        confidence: Math.max(order.confidence, 84),
        customer: {
          ...order.customer,
          phone: order.customer.phone === '—' ? '02-118-4499' : order.customer.phone,
          address:
            order.items.length === 0
              ? 'อาคาร Silom Complex ชั้น 12 ถ.สีลม แขวงสีลม เขตบางรัก กทม. 10500'
              : order.customer.address,
        },
        items:
          order.items.length > 0
            ? order.items
            : [
                {
                  sku: 'AUS-BAR-965-1B',
                  name: 'AUSIRIS ทองคำแท่ง 96.5%',
                  purity: '96.5%',
                  weight: '1 บาท (15.244 ก.)',
                  qty: 8,
                  unitPrice: 45200,
                },
                {
                  sku: 'AUS-INV-9999-10G',
                  name: 'AUSIRIS ทองคำแท่ง 99.99% Investment Grade',
                  purity: '99.99%',
                  weight: '10 กรัม',
                  qty: 6,
                  unitPrice: 32500,
                },
              ],
        totalValue: order.totalValue > 0 ? order.totalValue : 556600,
        requiresIdCheck: true,
        insured: true,
        note:
          order.note ??
          'นำเข้าจาก Excel · AI จับคู่ SKU แล้ว โปรดตรวจจำนวนและยอดรวมก่อนยืนยันเข้าคิว',
      };

      return appendEvent(next, {
        type: 'parsing_completed',
        at: nowIso(),
        actor: PARSER_ACTOR,
        summary: 'ประมวลผลไฟล์เสร็จ — ส่งเข้า Inbox ให้ตรวจ',
        details: `AI confidence ${next.confidence}%`,
      });
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
              Math.max(0, driver.activeOrders - 1) === 0 && driver.status === 'on_delivery'
                ? 'available'
                : driver.status,
          }
        : driver,
    ),
  };
}
