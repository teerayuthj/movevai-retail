import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mailbox,
  Package,
  MapPin,
  Phone,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  Coins,
  ShieldCheck,
  IdCard,
  ClipboardCheck,
  Clock,
  Truck as TruckIcon,
  ExternalLink,
  Ban,
  PackageCheck,
} from 'lucide-react';
import {
  CancelReason,
  FailNextAction,
  FailReason,
  Order,
  PostalService,
  cancelReasonLabel,
  failNextActionLabel,
  failReasonLabel,
  formatTHB,
  paymentLabel,
  postalServiceLabel,
  statusLabel,
} from '@/data/mock';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import { buildPostalCsv, downloadCsv } from '@/lib/export';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { OrderTimeline } from '@/components/OrderTimeline';

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({ value, label: cancelReasonLabel[value] }));

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

type PostalTab = 'ready' | 'assigned' | 'in_transit' | 'returning' | 'closed';
const DEFAULT_POSTAL_SERVICE: PostalService = 'ems';

const tabLabels: Record<PostalTab, string> = {
  ready: 'รอจัดแบทช์',
  assigned: 'ฝากไปรษณีย์',
  in_transit: 'กำลังจัดส่ง',
  returning: 'ส่งกลับ',
  closed: 'ปิดงาน',
};

function getPostalTab(order: Order): PostalTab | null {
  if (order.status === 'ready') return 'ready';
  if (order.status === 'assigned') return 'assigned';
  if (order.status === 'in_transit') return 'in_transit';
  if (order.status === 'returning') return 'returning';
  if (
    order.status === 'delivered' ||
    order.status === 'failed' ||
    order.status === 'cancelled' ||
    order.status === 'returned'
  )
    return 'closed';
  return null;
}

function PostalOrderCard({
  order,
  selected,
  onClick,
  checkbox,
  onToggle,
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
  checkbox?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const checked = !!checkbox;
  const postcode = order.customer.address.match(/\b\d{5}\b/)?.[0];
  const batch = order.postalBatch;
  return (
    <div
      className={cn(
        'w-full rounded-lg border bg-card p-4 text-left transition-all',
        selected ? 'border-primary ring-1 ring-primary shadow-xs' : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        {onToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!checked);
            }}
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/30 hover:border-primary',
            )}
            aria-pressed={checked}
          >
            {checked && <CheckCircle2 className="h-3 w-3" />}
          </button>
        )}
        <button onClick={onClick} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.code}</span>
            <Badge
              variant={
                order.status === 'failed'
                  ? 'warning'
                  : order.status === 'ready'
                    ? 'success'
                    : 'muted'
              }
              className="h-5 px-1.5 text-[10px]"
            >
              {statusLabel[order.status]}
            </Badge>
            {batch?.service && (
              <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px]">
                <Mailbox className="h-2.5 w-2.5" />
                {postalServiceLabel[batch.service]}
              </Badge>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{order.customer.address}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              <span>{order.customer.phone}</span>
              {postcode && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {postcode}
                </span>
              )}
            </div>
            {batch?.trackingNumber && (
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-foreground">
                <ClipboardCheck className="h-3 w-3" />
                {batch.trackingNumber}
              </div>
            )}
            {batch?.batchId && <div className="text-[10px]">Batch {batch.batchId}</div>}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Coins className="h-3 w-3 text-amber-600" />
              {paymentLabel[order.payment]}
            </div>
            <span className="text-sm font-semibold tabular-nums text-amber-800">
              {formatTHB(order.totalValue)}
            </span>
          </div>
        </button>
        <Badge variant="muted" className="shrink-0">
          <Package className="h-3 w-3" /> {order.items.length}
        </Badge>
      </div>
    </div>
  );
}

