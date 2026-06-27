import type { Handler, Order, OrderStatus } from '@/data/mock';
import { buildCustomerTrackingUrl, getPlannedDelivery } from '@/lib/customerTracking';
import { formatPlanningDateTime } from '@/lib/deliveryPlanning';

/**
 * ช่องทางแจ้งเตือนลูกค้า — ปัจจุบัน "จำลอง" การส่ง (ยังไม่มี backend สำหรับ LINE OA / SMS gateway)
 * เมื่อมี API จริง ให้สลับเฉพาะ sender ใน state/retail/notifications.ts (เหมือนที่ messenger ทำ)
 */
export type NotificationChannel = 'line' | 'sms';

export type NotificationTemplateKey =
  | 'order_received'
  | 'scheduled'
  | 'out_for_delivery'
  | 'arriving_soon'
  | 'delivered'
  | 'failed'
  | 'tracking_link';

export type NotificationStatus = 'sent' | 'queued' | 'failed';

/** สถานะการนำส่งที่ provider (LINE/SMS) รายงานกลับมา — accepted = รับคำขอแล้ว, delivered/read = ถึงปลายทาง */
export type ProviderDeliveryState = 'accepted' | 'delivered' | 'read' | 'failed';

export type ProviderStatusEvent = {
  state: ProviderDeliveryState;
  at: string;
  detail?: string;
};

/**
 * สิ่งที่ provider ตอบกลับเวลายิง API — เก็บไว้ debug หลังกดส่ง
 * (ตอนนี้จำลอง; เมื่อต่อ gateway จริงให้แทนด้วยค่าจริงจาก response)
 */
export type ProviderResponse = {
  provider: string; // ชื่อ provider เช่น 'LINE Messaging API'
  endpoint: string; // path ที่ยิงไป
  messageId: string; // id อ้างอิงฝั่ง provider
  httpStatus: number; // 200 / 400 / 429 ...
  latencyMs: number;
  requestPayload: unknown; // payload ที่เราส่งไป
  responsePayload: unknown; // payload ดิบที่ provider ตอบกลับ
  errorCode?: string;
  errorMessage?: string;
  statusHistory: ProviderStatusEvent[]; // ไทม์ไลน์สถานะนำส่ง
};

/** record ที่บันทึกไว้ใน outbox เมื่อ CS กดส่งแจ้งเตือนหาลูกค้า */
export type CustomerNotification = {
  id: string;
  orderId: string;
  orderCode: string;
  customerName: string;
  recipient: string; // เบอร์/ช่องทางปลายทาง (เก็บดิบ — mask ตอนแสดงผลด้วย maskPhone)
  channel: NotificationChannel;
  templateKey: NotificationTemplateKey;
  message: string; // ข้อความที่เรนเดอร์แล้ว (รวมลิงก์ tracking)
  trackingUrl: string;
  status: NotificationStatus;
  sentAt: string;
  sentBy?: Handler;
  providerResponse?: ProviderResponse; // ผลตอบกลับจาก provider (ไว้ debug)
};

export const channelLabel: Record<NotificationChannel, string> = {
  line: 'LINE',
  sms: 'SMS',
};

export const notificationStatusLabel: Record<NotificationStatus, string> = {
  sent: 'ส่งแล้ว',
  queued: 'รอส่ง',
  failed: 'ส่งไม่สำเร็จ',
};

type TemplateDefinition = {
  key: NotificationTemplateKey;
  label: string;
  /** สร้างเนื้อความ (ยังไม่รวมลิงก์ tracking — ตัวเรนเดอร์จะต่อท้ายให้) */
  body: (order: Order) => string;
};

function plannedDeliveryText(order: Order): string {
  const planned = getPlannedDelivery(order);
  if (!planned) return 'เร็วๆ นี้';
  return formatPlanningDateTime(planned.date, planned.time);
}

