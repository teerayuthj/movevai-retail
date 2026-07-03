import type { Order } from '@/data/orderTypes';
import {
  defaultChannelForOrder,
  recipientForChannel,
  renderNotificationMessage,
  simulateProviderSend,
  type CustomerNotification,
  type NotificationChannel,
  type NotificationTemplateKey,
} from '@/lib/notifications';
import { DEFAULT_HANDLER, newEventId, nowIso } from '@/state/retail/timeline';
import type { RetailState } from '@/state/retail/types';

export type SendCustomerNotificationInput = {
  channel?: NotificationChannel;
  templateKey: NotificationTemplateKey;
  recordedBy?: Order['handledBy'];
};

function resolveChannel(order: Order, channel?: NotificationChannel): NotificationChannel {
  if (channel === 'line' && !order.lineContact) return 'sms';
  return channel ?? defaultChannelForOrder(order);
}

function buildNotificationRecord(
  order: Order,
  input: SendCustomerNotificationInput,
  sentAt: string,
): CustomerNotification {
  const channel = resolveChannel(order, input.channel);
  const { message, trackingUrl } = renderNotificationMessage(order, input.templateKey);

  const base: CustomerNotification = {
    id: newEventId(),
    orderId: order.id,
    orderCode: order.code,
    customerName: order.customer.name,
    recipient: recipientForChannel(order, channel),
    channel,
    templateKey: input.templateKey,
    message,
    trackingUrl,
    status: 'sent',
    sentAt,
    sentBy: input.recordedBy ?? DEFAULT_HANDLER,
  };

  // จำลองการยิง provider แล้วเก็บผลไว้ debug (ต่อ API จริงให้แทน simulateProviderSend)
  const { status, providerResponse } = simulateProviderSend(base);
  return { ...base, status, providerResponse };
}

export function createCustomerNotificationRecords(
  state: RetailState,
  orderIds: string[],
  input: SendCustomerNotificationInput,
): CustomerNotification[] {
  const sentAt = nowIso();
  const ordersById = new Map(state.orders.map((order) => [order.id, order]));

  return orderIds
    .map((orderId) => ordersById.get(orderId))
    .filter((order): order is Order => !!order)
    .map((order) => buildNotificationRecord(order, input, sentAt));
}

/**
 * บันทึก notification ลง outbox (จำลองการส่ง — สถานะ 'sent' เสมอ).
 * เมื่อต่อ LINE OA / SMS gateway จริง ให้เปลี่ยนจุดนี้เป็น async call แล้วอัปเดต status ตามผลลัพธ์.
 */
export function sendCustomerNotificationsState(
  state: RetailState,
  orderIds: string[],
  input: SendCustomerNotificationInput,
): RetailState {
  const records = createCustomerNotificationRecords(state, orderIds, input);
  if (records.length === 0) return state;

  return {
    ...state,
    notifications: [...records, ...(state.notifications ?? [])],
  };
}

export function sendCustomerNotificationState(
  state: RetailState,
  orderId: string,
  input: SendCustomerNotificationInput,
): RetailState {
  return sendCustomerNotificationsState(state, [orderId], input);
}