export function PostalQueuePage() {
  const {
    orders,
    exportPostalBatch,
    setPostalTracking,
    markPostalHandedOver,
    completePostalDelivery,
    cancelOrder,
    failDelivery,
    markReturned,
  } = useRetailStore();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [failTargetId, setFailTargetId] = useState<string | null>(null);

  const postalOrders = useMemo(
    () => orders.filter((o) => o.shippingMethod === 'thai_post' && getPostalTab(o)),
    [orders],
  );

  const readyOrders = postalOrders.filter((o) => o.status === 'ready');
  const assignedOrders = postalOrders.filter((o) => o.status === 'assigned');
  const inTransitOrders = postalOrders.filter((o) => o.status === 'in_transit');
  const returningOrders = postalOrders.filter((o) => o.status === 'returning');
  const closedOrders = postalOrders.filter((o) =>
    ['delivered', 'failed', 'cancelled', 'returned'].includes(o.status),
  );

  const [activeTab, setActiveTab] = useState<PostalTab>('ready');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{
    batchId: string;
    count: number;
  } | null>(null);

  const tabCounts: Record<PostalTab, number> = {
    ready: readyOrders.length,
    assigned: assignedOrders.length,
    in_transit: inTransitOrders.length,
    returning: returningOrders.length,
    closed: closedOrders.length,
  };

  const tabOrders: Record<PostalTab, Order[]> = {
    ready: readyOrders,
    assigned: assignedOrders,
    in_transit: inTransitOrders,
    returning: returningOrders,
    closed: closedOrders,
  };

  const filteredOrders = tabOrders[activeTab].filter((order) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      order.code,
      order.customer.name,
      order.customer.phone,
      order.customer.address,
      order.postalBatch?.batchId ?? '',
      order.postalBatch?.trackingNumber ?? '',
    ]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) ?? null;

  useEffect(() => {
    if (!filteredOrders.some((o) => o.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? null);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const toggleSelect = (id: string, next: boolean) => {
    setSelectedIds((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const selectedList = filteredOrders.filter((o) => selectedIds.has(o.id));
  const selectedValue = selectedList.reduce((sum, o) => sum + o.totalValue, 0);
  const visibleSelectedCount = filteredOrders.filter((o) => selectedIds.has(o.id)).length;
  const allVisibleSelected =
    filteredOrders.length > 0 && visibleSelectedCount === filteredOrders.length;

  const toggleSelectAll = () => {
    const visibleIds = filteredOrders.map((o) => o.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleExport = () => {
    if (selectedList.length === 0) return;
    const batchId = exportPostalBatch(
      selectedList.map((o) => o.id),
      DEFAULT_POSTAL_SERVICE,
    );
    const csv = buildPostalCsv(selectedList, DEFAULT_POSTAL_SERVICE);
    downloadCsv(`${batchId}.csv`, csv);
    setLastExport({ batchId, count: selectedList.length });
    setSelectedIds(new Set());
    setActiveTab('assigned');
  };

  const handleReExport = (batchId: string) => {
    const batchOrders = postalOrders.filter((o) => o.postalBatch?.batchId === batchId);
    if (batchOrders.length === 0) return;
    const svc = batchOrders[0].postalBatch?.service ?? 'ems';
    const csv = buildPostalCsv(batchOrders, svc);
    downloadCsv(`${batchId}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">คิวจัดส่งไปรษณีย์ไทย</h1>
          <p className="text-sm text-muted-foreground">
            รวมออเดอร์ที่ส่งผ่านไปรษณีย์ · จัดแบทช์ · export CSV ให้ไปรษณีย์ · กรอกเลขติดตาม EMS
            หลังฝาก
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted" className="gap-1">
            <Mailbox className="h-3 w-3" />
            {postalOrders.length} ออเดอร์ในระบบ
          </Badge>
          {lastExport && (
            <Badge variant="muted" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Export ล่าสุด {lastExport.batchId} · {lastExport.count} รายการ
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
        <Card className="h-[calc(100vh-12rem)] overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">ออเดอร์ไปรษณีย์</CardTitle>
                {activeTab === 'ready' && filteredOrders.length > 0 && (
                  <button
                    onClick={toggleSelectAll}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {allVisibleSelected
                      ? 'ล้างการเลือก'
                      : `เลือกทั้งหมด (${filteredOrders.length})`}
                  </button>
                )}
              </div>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PostalTab)}>
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-5">
                  {(Object.keys(tabLabels) as PostalTab[]).map((tab) => (
                    <TabsTrigger key={tab} value={tab} className="gap-1 text-xs">
                      {tabLabels[tab]}
                      <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {tabCounts[tab]}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหา order, ลูกค้า, เลข tracking, batch..."
                  className="h-8 pl-8"
                />
              </div>
              {activeTab === 'ready' && filteredOrders.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="inline-flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary"
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border',
                        allVisibleSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/30 bg-background',
                      )}
                    >
                      {allVisibleSelected && <CheckCircle2 className="h-3 w-3" />}
                    </span>
                    {allVisibleSelected
                      ? 'เลือกทั้งหมดที่แสดงแล้ว'
                      : `เลือกทั้งหมดที่แสดง (${filteredOrders.length})`}
                  </button>
                  <div className="text-[11px] text-muted-foreground">
                    เลือกแล้ว {visibleSelectedCount} จาก {filteredOrders.length} รายการ
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-2">
            {filteredOrders.map((o) => (
              <PostalOrderCard
                key={o.id}
                order={o}
                selected={selectedOrderId === o.id}
                onClick={() => setSelectedOrderId(o.id)}
                checkbox={selectedIds.has(o.id)}
                onToggle={activeTab === 'ready' ? (next) => toggleSelect(o.id, next) : undefined}
              />
            ))}
            {filteredOrders.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Mailbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                ไม่มีรายการในสถานะนี้
              </div>
            )}
          </CardContent>
        </Card>

        <div className="h-[calc(100vh-12rem)] overflow-auto space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {activeTab === 'ready'
                  ? 'สร้าง Batch + Export'
                  : activeTab === 'assigned'
                    ? 'กรอกเลขติดตาม + ฝากไปรษณีย์'
                    : activeTab === 'in_transit'
                      ? 'ติดตามสถานะ'
                      : activeTab === 'returning'
                        ? 'รอรับคืนเข้าสาขา'
                        : 'สรุปงาน'}
              </CardTitle>
              <CardDescription className="text-xs">
                {activeTab === 'ready'
                  ? 'เลือกออเดอร์ที่จะรวมเป็น batch เดียวกัน แล้ว export CSV'
                  : activeTab === 'assigned'
                    ? 'หลังพิมพ์ใบฝาก + ชั่งน้ำหนัก กรอกเลข EMS ที่ไปรษณีย์ให้'
                    : activeTab === 'in_transit'
                      ? 'รอยืนยันผลการจัดส่งจากลูกค้า/ไปรษณีย์'
                      : activeTab === 'returning'
                        ? 'พัสดุถูกตีกลับ — กดรับคืนเมื่อของถึงสาขา'
                        : 'งานที่ปิดแล้ว (ส่งสำเร็จ/ไม่สำเร็จ/ยกเลิก/รับคืน)'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTab === 'ready' && (
                <ReadyActionPanel
                  selectedList={selectedList}
                  selectedValue={selectedValue}
                  onExport={handleExport}
                  onRequestCancel={
                    selectedOrder ? () => setCancelTargetId(selectedOrder.id) : undefined
                  }
                  selectedOrder={selectedOrder}
                />
              )}
              {activeTab === 'assigned' && (
                <AssignedActionPanel
                  order={selectedOrder}
                  onTracking={(id, tracking) => setPostalTracking(id, tracking)}
                  onHandOver={(id) => markPostalHandedOver([id])}
                  onReExport={handleReExport}
                  onRequestCancel={(id) => setCancelTargetId(id)}
                />
              )}
              {activeTab === 'in_transit' && (
                <InTransitActionPanel
                  order={selectedOrder}
                  onComplete={(id) => completePostalDelivery(id, true)}
                  onRequestFail={(id) => setFailTargetId(id)}
                />
              )}
              {activeTab === 'returning' && (
                <ReturningPanel
                  order={selectedOrder}
                  onMarkReturned={(id) => {
                    markReturned(id);
                    setActiveTab('closed');
                  }}
                />
              )}
              {activeTab === 'closed' && <ClosedPanel order={selectedOrder} />}
            </CardContent>
          </Card>
          <OrderTimeline
            order={selectedOrder}
            description="กิจกรรมและการเปลี่ยนแปลงของออเดอร์ไปรษณีย์"
            compact
          />
        </div>
      </div>

      <ResolutionDialog
        open={!!cancelTargetId}
        title="ยกเลิกออเดอร์ไปรษณีย์"
        description={
          cancelTargetId
            ? `${orders.find((o) => o.id === cancelTargetId)?.code ?? ''} — เลือกเหตุผล`
            : undefined
        }
        reasons={CANCEL_REASONS}
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => setCancelTargetId(null)}
        onConfirm={({ reason, note }) => {
          if (cancelTargetId) cancelOrder(cancelTargetId, { reason, note });
          setCancelTargetId(null);
        }}
      />

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${orders.find((o) => o.id === failTargetId)?.code ?? ''} — ระบุเหตุผลและขั้นตอนต่อไป`
            : undefined
        }
        reasons={FAIL_REASONS}
        actions={{
          label: 'ขั้นตอนต่อไป',
          options: FAIL_ACTIONS,
          defaultValue: 'return',
          helpText: (v) =>
            v === 'retry'
              ? 'ออเดอร์จะกลับเป็นสถานะมอบหมาย รอจัดส่งรอบใหม่'
              : v === 'return'
                ? 'ออเดอร์จะถูกย้ายไปแท็บส่งกลับ รอรับคืนเข้าสาขา'
                : 'ปิดงานเป็นส่งไม่สำเร็จ',
        }}
        confirmLabel="บันทึก"
        onCancel={() => setFailTargetId(null)}
        onConfirm={({ reason, note, action }) => {
          if (failTargetId && action) {
            failDelivery(failTargetId, {
              reason,
              nextAction: action,
              note,
            });
            setActiveTab(
              action === 'retry' ? 'assigned' : action === 'return' ? 'returning' : 'closed',
            );
          }
          setFailTargetId(null);
        }}
      />
    </div>
  );
}

function ReadyActionPanel({
  selectedList,
  selectedValue,
  onExport,
  selectedOrder,
  onRequestCancel,
}: {
  selectedList: Order[];
  selectedValue: number;
  onExport: () => void;
  selectedOrder?: Order | null;
  onRequestCancel?: () => void;
}) {
  const hasSelection = selectedList.length > 0;
  return (
    <>
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">เลือกแล้ว {selectedList.length} ออเดอร์</span>
          <span className="font-semibold tabular-nums text-amber-800">
            {formatTHB(selectedValue)}
          </span>
        </div>
        {hasSelection ? (
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {selectedList.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between">
                <span className="font-mono">{o.code}</span>
                <span className="line-clamp-1 ml-2 max-w-48 truncate">{o.customer.name}</span>
              </div>
            ))}
            {selectedList.length > 5 && (
              <div className="text-[10px]">· · · อีก {selectedList.length - 5} รายการ · · ·</div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-muted-foreground">
            เลือกออเดอร์จากรายการด้านซ้าย
          </div>
        )}
      </div>

      <Button className="w-full" disabled={!hasSelection} onClick={onExport}>
        <Download className="h-4 w-4" />
        Export CSV + สร้าง Batch
      </Button>

      {selectedOrder && onRequestCancel && (
        <Button
          variant="outline"
          className="w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={onRequestCancel}
        >
          <Ban className="h-4 w-4" />
          ยกเลิก {selectedOrder.code}
        </Button>
      )}
    </>
  );
}

function AssignedActionPanel({
  order,
  onTracking,
  onHandOver,
  onReExport,
  onRequestCancel,
}: {
  order: Order | null;
  onTracking: (orderId: string, tracking: string) => void;
  onHandOver: (orderId: string) => void;
  onReExport: (batchId: string) => void;
  onRequestCancel: (orderId: string) => void;
}) {
  const [draft, setDraft] = useState(order?.postalBatch?.trackingNumber ?? '');

  useEffect(() => {
    setDraft(order?.postalBatch?.trackingNumber ?? '');
  }, [order?.id, order?.postalBatch?.trackingNumber]);

  if (!order) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        เลือกออเดอร์จากคอลัมน์ซ้าย
      </div>
    );
  }

  const batch = order.postalBatch;
  if (!batch) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">ออเดอร์นี้ยังไม่มี batch</div>
    );
  }

  const hasTracking = !!batch.trackingNumber;
  const trackingDirty = draft.trim().length > 0 && draft.trim() !== (batch.trackingNumber ?? '');

  return (
    <>
      <OrderSummary order={order} />

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Batch
            </div>
            <div className="font-mono text-sm font-semibold">{batch.batchId}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              บริการ {postalServiceLabel[batch.service]} · export เมื่อ{' '}
              {new Date(batch.exportedAt).toLocaleString('th', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onReExport(batch.batchId)}>
            <Download className="h-3.5 w-3.5" />
            CSV ซ้ำ
          </Button>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground">
          เลขติดตาม (EMS / ลงทะเบียน)
        </label>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase().trim())}
          placeholder="เช่น EX123456789TH"
          className="mt-1 font-mono"
        />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!trackingDirty}
            onClick={() => onTracking(order.id, draft.trim())}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            บันทึกเลข
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!hasTracking}
            onClick={() => onHandOver(order.id)}
          >
            <TruckIcon className="h-3.5 w-3.5" />
            ยืนยันฝากไปรษณีย์
          </Button>
        </div>
        {!hasTracking && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            กรอกเลข EMS แล้วกดบันทึกก่อน ถึงจะยืนยันฝากได้
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => onRequestCancel(order.id)}
      >
        <Ban className="h-4 w-4" />
        ยกเลิกออเดอร์
      </Button>
    </>
  );
}

