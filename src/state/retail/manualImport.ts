import type { Handler, Order, ShippingMethod } from '@/data/mock';
import { newEventId, operatorActor } from '@/state/retail/timeline';
import type { RetailState } from '@/state/retail/types';

export type ManualImportOrderInput = {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerIdCard?: string;
  itemName: string;
  itemSku?: string;
  itemPurity?: string;
  itemWeight?: string;
  itemQty: number;
  itemUnitPrice: number;
  totalValue: number;
  payment: Order['payment'];
  shippingMethod: ShippingMethod;
  note?: string;
  rawData?: Record<string, string>;
  requiresIdCheck: boolean;
  insured: boolean;
};

function nextManualOrderIdentity(orders: Order[], offset: number) {
  const maxNumber = orders.reduce((max, order) => {
    const match = order.code.match(/#AUS-(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1040);

  const nextNumber = maxNumber + offset + 1;
  return {
    id: `O-${nextNumber}`,
    code: `#AUS-${nextNumber}`,
  };
}

function buildManualOrder(
  current: RetailState,
  input: ManualImportOrderInput,
  offset: number,
): Order {
  const identity = nextManualOrderIdentity(current.orders, offset);
  const receivedAt = new Date().toISOString();
  const handledBy: Handler = {
    name: 'พนักงาน Ausiris',
    department: 'Manual Import',
  };
  const actor = operatorActor(handledBy);
  const itemQty = Math.max(1, Math.trunc(input.itemQty || 1));
  const itemUnitPrice = Math.max(0, input.itemUnitPrice || 0);
  const totalValue = Math.max(0, input.totalValue || itemQty * itemUnitPrice);

  return {
    ...identity,
    source: 'manual',
    status: 'needs_review',
    receivedAt,
    handledBy,
    confidence: 100,
    customer: {
      name: input.customerName.trim(),
      phone: input.customerPhone.trim() || 'รอตรวจ',
      address: input.customerAddress.trim(),
      idCard: input.customerIdCard?.trim() || undefined,
    },
    items: [
      {
        sku: input.itemSku?.trim() || '-',
        name: input.itemName.trim(),
        purity: input.itemPurity?.trim() || '-',
        weight: input.itemWeight?.trim() || '-',
        qty: itemQty,
        unitPrice: itemUnitPrice,
      },
    ],
    note: input.note?.trim() || 'นำเข้าด้วย Manual Import · ตรวจสอบก่อนยืนยันเข้าคิว',
    rawText: input.rawData
      ? Object.entries(input.rawData)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')
      : undefined,
    totalValue,
    payment: input.payment,
    requiresIdCheck: input.requiresIdCheck,
    insured: input.insured,
    shippingMethod: input.shippingMethod,
    metadataJson: input.rawData
      ? {
          import: {
            batchId: `manual-${receivedAt}`,
            fileName: 'manual-import',
            source: 'MANUAL',
            rowIndex: offset,
            importedAt: receivedAt,
            columns: input.rawData,
          },
        }
      : undefined,
    activityLog: [
      {
        id: newEventId(),
        type: 'order_received',
        at: receivedAt,
        actor,
        summary: 'บันทึกออเดอร์จาก Manual Import',
        details: input.rawData ? 'สร้างจาก preview รายการก่อนนำเข้า' : undefined,
      },
    ],
  };
}

export function createManualImportOrdersState(
  current: RetailState,
  inputs: ManualImportOrderInput[],
) {
  const orders = inputs.map((input, index) => buildManualOrder(current, input, index));

  return {
    createdIds: orders.map((order) => order.id),
    nextState: {
      ...current,
      orders: [...orders, ...current.orders],
    },
  };
}
