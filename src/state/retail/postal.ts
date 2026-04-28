import { postalServiceLabel } from '@/data/mock';
import type { Order, PostalService } from '@/data/mock';
import { nextBatchId } from '@/lib/export';
import { appendEvent, nowIso, operatorActor } from '@/state/retail/timeline';
import type { RetailState } from '@/state/retail/types';

export function exportPostalBatchState(
  current: RetailState,
  orderIds: string[],
  service: PostalService,
) {
  let batchId = '';
  const exportedAt = new Date().toISOString();
  const idSet = new Set(orderIds);

  const existingBatchIds = current.orders
    .map((order) => order.postalBatch?.batchId)
    .filter((id): id is string => Boolean(id));

  batchId = nextBatchId(existingBatchIds);

  return {
    batchId,
    nextState: {
      ...current,
      orders: current.orders.map((order) => {
        if (!idSet.has(order.id) || order.shippingMethod !== 'thai_post') {
          return order;
        }

        const next: Order = {
          ...order,
          status: 'assigned',
          postalBatch: { batchId, service, exportedAt },
        };

        return appendEvent(next, {
          type: 'postal_batch_exported',
          at: exportedAt,
          actor: operatorActor(order.handledBy),
          summary: `จัดเข้าแบทช์ ${batchId}`,
          details: `บริการ ${postalServiceLabel[service]}`,
        });
      }),
    },
  };
}

export function setPostalTrackingState(
  current: RetailState,
  orderId: string,
  trackingNumber: string,
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId || !order.postalBatch) return order;

      const previous = order.postalBatch.trackingNumber ?? '';
      if (previous === trackingNumber) return order;

      return appendEvent(
        {
          ...order,
          postalBatch: { ...order.postalBatch, trackingNumber },
        },
        {
          type: 'postal_tracking_saved',
          at: nowIso(),
          actor: operatorActor(order.handledBy),
          summary: previous ? 'แก้ไขเลขติดตามไปรษณีย์' : 'บันทึกเลขติดตามไปรษณีย์',
          changes: [
            {
              field: 'postalBatch.trackingNumber',
              label: 'เลขติดตาม',
              before: previous || undefined,
              after: trackingNumber,
            },
          ],
        },
      );
    }),
  };
}

export function markPostalHandedOverState(current: RetailState, orderIds: string[]): RetailState {
  const handedOverAt = new Date().toISOString();
  const idSet = new Set(orderIds);

  return {
    ...current,
    orders: current.orders.map((order) => {
      if (!idSet.has(order.id) || !order.postalBatch) return order;

      return appendEvent(
        {
          ...order,
          status: 'in_transit',
          postalBatch: { ...order.postalBatch, handedOverAt },
        },
        {
          type: 'postal_handed_over',
          at: handedOverAt,
          actor: operatorActor(order.handledBy),
          summary: 'ฝากของเข้าไปรษณีย์แล้ว',
          details: order.postalBatch.trackingNumber
            ? `เลขติดตาม ${order.postalBatch.trackingNumber}`
            : undefined,
        },
      );
    }),
  };
}

export function completePostalDeliveryState(
  current: RetailState,
  orderId: string,
  success = true,
): RetailState {
  return {
    ...current,
    orders: current.orders.map((order) => {
      if (order.id !== orderId) return order;

      const at = nowIso();
      const next: Order = {
        ...order,
        status: success ? 'delivered' : 'failed',
      };

      return appendEvent(
        next,
        success
          ? {
              type: 'delivery_completed',
              at,
              actor: operatorActor(order.handledBy),
              summary: 'ไปรษณีย์ส่งสำเร็จ',
              details: order.postalBatch?.trackingNumber
                ? `เลขติดตาม ${order.postalBatch.trackingNumber}`
                : undefined,
            }
          : {
              type: 'delivery_failed',
              at,
              actor: operatorActor(order.handledBy),
              summary: 'ไปรษณีย์ส่งไม่สำเร็จ',
            },
      );
    }),
  };
}
