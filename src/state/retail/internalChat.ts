import type { Handler, Order } from '@/data/mock';
import { newEventId, operatorActor } from '@/state/retail/timeline';
import type { InternalChatOrderInput, RetailState } from '@/state/retail/types';

function nextOrderIdentity(orders: Order[]) {
  const maxNumber = orders.reduce((max, order) => {
    const match = order.code.match(/#AUS-(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1040);

  const nextNumber = maxNumber + 1;
  return {
    id: `O-${nextNumber}`,
    code: `#AUS-${nextNumber}`,
  };
}

function extractPhone(message: string) {
  return message.match(/(?:\+?66|0)\d[\d\s-]{7,12}\d/)?.[0]?.replace(/\s+/g, ' ') ?? 'รอตรวจ';
}

function extractCustomerName(message: string) {
  const named = message.match(/(?:ชื่อ|ลูกค้า|ร้าน)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim();
  if (named) return named;

  const firstUsefulLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.match(/(?:โทร|เบอร์|รวม|ที่อยู่)/i));

  return firstUsefulLine ?? 'รอตรวจจาก Chat ภายใน';
}

function extractTotal(message: string) {
  const totalText = message.match(/(?:รวม|ยอดรวม|total)\s*[:：]?\s*฿?\s*([\d,]+)/i)?.[1];
  return totalText ? Number(totalText.replace(/,/g, '')) : 0;
}

function buildInternalChatOrder(current: RetailState, input: InternalChatOrderInput): Order {
  const identity = nextOrderIdentity(current.orders);
  const receivedAt = new Date().toISOString();
  const message = input.message.trim();
  const totalValue = extractTotal(message);
  const qty =
    Number(
      message.match(/(?:x|×)\s*(\d+)|(\d+)\s*ชิ้น/i)?.[1] ??
        message.match(/(?:x|×)\s*(\d+)|(\d+)\s*ชิ้น/i)?.[2] ??
        1,
    ) || 1;
  const purity = message.includes('99.99') ? '99.99%' : '96.5%';
  const weight =
    message.match(/(\d+(?:\.\d+)?\s*(?:บาท|สลึง|กรัม|g|kg))/i)?.[1] ??
    (purity === '99.99%' ? '10 กรัม' : '1 บาท (15.244 ก.)');
  const unitPrice =
    totalValue > 0
      ? Math.round(totalValue / Math.max(1, qty))
      : purity === '99.99%'
        ? 32500
        : 45200;
  const fileSummary =
    input.files.length > 0
      ? `\n\nไฟล์แนบ:\n${input.files.map((file) => `- ${file.name}`).join('\n')}`
      : '';

  const handledBy: Handler = {
    name: 'พนักงาน Ausiris',
    department: 'Internal Chat',
  };
  const operator = operatorActor(handledBy);

  return {
    ...identity,
    source: 'internal_chat',
    status: 'needs_review',
    receivedAt,
    handledBy,
    confidence: 70,
    customer: {
      name: extractCustomerName(message),
      phone: extractPhone(message),
      address:
        message.match(/(?:ที่อยู่|ส่งที่)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim() ??
        'รอตรวจที่อยู่จัดส่ง',
    },
    items: [
      {
        sku: purity === '99.99%' ? 'AUS-INV-9999-10G' : 'AUS-BAR-965-1B',
        name:
          purity === '99.99%'
            ? 'AUSIRIS ทองคำแท่ง 99.99% Investment Grade'
            : 'AUSIRIS ทองคำแท่ง 96.5%',
        purity,
        weight,
        qty: Math.max(1, qty),
        unitPrice,
        note: 'สร้างจาก Chat ภายใน โปรดตรวจเทียบกับข้อความ/ไฟล์ต้นฉบับ',
      },
    ],
    note: 'นำเข้าผ่าน Chat ภายใน · ตรวจรายการสินค้า จำนวน น้ำหนัก และยอดรวมก่อนยืนยันเข้าคิว',
    rawText: `${message || 'ไม่มีข้อความประกอบ'}${fileSummary}`,
    totalValue: totalValue > 0 ? totalValue : unitPrice * Math.max(1, qty),
    payment: 'prepaid',
    requiresIdCheck: true,
    insured: true,
    activityLog: [
      {
        id: newEventId(),
        type: 'order_received',
        at: receivedAt,
        actor: operator,
        summary: 'รับงานเข้าระบบจาก Chat ภายใน',
        details: input.files.length > 0 ? `แนบไฟล์ ${input.files.length} ไฟล์` : undefined,
      },
      {
        id: newEventId(),
        type: 'order_created_from_internal_chat',
        at: receivedAt,
        actor: operator,
        summary: 'สร้าง draft จาก Chat ภายใน — รอตรวจใน Inbox',
      },
    ],
  };
}

export function createInternalChatOrderState(current: RetailState, input: InternalChatOrderInput) {
  const order = buildInternalChatOrder(current, input);

  return {
    createdId: order.id,
    nextState: {
      ...current,
      orders: [order, ...current.orders],
    },
  };
}
