import type {
  CancelReason,
  Handler,
  Order,
  OrderActivityActor,
  OrderActivityEvent,
  PlanningCancelReason,
} from '@/data/orderTypes';
import type { ConfirmDeliveryInput, SubmitDeliveryInput } from '@/state/retail/types';
import { APP_API_BASE, proofPayload, request } from './client';
import { type ApiOrder, normalizeOrder, serializeOrderForBackend } from './shared';

// อ่าน orders จาก backend สำหรับ dashboard ฝั่ง web (ใช้ refresh/poll)
export async function fetchAppOrders(params?: { status?: string; take?: number; q?: string }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.take != null) search.set('take', String(params.take));
  if (params?.q?.trim()) search.set('q', params.q.trim());
  const query = search.toString();
  const result = await request<{ items: ApiOrder[]; total: number }>(
    `${APP_API_BASE}/orders${query ? `?${query}` : ''}`,
  );
  return { orders: result.items.map(normalizeOrder), total: result.total };
}

export async function fetchAppOrder(orderId: string) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/${encodeURIComponent(orderId)}`);
  return normalizeOrder(result);
}

/** รายละเอียดงานแบบอ่านอย่างเดียวสำหรับหน้า Live View. */
export async function fetchLiveViewOrder(orderId: string) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/live-view/orders/${encodeURIComponent(orderId)}`,
  );
  return normalizeOrder(result);
}

/**
 * ดึง order สำหรับหน้าติดตามลูกค้า โดยรับได้ทั้ง canonical orderNo (MV-ORD-...),
 * legacy code และ internal id รวมถึง trackingCode สั้นจาก /t/:code
 */
export async function fetchCustomerOrder(idOrCode: string) {
  try {
    const { orders } = await fetchAppOrders({ q: idOrCode, take: 5 });
    const match = orders.find(
      (order) => order.orderNo === idOrCode || order.code === idOrCode || order.id === idOrCode,
    );
    if (match) return fetchAppOrder(match.id);
  } catch {
    // q-search ใช้ไม่ได้ — fallback ไป lookup ด้วย id ตรงๆ ด้านล่าง
  }
  return fetchAppOrder(idOrCode);
}

export async function syncAndAssignOrder(order: Order, driverCode: string) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/assign`, {
    method: 'POST',
    body: JSON.stringify({ order: serializeOrderForBackend(order), driverCode }),
  });
  return normalizeOrder(result);
}

/** สร้าง intake order ให้ backend ออก MV-ORD ตั้งแต่ก่อนเข้าคิว */
export async function createAppOrder(order: Order) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders`, {
    method: 'POST',
    body: JSON.stringify(serializeOrderForBackend(order)),
  });
  return normalizeOrder(result);
}

// ยกเลิกออเดอร์ก่อนออกเดินทาง — backend ปฏิเสธ (409) ถ้าออเดอร์อยู่บน Route active หรือปิดงานแล้ว
export async function cancelOrder(
  orderId: string,
  input: { reason: CancelReason; note?: string; recordedBy?: Handler },
) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return normalizeOrder(result);
}

export async function resolveReturnedOrder(
  orderId: string,
  input: {
    resolution: 'replan' | 'immediate' | 'awaiting_decision';
    note?: string;
  },
) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/resolve-route-return`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return normalizeOrder(result);
}

// ถอนการมอบหมายงานที่ยังไม่มี Route แล้วคืนเข้า ready queue
export async function unassignAppOrder(
  orderId: string,
  input: { reason: PlanningCancelReason; note?: string },
) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/unassign`,
    { method: 'POST', body: JSON.stringify(input) },
  );
  return normalizeOrder(result);
}

export async function syncAppOrder(order: Order) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/sync`, {
    method: 'POST',
    body: JSON.stringify({ order: serializeOrderForBackend(order) }),
  });
  return normalizeOrder(result);
}

export async function submitAppDeliveryProof(orderId: string, input: SubmitDeliveryInput) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/submit-delivery-proof`,
    {
      method: 'POST',
      body: JSON.stringify({
        proof: proofPayload(input),
        recordedBy: input.recordedBy,
      }),
    },
  );
  return normalizeOrder(result);
}

export async function confirmAppDelivery(orderId: string, input?: ConfirmDeliveryInput) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/confirm-delivery`,
    {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    },
  );
  return normalizeOrder(result);
}

export function addOrderActivity(
  orderId: string,
  input: {
    type: string;
    actor: OrderActivityActor;
    summary: string;
    details?: string;
    changes?: unknown;
  },
) {
  return request<OrderActivityEvent>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/activity`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}
