import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, Mailbox, Search } from 'lucide-react';
import {
  type CancelReason,
  type FailNextAction,
  type FailReason,
  type Order,
  cancelReasonLabel,
  failNextActionLabel,
  failReasonLabel,
} from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import { buildPostalCsv, downloadCsv } from '@/lib/export';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { OrderTimeline } from '@/components/OrderTimeline';
import { PostalOrderCard } from './components/PostalOrderCard';
import {
  AssignedActionPanel,
  ClosedPanel,
  InTransitActionPanel,
  ReadyActionPanel,
  ReturningPanel,
} from './components/PostalActionPanels';
import {
  DEFAULT_POSTAL_SERVICE,
  type PostalTab,
  getPostalTab,
  tabLabels,
} from './utils/postalTabs';

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({ value, label: cancelReasonLabel[value] }));

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

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
  const [cancelError, setCancelError] = useState('');
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
  const [lastExport, setLastExport] = useState<{ batchId: string; count: number } | null>(null);

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
    toast.success(`Export พัสดุ ${selectedList.length} รายการ (${batchId}) แล้ว`);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        <Card className="flex flex-col overflow-hidden lg:h-[calc(100vh-12rem)]">
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

        <div className="space-y-4 overflow-auto lg:h-[calc(100vh-12rem)]">
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
                  onHandOver={(id) => {
                    const code = orders.find((order) => order.id === id)?.code ?? '';
                    markPostalHandedOver([id]);
                    toast.success(`มอบพัสดุ ${code} ให้ไปรษณีย์แล้ว`);
                  }}
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
        error={cancelError}
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => {
          setCancelError('');
          setCancelTargetId(null);
        }}
        onConfirm={({ reason, note }) => {
          if (!cancelTargetId) return;
          const code = orders.find((o) => o.id === cancelTargetId)?.code ?? '';
          setCancelError('');
          void cancelOrder(cancelTargetId, { reason, note })
            .then(() => {
              toast.success(`ยกเลิกออเดอร์ไปรษณีย์ ${code} แล้ว`);
              setCancelTargetId(null);
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              setCancelError(message);
              toast.error(`ยกเลิกออเดอร์ ${code} ไม่สำเร็จ — ${message}`);
            });
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
            const code = orders.find((o) => o.id === failTargetId)?.code ?? '';
            failDelivery(failTargetId, {
              reason,
              nextAction: action,
              note,
            });
            setActiveTab(
              action === 'retry' ? 'assigned' : action === 'return' ? 'returning' : 'closed',
            );
            toast.success(
              action === 'retry'
                ? `${code} กลับเข้าคิวจัดส่งรอบใหม่แล้ว`
                : action === 'return'
                  ? `${code} ย้ายไปแท็บส่งกลับแล้ว — รอรับคืนเข้าสาขา`
                  : `บันทึก ${code} เป็นส่งไม่สำเร็จแล้ว`,
            );
          }
          setFailTargetId(null);
        }}
      />
    </div>
  );
}
