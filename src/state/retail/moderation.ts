import type { Order } from '@/data/orderTypes';
import type { ImportRejectReason } from '@/lib/retailApi';
import { appendEvent, DEFAULT_HANDLER, nowIso, operatorActor } from '@/state/retail/timeline';
import type { RetailState } from '@/state/retail/types';

// ปฏิเสธได้เฉพาะออเดอร์ที่ยังไม่เริ่มส่ง (ตรงกับ backend)
const REJECTABLE: Order['status'][] = ['new', 'needs_review', 'ready'];

export const importRejectReasonLabel: Record<ImportRejectReason, string> = {
  incomplete_data: 'ข้อมูลไม่ครบ',
  duplicate: 'ข้อมูลซ้ำ',
  wrong_group: 'ผิดกลุ่ม/ผิดช่องทาง',
  other: 'อื่นๆ',
};

export function rejectImportOrdersState(
  current: RetailState,
  orderIds: string[],
  input?: { reason?: ImportRejectReason; note?: string },
): RetailState {
  const ids = new Set(orderIds);
  const reasonText = input?.reason ? importRejectReasonLabel[input.reason] : undefined;
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!ids.has(order.id) || !REJECTABLE.includes(order.status)) return order;
      return appendEvent(
        { ...order, status: 'rejected', assignedDriverId: undefined },
        {
          type: 'order_rejected',
          at: nowIso(),
          actor: operatorActor(order.handledBy ?? DEFAULT_HANDLER),
          summary: 'ปฏิเสธออเดอร์นำเข้า',
          details:
            [
              reasonText ? `เหตุผล: ${reasonText}` : undefined,
              input?.note ? `หมายเหตุ: ${input.note}` : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
        },
      );
    }),
  };
}

export function restoreImportOrdersState(current: RetailState, orderIds: string[]): RetailState {
  const ids = new Set(orderIds);
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!ids.has(order.id) || order.status !== 'rejected') return order;
      return appendEvent(
        { ...order, status: 'new' },
        {
          type: 'order_restored',
          at: nowIso(),
          actor: operatorActor(order.handledBy ?? DEFAULT_HANDLER),
          summary: 'ดึงออเดอร์กลับมาตรวจใหม่',
        },
      );
    }),
  };
}
