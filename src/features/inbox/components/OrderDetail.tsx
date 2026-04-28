import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bot,
  Check,
  Coins,
  FileSpreadsheet,
  Headset,
  IdCard,
  Pencil,
  ShieldCheck,
  Sparkles,
  StickyNote,
  UserCircle2,
  Wallet,
  Scale,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  Order,
  OrderItem,
  ShippingMethod,
  formatTHB,
  paymentLabel,
  sourceLabel,
} from '@/data/mock';
import CustomerInfoForm from '@/features/inbox/components/CustomerInfoForm';
import ExcelParsingView from '@/features/inbox/components/ExcelParsingView';
import ShippingMethodSelector from '@/features/inbox/components/ShippingMethodSelector';
import { SourceIcon } from '@/features/inbox/components/OrderListItem';
import { buildRawText } from '@/features/inbox/utils/orderFormatting';
import { cn } from '@/lib/utils';
import { CANCELLABLE } from '@/state/retail/orders';

const SHIPPING_EDITABLE_STATUSES: Order['status'][] = ['new', 'needs_review', 'ready'];

function ItemRow({ item, index }: { item: OrderItem; index: number }) {
  const lineTotal = item.qty * item.unitPrice;

  return (
    <div className="px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xs font-semibold text-amber-900">
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
            <div className="mt-1 flex items-start gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
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
  onFinishParsing: (orderId: string) => void;
  onSaveCustomer: (orderId: string, customer: Order['customer']) => void;
  onChangeShippingMethod: (orderId: string, method: ShippingMethod) => void;
  onRequestCancel: (orderId: string) => void;
};

export default function OrderDetail({
  order,
  onConfirm,
  onFinishParsing,
  onSaveCustomer,
  onChangeShippingMethod,
  onRequestCancel,
}: OrderDetailProps) {
  const [editing, setEditing] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState(order.customer);

  useEffect(() => {
    setEditing(false);
    setDraftCustomer(order.customer);
    // reset only on order switch, not on external customer updates during editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  if (order.status === 'parsing') {
    return <ExcelParsingView order={order} onFinishParsing={onFinishParsing} />;
  }

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
              <Badge variant="warning" className="gap-1 border-red-300 bg-red-50 text-red-700">
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
                  setEditing(false);
                }}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSaveCustomer(order.id, draftCustomer);
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
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
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

      <div className="grid gap-3 rounded-lg border bg-gradient-to-r from-amber-50 to-background p-4 md:grid-cols-4">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">มูลค่ารวม</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-amber-800">
            {formatTHB(order.totalValue)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">การชำระเงิน</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            {paymentLabel[order.payment]}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">ตรวจบัตรประชาชน</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium">
            <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
            {order.requiresIdCheck ? 'ต้องตรวจ' : 'ไม่ต้องตรวจ'}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">ประกันขนส่ง</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium">
            <ShieldCheck
              className={cn(
                'h-3.5 w-3.5',
                order.insured ? 'text-emerald-600' : 'text-muted-foreground',
              )}
            />
            {order.insured ? 'คุ้มครอง 100%' : 'ยังไม่ทำประกัน'}
          </div>
        </div>
      </div>

      <ShippingMethodSelector
        value={shippingMethod}
        disabled={shippingLocked}
        onChange={(method) => onChangeShippingMethod(order.id, method)}
      />

      {lowConfidence && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div className="text-xs">
            <div className="font-medium text-amber-900">ต้องตรวจข้อมูลบางรายการ</div>
            <div className="text-amber-700">
              โปรดตรวจจำนวนชิ้น น้ำหนัก และยอดรวมเทียบกับสลิปก่อนยืนยันเข้าคิว
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="parsed">
        <TabsList>
          <TabsTrigger value="parsed" className="gap-2 pr-4">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-sm">
              <Sparkles className="h-3 w-3" />
            </span>
            <span>ข้อมูลที่ AI แปลง</span>
          </TabsTrigger>
          <TabsTrigger value="raw">ต้นฉบับ</TabsTrigger>
        </TabsList>

        <TabsContent value="parsed" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">ข้อมูลผู้รับ</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerInfoForm
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
                  <Coins className="h-4 w-4 text-amber-600" /> รายการทองคำ / เงิน
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
                  ราคาปิด (อ้างอิงสมาคมค้าทองคำ{' '}
                  {new Date(order.receivedAt).toLocaleDateString('th')})
                </span>
                <span className="text-base font-semibold tabular-nums text-amber-800">
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
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {order.lineContact
                  ? 'บทสนทนาใน LINE OA'
                  : order.source === 'internal_chat'
                    ? 'ข้อความ / ไฟล์จาก Chat ภายใน'
                    : 'บันทึกข้อมูลหน้าเคาน์เตอร์'}
              </CardTitle>
              <CardDescription>
                {order.lineContact
                  ? `ลูกค้า ${order.lineContact.displayName} → Ausiris LINE OA`
                  : order.source === 'internal_chat'
                    ? 'พนักงานส่งข้อมูลเข้าระบบโดยตรง ไม่ต้องผ่าน LINE'
                    : `บันทึกโดย ${order.handledBy.name}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {order.source === 'internal_chat' && (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <Avatar className="h-7 w-7 bg-primary/10">
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        <Bot className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="max-w-xl">
                      <div className="mb-0.5 text-[10px] text-muted-foreground">Internal Chat</div>
                      <div className="whitespace-pre-line rounded-2xl rounded-bl-sm border bg-sky-50 p-3 font-mono text-xs text-sky-950">
                        {order.rawText ?? 'ไม่มีข้อความต้นฉบับ'}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(order.receivedAt).toLocaleTimeString('th', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    ระบบสร้างรายการเบื้องต้นจากข้อมูลที่ส่งมา · พนักงานต้องตรวจสินค้า จำนวน น้ำหนัก
                    และยอดรวมก่อนยืนยัน
                  </div>
                </div>
              )}

              {order.source === 'line_image' && order.rawPreview && order.lineContact && (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <Avatar className="h-7 w-7 bg-[#06c755]/10">
                      <AvatarFallback className="bg-[#06c755]/10 text-xs text-[#06c755]">
                        {order.lineContact.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="max-w-sm">
                      <div className="mb-0.5 text-[10px] text-muted-foreground">
                        {order.lineContact.displayName}
                      </div>
                      <div className="overflow-hidden rounded-2xl rounded-bl-sm border bg-white">
                        <img
                          src={order.rawPreview}
                          alt="order slip"
                          className="w-full object-cover"
                        />
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(order.receivedAt).toLocaleTimeString('th', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    AI ทำ OCR + จับคู่ SKU อัตโนมัติ ·{' '}
                    <span className="font-medium text-foreground">{order.handledBy.name}</span>{' '}
                    เป็นผู้ยืนยันส่งเข้าระบบ
                  </div>
                </div>
              )}

              {order.source === 'line_text' && order.lineContact && (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <Avatar className="h-7 w-7 bg-[#06c755]/10">
                      <AvatarFallback className="bg-[#06c755]/10 text-xs text-[#06c755]">
                        {order.lineContact.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="max-w-xl">
                      <div className="mb-0.5 text-[10px] text-muted-foreground">
                        {order.lineContact.displayName}
                      </div>
                      <div className="whitespace-pre-line rounded-2xl rounded-bl-sm border bg-[#eaf4d8] p-3 font-mono text-xs text-green-950">
                        {buildRawText(order)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(order.receivedAt).toLocaleTimeString('th', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {order.source === 'line_excel' && (
                <div className="space-y-3">
                  {order.lineContact && (
                    <div className="flex items-end gap-2">
                      <Avatar className="h-7 w-7 bg-[#06c755]/10">
                        <AvatarFallback className="bg-[#06c755]/10 text-xs text-[#06c755]">
                          {order.lineContact.displayName.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="mb-0.5 text-[10px] text-muted-foreground">
                          {order.lineContact.displayName}
                        </div>
                        <div className="rounded-2xl rounded-bl-sm border p-3">
                          <div className="flex items-center gap-2 text-sm">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                            <span className="font-medium">ausiris_orders_20260424.xlsx</span>
                            <Badge variant="muted">24 KB</Badge>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            ไฟล์รายการสั่งซื้อรายเดือน — sheet &quot;รายการส่งพรุ่งนี้&quot; · 18
                            แถว
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {order.source === 'manual' && (
                <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
                  ออเดอร์นี้ไม่ได้มาจาก LINE OA · บันทึกจากหน้าเคาน์เตอร์ / ระบบ ERP โดย{' '}
                  <span className="font-medium text-foreground">{order.handledBy.name}</span> (
                  {order.handledBy.department})
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <OrderTimeline
        order={order}
        description="กิจกรรมและการเปลี่ยนแปลงข้อมูลของออเดอร์นี้"
        compact
      />
    </div>
  );
}
