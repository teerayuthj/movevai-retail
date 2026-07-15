import type { Driver, Order } from '@/data/orderTypes';

const DEFAULT_DRIVER_CAPACITY = 99;

export type ApiDriver = Omit<Driver, 'id' | 'zone' | 'capacity'> & {
  id: string;
  code: string;
  zone?: string;
  capacity?: number;
};
export type ApiOrder = Order & {
  assignedDriver?: ApiDriver;
  coDriverCodes?: string[];
};
export type ApiOrderWire = Omit<ApiOrder, 'orderNo'> & { orderNo?: string | null };

export type DriverApprovalStatus = NonNullable<Driver['approvalStatus']>;

export function normalizeDriver(driver: ApiDriver): Driver {
  return {
    ...driver,
    id: driver.code,
    zone: driver.zone ?? '',
    capacity: driver.capacity ?? DEFAULT_DRIVER_CAPACITY,
  };
}

export function normalizeOrder(order: ApiOrderWire): Order {
  return {
    ...order,
    // draft LINE import ยังไม่มีเลข (null) — ห้าม fallback เป็น code เพราะช่องเลขต้องว่างจนกว่าจะอนุมัติ
    orderNo: order.orderNo ?? null,
    assignedDriverId: order.assignedDriver?.code,
    assignedDriverName: order.assignedDriver?.name,
    coDriverIds: order.coDriverCodes,
    proofOfDelivery: order.proofOfDelivery
      ? {
          ...order.proofOfDelivery,
          capturedByDriverId:
            order.assignedDriver?.code ?? order.proofOfDelivery.capturedByDriverId,
        }
      : undefined,
  };
}

// รับได้ทั้งค่าปกติ ('cod'/'prepaid'/'transfer_on_delivery') และข้อความไทยดิบที่หลงเหลือจาก
// import เก่า (เช่น "โอน") ก่อนถูก normalize ผ่านหน้าตรวจ import — backend รับเฉพาะ enum
// ปกติเท่านั้น ไม่ normalize ให้ที่ /orders/sync และ /orders/assign
function normalizePaymentForBackend(value: Order['payment']): Order['payment'] {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'cod' || normalized.includes('ปลายทาง')) return 'cod';
  if (
    normalized === 'transfer_on_delivery' ||
    normalized.includes('โอนตอนส่ง') ||
    normalized.includes('โอนเมื่อส่ง')
  ) {
    return 'transfer_on_delivery';
  }
  if (
    normalized === 'prepaid' ||
    normalized === 'transfer' ||
    normalized === 'paid' ||
    normalized === 'โอน' ||
    normalized === 'โอนแล้ว' ||
    normalized.includes('ชำระแล้ว')
  ) {
    return 'prepaid';
  }
  return 'prepaid';
}

export function serializeOrderForBackend(order: Order) {
  return {
    id: order.id,
    // Draft LINE imports intentionally have no order number until approval.
    // The backend schema treats orderNo as an optional string, so sending null
    // from a stale pre-approval snapshot makes approve + dispatch fail.
    ...(order.orderNo ? { orderNo: order.orderNo } : {}),
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
    payment: normalizePaymentForBackend(order.payment),
    dispatchReadiness: order.dispatchReadiness,
    requiresIdCheck: order.requiresIdCheck,
    insured: order.insured,
    shippingMethod: order.shippingMethod,
    metadataJson: order.metadataJson,
  };
}
