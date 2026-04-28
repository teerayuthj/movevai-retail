import {
  cancelReasonLabel,
  failNextActionLabel,
  failReasonLabel,
  postalServiceLabel,
  shippingMethodLabel,
} from '@/data/mock';
import type {
  CancelReason,
  FailReason,
  Handler,
  Order,
  OrderActivityActor,
  OrderActivityChange,
  OrderActivityEvent,
  OrderActivityEventType,
  ShippingMethod,
} from '@/data/mock';

export const DEFAULT_HANDLER: Handler = {
  name: 'พนักงาน Ausiris',
  department: 'Ops',
};

export const SYSTEM_ACTOR: OrderActivityActor = {
  kind: 'system',
  label: 'ระบบ Ausiris',
};

export const PARSER_ACTOR: OrderActivityActor = {
  kind: 'system',
  label: 'AI Parser',
};

export function operatorActor(handler: Handler | undefined | null): OrderActivityActor {
  return { kind: 'operator', handler: handler ?? DEFAULT_HANDLER };
}

export function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `evt-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

function deterministicEventId(orderId: string, type: OrderActivityEventType, at: string) {
  return `seed:${orderId}:${type}:${at}`;
}

export function appendEvent(
  order: Order,
  event: Omit<OrderActivityEvent, 'id'> & { id?: string },
): Order {
  const next: OrderActivityEvent = {
    id: event.id ?? newEventId(),
    type: event.type,
    at: event.at,
    actor: event.actor,
    summary: event.summary,
    details: event.details,
    changes: event.changes,
  };

  return {
    ...order,
    activityLog: [...(order.activityLog ?? []), next],
  };
}

export function diffCustomer(
  before: Order['customer'],
  after: Order['customer'],
): OrderActivityChange[] {
  const changes: OrderActivityChange[] = [];

  if (before.name !== after.name) {
    changes.push({
      field: 'customer.name',
      label: 'ชื่อผู้รับ',
      before: before.name,
      after: after.name,
    });
  }

  if (before.phone !== after.phone) {
    changes.push({
      field: 'customer.phone',
      label: 'เบอร์โทร',
      before: before.phone,
      after: after.phone,
    });
  }

  if (before.address !== after.address) {
    changes.push({
      field: 'customer.address',
      label: 'ที่อยู่จัดส่ง',
      before: before.address,
      after: after.address,
    });
  }

  if ((before.idCard ?? '') !== (after.idCard ?? '')) {
    changes.push({
      field: 'customer.idCard',
      label: 'เลขบัตร / นิติบุคคล',
      before: before.idCard,
      after: after.idCard,
    });
  }

  return changes;
}

export function shippingLabel(method: ShippingMethod | undefined): string {
  return method ? shippingMethodLabel[method] : shippingMethodLabel.internal_driver;
}

function synthesizeBaseline(order: Order): Order {
  if (order.activityLog && order.activityLog.length > 0) return order;

  const events: OrderActivityEvent[] = [];
  const operator = operatorActor(order.handledBy);

  events.push({
    id: deterministicEventId(order.id, 'order_received', order.receivedAt),
    type: 'order_received',
    at: order.receivedAt,
    actor: operator,
    summary:
      order.source === 'internal_chat'
        ? 'รับงานเข้าระบบจาก Chat ภายใน'
        : order.source === 'manual'
          ? 'บันทึกออเดอร์จากหน้าเคาน์เตอร์'
          : 'รับออเดอร์จาก LINE OA',
    details: order.lineContact ? `จาก ${order.lineContact.displayName}` : undefined,
  });

  if (order.source === 'internal_chat') {
    events.push({
      id: deterministicEventId(order.id, 'order_created_from_internal_chat', order.receivedAt),
      type: 'order_created_from_internal_chat',
      at: order.receivedAt,
      actor: operator,
      summary: 'สร้าง draft จาก Chat ภายใน — รอตรวจใน Inbox',
    });
  }

  const parsedStatuses: Order['status'][] = [
    'needs_review',
    'ready',
    'assigned',
    'in_transit',
    'delivered',
    'failed',
    'cancelled',
    'returning',
    'returned',
  ];

  if (
    (order.source === 'line_excel' || order.source === 'line_image') &&
    parsedStatuses.includes(order.status)
  ) {
    events.push({
      id: deterministicEventId(order.id, 'parsing_completed', order.receivedAt),
      type: 'parsing_completed',
      at: order.receivedAt,
      actor: PARSER_ACTOR,
      summary:
        order.source === 'line_excel'
          ? 'ประมวลผลไฟล์ Excel เสร็จ — ส่งเข้า Inbox ให้ตรวจ'
          : 'ประมวลผลรูปสลิปเสร็จ — ส่งเข้า Inbox ให้ตรวจ',
      details: order.confidence > 0 ? `AI confidence ${order.confidence}%` : undefined,
    });
  }

  const reachedReady: Order['status'][] = [
    'ready',
    'assigned',
    'in_transit',
    'delivered',
    'failed',
    'returning',
    'returned',
  ];

  if (reachedReady.includes(order.status)) {
    events.push({
      id: deterministicEventId(order.id, 'order_confirmed', order.receivedAt),
      type: 'order_confirmed',
      at: order.receivedAt,
      actor: operator,
      summary:
        order.shippingMethod === 'thai_post' ? 'ยืนยันเข้าคิวไปรษณีย์' : 'ยืนยันเข้าคิวจัดส่งภายใน',
      details: `ช่องทาง: ${shippingLabel(order.shippingMethod)}`,
    });
  }

  if (
    order.shippingMethod !== 'thai_post' &&
    order.assignedDriverId &&
    ['assigned', 'in_transit', 'delivered', 'failed', 'returning', 'returned'].includes(
      order.status,
    )
  ) {
    events.push({
      id: deterministicEventId(order.id, 'driver_assigned', order.receivedAt),
      type: 'driver_assigned',
      at: order.receivedAt,
      actor: operator,
      summary: 'มอบหมายคนขับ',
      details: `Driver ${order.assignedDriverId}`,
    });
  }

  if (order.postalBatch?.exportedAt) {
    events.push({
      id: deterministicEventId(order.id, 'postal_batch_exported', order.postalBatch.exportedAt),
      type: 'postal_batch_exported',
      at: order.postalBatch.exportedAt,
      actor: operator,
      summary: `จัดเข้าแบทช์ ${order.postalBatch.batchId}`,
      details: `บริการ ${postalServiceLabel[order.postalBatch.service]}`,
    });
  }

  if (order.postalBatch?.trackingNumber) {
    const at = order.postalBatch.handedOverAt ?? order.postalBatch.exportedAt;
    events.push({
      id: deterministicEventId(order.id, 'postal_tracking_saved', at),
      type: 'postal_tracking_saved',
      at,
      actor: operator,
      summary: 'บันทึกเลขติดตามไปรษณีย์',
      changes: [
        {
          field: 'postalBatch.trackingNumber',
          label: 'เลขติดตาม',
          before: undefined,
          after: order.postalBatch.trackingNumber,
        },
      ],
    });
  }

  if (order.postalBatch?.handedOverAt) {
    events.push({
      id: deterministicEventId(order.id, 'postal_handed_over', order.postalBatch.handedOverAt),
      type: 'postal_handed_over',
      at: order.postalBatch.handedOverAt,
      actor: operator,
      summary: 'ฝากของเข้าไปรษณีย์แล้ว',
    });
  }

  if (
    order.shippingMethod !== 'thai_post' &&
    ['in_transit', 'delivered', 'failed'].includes(order.status)
  ) {
    events.push({
      id: deterministicEventId(order.id, 'delivery_started', order.receivedAt),
      type: 'delivery_started',
      at: order.receivedAt,
      actor: operator,
      summary: 'ออกเดินทางส่งสินค้า',
    });
  }

  if (order.status === 'delivered') {
    const at = order.resolution?.recordedAt ?? order.receivedAt;
    events.push({
      id: deterministicEventId(order.id, 'delivery_completed', at),
      type: 'delivery_completed',
      at,
      actor: operator,
      summary: 'ส่งสำเร็จ',
    });
  }

  if (order.status === 'cancelled' && order.resolution) {
    events.push({
      id: deterministicEventId(order.id, 'order_cancelled', order.resolution.recordedAt),
      type: 'order_cancelled',
      at: order.resolution.recordedAt,
      actor: operatorActor(order.resolution.recordedBy),
      summary: 'ยกเลิกออเดอร์',
      details:
        [
          order.resolution.reason
            ? `เหตุผล: ${cancelReasonLabel[order.resolution.reason as CancelReason] ?? order.resolution.reason}`
            : undefined,
          order.resolution.note ? `หมายเหตุ: ${order.resolution.note}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    });
  }

  if ((order.status === 'failed' || order.status === 'returning') && order.resolution) {
    events.push({
      id: deterministicEventId(order.id, 'delivery_failed', order.resolution.recordedAt),
      type: 'delivery_failed',
      at: order.resolution.recordedAt,
      actor: operatorActor(order.resolution.recordedBy),
      summary: 'ส่งไม่สำเร็จ',
      details:
        [
          order.resolution.reason
            ? `เหตุผล: ${failReasonLabel[order.resolution.reason as FailReason] ?? order.resolution.reason}`
            : undefined,
          order.resolution.nextAction
            ? `ขั้นตอนต่อไป: ${failNextActionLabel[order.resolution.nextAction]}`
            : undefined,
          order.resolution.note ? `หมายเหตุ: ${order.resolution.note}` : undefined,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    });
  }

  if (order.status === 'returning' && order.resolution) {
    events.push({
      id: deterministicEventId(order.id, 'return_started', order.resolution.recordedAt),
      type: 'return_started',
      at: order.resolution.recordedAt,
      actor: operatorActor(order.resolution.recordedBy),
      summary: 'เริ่มส่งกลับสาขา',
    });
  }

  if (order.status === 'returned' && order.resolution) {
    events.push({
      id: deterministicEventId(order.id, 'return_completed', order.resolution.recordedAt),
      type: 'return_completed',
      at: order.resolution.recordedAt,
      actor: operatorActor(order.resolution.recordedBy),
      summary: 'รับคืนเข้าสาขาแล้ว',
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));
  return { ...order, activityLog: events };
}

export function migrateOrders(orders: Order[]): Order[] {
  return orders.map((order) =>
    order.activityLog && order.activityLog.length > 0 ? order : synthesizeBaseline(order),
  );
}
