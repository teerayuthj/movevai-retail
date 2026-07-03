import { Order, formatTHB, paymentLabel } from '@/data/orderTypes';

export function buildRawText(order: Order): string {
  const lines: string[] = [];

  lines.push('สวัสดีค่ะ ขอสั่งของตามนี้นะคะ');
  lines.push(`ชื่อ: ${order.customer.name}`);
  lines.push(`โทร: ${order.customer.phone}`);
  lines.push(`ที่อยู่: ${order.customer.address}`);
  lines.push('');
  lines.push('รายการ:');

  order.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.name} ${item.purity} ${item.weight} x ${item.qty} ชิ้น`);
  });

  lines.push('');
  lines.push(`รวม ${formatTHB(order.totalValue)}`);
  lines.push(`ชำระ: ${paymentLabel[order.payment]}`);

  if (order.note) {
    lines.push('');
    lines.push(`หมายเหตุ: ${order.note}`);
  }

  return lines.join('\n');
}

export function buildOrderSearchText(order: Order): string {
  return [
    order.code,
    order.customer.name,
    order.customer.phone,
    order.customer.address,
    ...order.items.map((item) => `${item.sku} ${item.name}`),
  ]
    .join(' ')
    .toLowerCase();
}