/** เทมเพลตข้อความภาษาไทย — เรียงตามลำดับ flow การส่ง */
export const NOTIFICATION_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'order_received',
    label: 'รับคำสั่งซื้อแล้ว',
    body: (order) =>
      `เรียนคุณ${order.customer.name} ทาง Ausiris ได้รับคำสั่งซื้อ ${order.code} เรียบร้อยแล้ว ` +
      `ทีมงานกำลังเตรียมสินค้าให้ครับ/ค่ะ`,
  },
  {
    key: 'scheduled',
    label: 'นัดหมายวันจัดส่ง',
    body: (order) =>
      `คำสั่งซื้อ ${order.code} นัดหมายจัดส่งวันที่ ${plannedDeliveryText(order)} ` +
      `ติดตามสถานะแบบเรียลไทม์ได้ที่ลิงก์ด้านล่างครับ/ค่ะ`,
  },
  {
    key: 'out_for_delivery',
    label: 'พนักงานออกเดินทางแล้ว',
    body: (order) =>
      `พนักงานรับสินค้าคำสั่งซื้อ ${order.code} และกำลังเดินทางไปส่งแล้ว ` +
      `ดูตำแหน่งพนักงานแบบเรียลไทม์ได้ที่ลิงก์ด้านล่างครับ/ค่ะ`,
  },
  {
    key: 'arriving_soon',
    label: 'ใกล้ถึงแล้ว',
    body: (order) =>
      `พนักงานกำลังจะถึงที่หมายสำหรับคำสั่งซื้อ ${order.code} ` +
      `รบกวนเตรียมรับสินค้าด้วยครับ/ค่ะ ดูตำแหน่งได้ที่ลิงก์ด้านล่าง`,
  },
  {
    key: 'delivered',
    label: 'จัดส่งสำเร็จ',
    body: (order) =>
      `คำสั่งซื้อ ${order.code} จัดส่งสำเร็จเรียบร้อยแล้ว ` +
      `ขอบคุณที่ใช้บริการ Ausiris ครับ/ค่ะ ดูหลักฐานการส่งมอบได้ที่ลิงก์ด้านล่าง`,
  },
  {
    key: 'failed',
    label: 'จัดส่งไม่สำเร็จ',
    body: (order) =>
      `ทาง Ausiris ไม่สามารถจัดส่งคำสั่งซื้อ ${order.code} ได้ในรอบนี้ ` +
      `ทีมงานจะติดต่อกลับเพื่อนัดหมายใหม่ ดูรายละเอียดได้ที่ลิงก์ด้านล่างครับ/ค่ะ`,
  },
  {
    key: 'tracking_link',
    label: 'ส่งลิงก์ติดตาม',
    body: (order) => `ติดตามสถานะคำสั่งซื้อ ${order.code} ของคุณได้ที่ลิงก์ด้านล่างครับ/ค่ะ`,
  },
];

const templateByKey = Object.fromEntries(
  NOTIFICATION_TEMPLATES.map((template) => [template.key, template]),
) as Record<NotificationTemplateKey, TemplateDefinition>;

export function getTemplateLabel(key: NotificationTemplateKey): string {
  return templateByKey[key]?.label ?? key;
}

/** เทมเพลตที่เหมาะกับสถานะปัจจุบันของออเดอร์ — ใช้เป็น default ในหน้า compose */
export function suggestTemplateForStatus(status: OrderStatus): NotificationTemplateKey {
  switch (status) {
    case 'new':
    case 'parsing':
    case 'needs_review':
    case 'ready':
      return 'order_received';
    case 'assigned':
      return 'scheduled';
    case 'in_transit':
      return 'out_for_delivery';
    case 'pending_confirmation':
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    case 'returning':
    case 'returned':
    case 'cancelled':
    case 'rejected':
      return 'tracking_link';
  }
}

/**
 * สถานะ "ค้างแจ้ง" ของออเดอร์ — ใช้จัด triage ในหน้าแจ้งเตือน
 * (คำนวณจากข้อมูลที่มีอยู่ ไม่ต้องเพิ่ม field — เทียบ template ที่ควรแจ้งตอนนี้กับที่แจ้งล่าสุด)
 */
export type NotifyTriage =
  | { kind: 'never' } // ยังไม่เคยแจ้ง
  | { kind: 'status_advanced'; from: NotificationTemplateKey; to: NotificationTemplateKey } // สถานะขยับเกินที่แจ้งไว้
  | { kind: 'failed'; errorCode?: string } // ส่งครั้งล่าสุดไม่สำเร็จ
  | { kind: 'done' }; // แจ้งครบแล้ว (สถานะตรงกับที่แจ้งล่าสุด)

export function getNotifyTriage(order: Order, latest?: CustomerNotification): NotifyTriage {
  if (!latest) return { kind: 'never' };
  if (latest.status === 'failed') {
    return { kind: 'failed', errorCode: latest.providerResponse?.errorCode };
  }
  const next = suggestTemplateForStatus(order.status);
  if (next !== latest.templateKey) {
    return { kind: 'status_advanced', from: latest.templateKey, to: next };
  }
  return { kind: 'done' };
}

/** ออเดอร์นี้ยัง "ต้องแจ้ง" ลูกค้าอยู่ไหม */
export function isNotifyNeeded(triage: NotifyTriage): boolean {
  return triage.kind !== 'done';
}

/** ลำดับความสำคัญในการเรียง (น้อย = ด่วนกว่า) — fail ก่อน, ยังไม่เคยแจ้ง, สถานะขยับ, แจ้งครบ */
export function notifyTriagePriority(triage: NotifyTriage): number {
  switch (triage.kind) {
    case 'failed':
      return 0;
    case 'never':
      return 1;
    case 'status_advanced':
      return 2;
    case 'done':
      return 3;
  }
}

/** เรนเดอร์ข้อความเต็ม = เนื้อความเทมเพลต + ลิงก์ tracking */
export function renderNotificationMessage(
  order: Order,
  templateKey: NotificationTemplateKey,
  origin?: string,
): { message: string; trackingUrl: string } {
  const template = templateByKey[templateKey] ?? templateByKey.tracking_link;
  const trackingUrl = buildCustomerTrackingUrl(order.id, origin);
  const message = `${template.body(order)}\n${trackingUrl}`;
  return { message, trackingUrl };
}

