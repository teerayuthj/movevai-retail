import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bot,
  CalendarClock,
  Check,
  Coins,
  Headset,
  Package,
  Pencil,
  ShieldCheck,
  StickyNote,
  Truck,
  UserCircle2,
  Scale,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Separator } from '@/components/ui/separator';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  Order,
  OrderItem,
  ShippingMethod,
  formatTHB,
  shippingMethodLabel,
  sourceLabel,
} from '@/data/orderTypes';
import CustomerInfoForm from '@/features/inbox/components/CustomerInfoForm';
import ShippingMethodSelector from '@/features/inbox/components/ShippingMethodSelector';
import { SourceIcon } from '@/features/inbox/components/OrderListItem';
import {
  formatRequestedDelivery,
  getOrderItemQty,
  getRawRequestedDelivery,
  getRequestedDeliveryDraft,
} from '@/features/inbox/utils/orderSchedule';
import { CANCELLABLE } from '@/state/retail/orders';
import type { UpdateOrderDetailsInput } from '@/state/retail/types';

const SHIPPING_EDITABLE_STATUSES: Order['status'][] = ['new', 'needs_review', 'ready'];

function getItemCountSummary(order: Order): string {
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  return `${totalQty.toLocaleString('th-TH')} ชิ้น · ${order.items.length.toLocaleString('th-TH')} รายการ`;
}

