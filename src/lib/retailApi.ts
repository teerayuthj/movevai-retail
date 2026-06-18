import type { Driver, Order } from '@/data/mock';
import type { SubmitDeliveryInput } from '@/state/retail/types';

const RIDER_API_BASE =
  (import.meta.env.VITE_RIDER_API_BASE_URL as string | undefined) ?? '/api/rider';
const APP_API_BASE = (import.meta.env.VITE_APP_API_BASE_URL as string | undefined) ?? '/api/app';

type ApiDriver = Omit<Driver, 'id'> & { id: string; code: string };
type ApiOrder = Order & { assignedDriver?: ApiDriver };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body != null) headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // response ไม่ใช่ JSON
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function normalizeDriver(driver: ApiDriver): Driver {
  return { ...driver, id: driver.code };
}

function normalizeOrder(order: ApiOrder): Order {
  return {
    ...order,
    assignedDriverId: order.assignedDriver?.code,
    proofOfDelivery: order.proofOfDelivery
      ? {
          ...order.proofOfDelivery,
          capturedByDriverId:
            order.assignedDriver?.code ?? order.proofOfDelivery.capturedByDriverId,
        }
      : undefined,
  };
}

function serializeOrderForBackend(order: Order) {
  return {
    id: order.id,
    code: order.code,
    source: order.source,
    status: order.status,
    receivedAt: new Date(order.receivedAt).toISOString(),
    lineContact: order.lineContact,
    handledBy: order.handledBy,
    confidence: order.confidence,
    customer: order.customer,
    items: order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      purity: item.purity,
      weight: item.weight,
      qty: item.qty,
      unitPrice: item.unitPrice,
      note: item.note,
    })),
    note: order.note,
    rawText: order.rawText,
    rawPreview: order.rawPreview,
    totalValue: order.totalValue,
    payment: order.payment,
    dispatchReadiness: order.dispatchReadiness,
    requiresIdCheck: order.requiresIdCheck,
    insured: order.insured,
    shippingMethod: order.shippingMethod,
  };
}

// อ่าน orders จาก backend สำหรับ dashboard ฝั่ง web (ใช้ refresh/poll)
export async function fetchAppOrders(params?: { status?: string; take?: number }) {
  const search = new URLSearchParams();
  if (params?.status) search.set('status', params.status);
  if (params?.take != null) search.set('take', String(params.take));
  const query = search.toString();
  const result = await request<{ items: ApiOrder[]; total: number }>(
    `${APP_API_BASE}/orders${query ? `?${query}` : ''}`,
  );
  return { orders: result.items.map(normalizeOrder), total: result.total };
}

export async function fetchAppDrivers() {
  const result = await request<ApiDriver[]>(`${APP_API_BASE}/drivers`);
  return result.map(normalizeDriver);
}

export async function syncAndAssignOrder(order: Order, driverCode: string) {
  const result = await request<ApiOrder>(`${APP_API_BASE}/orders/assign`, {
    method: 'POST',
    body: JSON.stringify({ order: serializeOrderForBackend(order), driverCode }),
  });
  return normalizeOrder(result);
}

export async function fetchRiderOrders(driverCode: string) {
  const result = await request<{ driver: ApiDriver; items: ApiOrder[] }>(
    `${RIDER_API_BASE}/${encodeURIComponent(driverCode)}/orders`,
  );
  return {
    driver: normalizeDriver(result.driver),
    orders: result.items.map(normalizeOrder),
  };
}

/**
 * รายการที่ rider ส่งสำเร็จแล้ว — projection แบบ privacy-minimal
 * (ไม่มีชื่อ/เบอร์/ที่อยู่ลูกค้า, ไม่มีมูลค่าสินค้า, ไม่มีระดับความเสี่ยง)
 */
export type RiderCompletedDelivery = {
  id: string;
  code: string;
  deliveredAt: string;
  itemCount: number;
  cod?: { collected: boolean; amount?: number };
  proof?: { photoCount: number; signatureCaptured: boolean; otpVerified: boolean };
};

export async function fetchRiderCompletedDeliveries(driverCode: string) {
  return request<{ driver: ApiDriver; total: number; items: RiderCompletedDelivery[] }>(
    `${RIDER_API_BASE}/${encodeURIComponent(driverCode)}/completed`,
  );
}

export async function startRiderOrder(orderId: string, driverCode: string) {
  const result = await request<ApiOrder>(
    `${RIDER_API_BASE}/orders/${encodeURIComponent(orderId)}/start`,
    {
      method: 'POST',
      body: JSON.stringify({ driverCode }),
    },
  );
  return normalizeOrder(result);
}

export async function submitRiderOrder(
  orderId: string,
  driverCode: string,
  proof: SubmitDeliveryInput,
) {
  const result = await request<ApiOrder>(
    `${RIDER_API_BASE}/orders/${encodeURIComponent(orderId)}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({ driverCode, proof }),
    },
  );
  return normalizeOrder(result);
}

export async function confirmAppDelivery(
  orderId: string,
  input?: { note?: string; recordedBy?: { name: string; department: string; role?: string } },
) {
  const result = await request<ApiOrder>(
    `${APP_API_BASE}/orders/${encodeURIComponent(orderId)}/confirm-delivery`,
    {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    },
  );
  return normalizeOrder(result);
}