/** ช่องทางที่จะส่ง — เลือก LINE ถ้าลูกค้าผูก LINE OA ไว้ ไม่งั้นเป็น SMS */
export function defaultChannelForOrder(order: Order): NotificationChannel {
  return order.lineContact ? 'line' : 'sms';
}

/** ปลายทางที่จะแสดง/ส่ง ตามช่องทาง */
export function recipientForChannel(order: Order, channel: NotificationChannel): string {
  if (channel === 'line' && order.lineContact) {
    return order.lineContact.displayName;
  }
  return order.customer.phone;
}

export const providerLabel: Record<NotificationChannel, string> = {
  line: 'LINE Messaging API',
  sms: 'SMS Gateway (Thai Bulk SMS)',
};

const PROVIDER_ENDPOINT: Record<NotificationChannel, string> = {
  line: 'POST https://api.line.me/v2/bot/message/push',
  sms: 'POST https://api.thaibulksms.com/sms/send',
};

export const providerDeliveryStateLabel: Record<ProviderDeliveryState, string> = {
  accepted: 'provider รับคำขอแล้ว',
  delivered: 'ถึงปลายทางแล้ว',
  read: 'ลูกค้าเปิดอ่านแล้ว',
  failed: 'นำส่งไม่สำเร็จ',
};

// error ที่จำลองได้ต่อช่องทาง — อิงรูปแบบจริงของแต่ละ provider
const SIMULATED_ERRORS: Record<
  NotificationChannel,
  { httpStatus: number; code: string; message: string }[]
> = {
  line: [
    {
      httpStatus: 400,
      code: 'invalid_recipient',
      message: "The user hasn't added the LINE OA as a friend",
    },
    {
      httpStatus: 429,
      code: 'rate_limited',
      message: 'You have reached your monthly limit of messages',
    },
  ],
  sms: [
    {
      httpStatus: 400,
      code: 'invalid_number',
      message: 'Destination number is not a valid Thai mobile number',
    },
    {
      httpStatus: 402,
      code: 'insufficient_credit',
      message: 'Not enough SMS credit to send this message',
    },
  ],
};

function randomHex(length: number): string {
  let out = '';
  while (out.length < length) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out.slice(0, length);
}

function buildRequestPayload(notification: CustomerNotification): unknown {
  if (notification.channel === 'line') {
    return {
      to: notification.recipient,
      messages: [{ type: 'text', text: notification.message }],
    };
  }
  return {
    sender: 'Ausiris',
    msisdn: notification.recipient,
    message: notification.message,
  };
}

/**
 * จำลองการยิง provider แล้วคืน { status, providerResponse }.
 * สุ่ม fail ~18% เพื่อให้ debug view มีทั้งเคสสำเร็จ/ล้มเหลวให้ทดสอบ.
 * เมื่อต่อ API จริง — แทนทั้งฟังก์ชันนี้ด้วย fetch จริง แล้ว map response → ProviderResponse.
 */
export function simulateProviderSend(notification: CustomerNotification): {
  status: NotificationStatus;
  providerResponse: ProviderResponse;
} {
  const channel = notification.channel;
  const latencyMs = 120 + Math.floor(Math.random() * 480);
  const requestPayload = buildRequestPayload(notification);
  const sentAt = notification.sentAt;
  const failed = Math.random() < 0.18;

  if (failed) {
    const errors = SIMULATED_ERRORS[channel];
    const error = errors[Math.floor(Math.random() * errors.length)];
    return {
      status: 'failed',
      providerResponse: {
        provider: providerLabel[channel],
        endpoint: PROVIDER_ENDPOINT[channel],
        messageId: '',
        httpStatus: error.httpStatus,
        latencyMs,
        requestPayload,
        responsePayload:
          channel === 'line'
            ? { message: error.message, details: [{ property: 'to' }] }
            : { status: 'error', code: error.code, message: error.message },
        errorCode: error.code,
        errorMessage: error.message,
        statusHistory: [{ state: 'failed', at: sentAt, detail: `${error.code}: ${error.message}` }],
      },
    };
  }

  const messageId = channel === 'line' ? randomHex(32) : `SMS-${randomHex(12).toUpperCase()}`;
  // จำลองใบรับนำส่ง (delivery receipt) ที่ปกติมาทีหลังแบบ async — ตั้งเวลาถัดจากตอนส่งเล็กน้อย
  const acceptedAt = sentAt;
  const deliveredAt = new Date(new Date(sentAt).getTime() + latencyMs + 1500).toISOString();

  return {
    status: 'sent',
    providerResponse: {
      provider: providerLabel[channel],
      endpoint: PROVIDER_ENDPOINT[channel],
      messageId,
      httpStatus: channel === 'line' ? 200 : 202,
      latencyMs,
      requestPayload,
      responsePayload:
        channel === 'line'
          ? { 'x-line-request-id': messageId }
          : { status: 'success', messageId, credit_used: 1 },
      statusHistory: [
        { state: 'accepted', at: acceptedAt },
        { state: 'delivered', at: deliveredAt },
      ],
    },
  };
}