function ItemRow({ item, index }: { item: OrderItem; index: number }) {
  const lineTotal = item.qty * item.unitPrice;

  return (
    <div className="px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning/15 text-xs font-semibold text-warning">
          {index + 1}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{item.name}</span>
            <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px] font-semibold">
              <Coins className="h-2.5 w-2.5" />
              {item.purity}
            </Badge>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Scale className="h-3 w-3" />
              {item.weight}
            </span>
            <span className="font-mono">{item.sku}</span>
            <span>ราคา/ชิ้น {formatTHB(item.unitPrice)}</span>
          </div>

          {item.note && (
            <div className="mt-1 flex items-start gap-1 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[11px] text-warning">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{item.note}</span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">× {item.qty}</div>
          <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {formatTHB(lineTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}

type OrderDetailProps = {
  order: Order;
  onConfirm: (orderId: string, shippingMethod: ShippingMethod) => void;
  onSaveCustomer: (orderId: string, customer: Order['customer']) => void;
  onSaveDetails: (orderId: string, input: UpdateOrderDetailsInput) => void;
  onChangeShippingMethod: (orderId: string, method: ShippingMethod) => void;
  onRequestCancel: (orderId: string) => void;
};

export default function OrderDetail({
  order,
  onConfirm,
  onSaveCustomer,
  onSaveDetails,
  onChangeShippingMethod,
  onRequestCancel,
}: OrderDetailProps) {
  const [editing, setEditing] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState(order.customer);
  const [draftRequestedDelivery, setDraftRequestedDelivery] = useState(() =>
    getRequestedDeliveryDraft(order),
  );
  const [draftItemQty, setDraftItemQty] = useState(() => String(getOrderItemQty(order) || 1));

  useEffect(() => {
    setEditing(false);
    setDraftCustomer(order.customer);
    setDraftRequestedDelivery(getRequestedDeliveryDraft(order));
    setDraftItemQty(String(getOrderItemQty(order) || 1));
    // reset only on order switch, not on external customer updates during editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const lowConfidence = order.confidence < 80;
  const isHighValue = order.totalValue >= 500000;
  const shippingMethod: ShippingMethod = order.shippingMethod ?? 'internal_driver';
  const shippingLocked = !SHIPPING_EDITABLE_STATUSES.includes(order.status);
  const confirmLabel =
    order.status === 'ready'
      ? 'อยู่ในคิวแล้ว'
      : shippingMethod === 'thai_post'
        ? 'ยืนยันเข้าคิวไปรษณีย์'
        : 'ยืนยันเข้าคิว';
  const requestedDeliveryDraft = getRequestedDeliveryDraft(order);
  const rawRequestedDelivery = getRawRequestedDelivery(order);
  const requestedDelivery = formatRequestedDelivery(requestedDeliveryDraft);
  const rawRequestedDeliveryLabel =
    rawRequestedDelivery.date &&
    (rawRequestedDelivery.date !== requestedDeliveryDraft.date ||
      rawRequestedDelivery.time !== requestedDeliveryDraft.time)
      ? formatRequestedDelivery(rawRequestedDelivery)
      : '';
  const itemCountSummary = getItemCountSummary(order);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold">{order.code}</span>
            <Badge variant="muted">
              <SourceIcon source={order.source} />
              <span className="ml-1">{sourceLabel[order.source]}</span>
            </Badge>
            {lowConfidence && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                ต้องตรวจ
              </Badge>
            )}
            {isHighValue && (
              <Badge
                variant="warning"
                className="gap-1 border-destructive/30 bg-destructive/10 text-destructive"
              >
                <ShieldCheck className="h-3 w-3" />
                High-value
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            เข้าระบบเมื่อ {new Date(order.receivedAt).toLocaleString('th')}
          </div>
        </div>

        <div className="flex gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftCustomer(order.customer);
                  setDraftRequestedDelivery(getRequestedDeliveryDraft(order));
                  setDraftItemQty(String(getOrderItemQty(order) || 1));
                  setEditing(false);
                }}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSaveCustomer(order.id, draftCustomer);
                  onSaveDetails(order.id, {
                    requestedDeliveryDate: draftRequestedDelivery.date,
                    requestedDeliveryTime: draftRequestedDelivery.time,
                    itemQty: Math.max(1, Number.parseInt(draftItemQty, 10) || 1),
                  });
                  setEditing(false);
                }}
              >
                <Check className="h-3.5 w-3.5" /> บันทึก
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> แก้ไข
            </Button>
          )}

          {CANCELLABLE.includes(order.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRequestCancel(order.id)}
              className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Ban className="h-3.5 w-3.5" /> ยกเลิก
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => onConfirm(order.id, shippingMethod)}
            disabled={order.status === 'ready'}
          >
            <Check className="h-3.5 w-3.5" />
            {confirmLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">นัดส่ง</div>
            {editing ? (
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_88px] gap-1">
                <DatePicker
                  size="sm"
                  value={draftRequestedDelivery.date}
                  onChange={(value) =>
                    setDraftRequestedDelivery((current) => ({
                      ...current,
                      date: value,
                    }))
                  }
                  className="min-w-0"
                />
                <input
                  type="time"
                  value={draftRequestedDelivery.time}
                  onChange={(event) =>
                    setDraftRequestedDelivery((current) => ({
                      ...current,
                      time: event.target.value,
                    }))
                  }
                  className="h-8 min-w-0 rounded-md border bg-background px-3 text-xs"
                />
              </div>
            ) : (
              <div className="mt-0.5 text-sm font-medium">{requestedDelivery}</div>
            )}
            {rawRequestedDeliveryLabel && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                ต้นฉบับ {rawRequestedDeliveryLabel}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">จำนวนสินค้า</div>
            {editing ? (
              <input
                type="number"
                min={1}
                inputMode="numeric"
                value={draftItemQty}
                onChange={(event) => setDraftItemQty(event.target.value)}
                className="mt-1 h-8 w-24 rounded-md border bg-background px-3 text-xs"
              />
            ) : (
              <div className="mt-0.5 text-sm font-medium">{itemCountSummary}</div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Truck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">วิธีจัดส่ง</div>
            <div className="mt-0.5 text-sm font-medium">{shippingMethodLabel[shippingMethod]}</div>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-success/10 text-success">
            <Coins className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">มูลค่ารวม</div>
            <div className="mt-0.5 text-sm font-medium tabular-nums">
              {formatTHB(order.totalValue)}
            </div>
          </div>
        </div>
      </div>

      {order.source !== 'manual' && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            {order.lineContact ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Avatar className="h-9 w-9 bg-[#06c755]/10">
                    <AvatarFallback className="bg-[#06c755]/10 text-[#06c755]">
                      {order.lineContact.displayName.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#06c755] text-[8px] font-bold text-white">
                    L
                  </span>
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    ส่งจาก LINE OA
                  </div>
                  <div className="text-sm font-medium">{order.lineContact.displayName}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {order.lineContact.lineUserId}
                    {order.lineContact.isOfficialContact && ' · ✓ ผูกบัญชีลูกค้าแล้ว'}
                  </div>
                </div>
              </div>
            ) : order.source === 'internal_chat' ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-9 w-9 bg-primary/10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="leading-tight">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    ส่งจาก Chat ภายใน
                  </div>
                  <div className="text-sm font-medium">Internal order intake</div>
                  <div className="text-[10px] text-muted-foreground">
                    พนักงาน drop ข้อความหรือไฟล์เข้าระบบโดยตรง
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>
                    <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <div className="leading-tight">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    ที่มา
                  </div>
                  <div className="text-sm font-medium">บันทึกหน้าเคาน์เตอร์</div>
                  <div className="text-[10px] text-muted-foreground">ไม่ผ่าน LINE OA</div>
                </div>
              </div>
            )}

            <ArrowRight className="h-4 w-4 text-muted-foreground" />

            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9 bg-primary/10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {order.handledBy.name.slice(0, 1)}
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Headset className="mr-1 inline h-3 w-3" />
                  รับเรื่อง / ส่งเข้าระบบโดย
                </div>
                <div className="text-sm font-medium">{order.handledBy.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {order.handledBy.department}
                  {order.handledBy.role && ` · ${order.handledBy.role}`}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ShippingMethodSelector
        value={shippingMethod}
        disabled={shippingLocked}
        onChange={(method) => onChangeShippingMethod(order.id, method)}
      />

      {lowConfidence && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div className="text-xs">
            <div className="font-medium text-warning">ต้องตรวจข้อมูลบางรายการ</div>
            <div className="text-warning">
              โปรดตรวจข้อมูลที่อ่านจากไฟล์หรือข้อความต้นทางก่อนยืนยันเข้าคิว
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ข้อมูลผู้รับ</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerInfoForm
              key={order.id}
              customer={draftCustomer}
              editing={editing}
              onChange={setDraftCustomer}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Coins className="h-4 w-4 text-warning" /> รายการทองคำ / เงิน
              </CardTitle>
              <Badge variant="muted">{order.items.length} รายการ</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {order.items.map((item, index) => (
                <ItemRow key={index} item={item} index={index} />
              ))}
            </div>
            <Separator />
            <div className="flex items-center justify-between px-6 py-3">
              <span className="text-xs text-muted-foreground">
                ราคาปิด (อ้างอิงสมาคมค้าทองคำ {new Date(order.receivedAt).toLocaleDateString('th')})
              </span>
              <span className="text-base font-semibold tabular-nums text-warning">
                {formatTHB(order.totalValue)}
              </span>
            </div>
          </CardContent>
        </Card>

        {order.note && (
          <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
            <StickyNote className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">{order.note}</div>
          </div>
        )}
      </div>

      <OrderTimeline
        order={order}
        description="กิจกรรมและการเปลี่ยนแปลงข้อมูลของออเดอร์นี้"
        compact
      />
    </div>
  );
}