function InTransitActionPanel({
  order,
  onComplete,
  onRequestFail,
}: {
  order: Order | null;
  onComplete: (orderId: string) => void;
  onRequestFail: (orderId: string) => void;
}) {
  if (!order) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        เลือกออเดอร์จากคอลัมน์ซ้าย
      </div>
    );
  }
  const batch = order.postalBatch;
  return (
    <>
      <OrderSummary order={order} />

      {batch && (
        <div className="rounded-lg border p-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                เลขติดตาม
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold">{batch.trackingNumber}</div>
            </div>
            <a
              href={`https://track.thailandpost.co.th/?trackNumber=${batch.trackingNumber}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> ไปรษณีย์ไทย
            </a>
          </div>
          {batch.handedOverAt && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              ฝากเมื่อ{' '}
              {new Date(batch.handedOverAt).toLocaleString('th', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onComplete(order.id)}>
          <CheckCircle2 className="h-4 w-4" />
          ส่งสำเร็จ
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onRequestFail(order.id)}>
          <XCircle className="h-4 w-4" />
          ส่งไม่สำเร็จ
        </Button>
      </div>
    </>
  );
}

function ReturningPanel({
  order,
  onMarkReturned,
}: {
  order: Order | null;
  onMarkReturned: (orderId: string) => void;
}) {
  if (!order) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        เลือกออเดอร์จากคอลัมน์ซ้าย
      </div>
    );
  }
  return (
    <>
      <OrderSummary order={order} />
      {order.resolution && <ResolutionInfoBlock order={order} />}
      <Button className="w-full" onClick={() => onMarkReturned(order.id)}>
        <PackageCheck className="h-4 w-4" />
        รับคืนเข้าสาขาแล้ว
      </Button>
    </>
  );
}

function ClosedPanel({ order }: { order: Order | null }) {
  if (!order) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        เลือกออเดอร์จากคอลัมน์ซ้าย
      </div>
    );
  }
  const tone =
    order.status === 'delivered'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : order.status === 'returned'
        ? 'border-sky-200 bg-sky-50 text-sky-900'
        : order.status === 'cancelled'
          ? 'border-red-200 bg-red-50 text-red-900'
          : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <>
      <OrderSummary order={order} />
      <div className={cn('rounded-lg border p-3 text-xs', tone)}>
        <div className="flex items-center gap-1.5 font-medium">
          {order.status === 'delivered' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : order.status === 'returned' ? (
            <PackageCheck className="h-4 w-4" />
          ) : order.status === 'cancelled' ? (
            <Ban className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {statusLabel[order.status]}
        </div>
        {order.postalBatch?.trackingNumber && (
          <div className="mt-1 font-mono text-[11px]">{order.postalBatch.trackingNumber}</div>
        )}
      </div>
      {order.resolution && <ResolutionInfoBlock order={order} />}
    </>
  );
}

function ResolutionInfoBlock({ order }: { order: Order }) {
  const r = order.resolution;
  if (!r) return null;
  const reasonText = r.reason
    ? (failReasonLabel[r.reason as FailReason] ?? cancelReasonLabel[r.reason as CancelReason])
    : undefined;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="font-medium">รายละเอียดการบันทึก</div>
      {reasonText && <div className="mt-1">เหตุผล: {reasonText}</div>}
      {r.nextAction && (
        <div className="mt-0.5">ขั้นตอนต่อไป: {failNextActionLabel[r.nextAction]}</div>
      )}
      {r.note && <div className="mt-0.5">หมายเหตุ: {r.note}</div>}
      <div className="mt-1 text-[10px] text-muted-foreground">
        บันทึกโดย {r.recordedBy.name} · {r.recordedBy.department} ·{' '}
        {new Date(r.recordedAt).toLocaleString('th', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </div>
    </div>
  );
}

function OrderSummary({ order }: { order: Order }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground">Order</div>
      <div className="mt-1 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-medium">{order.code}</span>
          <Badge variant="muted">{order.items.length} รายการ</Badge>
        </div>
        <div className="mt-1 text-sm">{order.customer.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{order.customer.address}</div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
          <span className="text-sm font-semibold tabular-nums text-amber-800">
            {formatTHB(order.totalValue)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="muted" className="gap-1 text-[10px]">
            <Coins className="h-2.5 w-2.5" />
            {paymentLabel[order.payment]}
          </Badge>
          {order.requiresIdCheck && (
            <Badge variant="warning" className="gap-1 text-[10px]">
              <IdCard className="h-2.5 w-2.5" />
              ตรวจบัตร
            </Badge>
          )}
          {order.insured && (
            <Badge variant="muted" className="gap-1 text-[10px]">
              <ShieldCheck className="h-2.5 w-2.5" />
              ประกันขนส่ง
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
