import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OrderTimeline } from '@/components/OrderTimeline';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import { DetailDrawer } from '@/components/DetailDrawer';
import {
  DriverSummary,
  OrderSummary,
  ProofOfDeliveryInfo,
  ResolutionInfo,
} from '@/components/delivery/DeliveryExecutionShared';
import {
  type FailNextAction,
  type FailReason,
  type Order,
  failNextActionLabel,
  failReasonLabel,
  formatTHB,
  paymentLabel,
  statusLabel,
} from '@/data/mock';
import { requiresDeliveryReview, type DeliveryTrackingTab } from '@/lib/deliveryExecution';
import {
  fetchAppOrder,
  fetchDeliveryTrackingCounts,
  fetchDeliveryTrackingOrders,
  type DeliveryTrackingCounts,
} from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';
import { cn } from '@/lib/utils';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  IdCard,
  Loader2,
  MapPin,
  PackageCheck,
  Phone,
  Undo2,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';

const PAGE_SIZE = 20;
const EMPTY_COUNTS: DeliveryTrackingCounts = {
  in_transit: 0,
  pending: 0,
  returning: 0,
  closed: 0,
};

// มุมมองหน้า — 'needs_action' คือ union ของ pending + returning (งานที่ admin ต้องลงมือ)
// ส่วนที่เหลือ map ตรงกับ DeliveryTrackingTab ของ backend
type TrackingView = 'needs_action' | DeliveryTrackingTab;

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

type DeliveryTrackingPageProps = {
  locationSearch: string;
  onOpenQueue: (search?: string) => void;
};

function parseTrackingSearch(locationSearch: string): {
  view: TrackingView | null;
  orderId: string | null;
} {
  const params = new URLSearchParams(locationSearch);
  const tab = params.get('tab');
  const orderId = params.get('order');

  const view: TrackingView | null =
    tab === 'in_transit' || tab === 'pending' || tab === 'returning' || tab === 'closed'
      ? (tab as DeliveryTrackingTab)
      : tab === 'needs_action'
        ? 'needs_action'
        : null;

  return { view, orderId: orderId || null };
}

function buildQueueSearch(orderId?: string) {
  const params = new URLSearchParams({ tab: 'assigned' });
  if (orderId) params.set('order', orderId);
  return `?${params.toString()}`;
}

export function DeliveryTrackingPage({ locationSearch, onOpenQueue }: DeliveryTrackingPageProps) {
  const { orders, drivers, submitDelivery, confirmDelivery, failDelivery, markReturned } =
    useRetailStore();
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [riderCloseTargetId, setRiderCloseTargetId] = useState<string | null>(null);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [trackingOrders, setTrackingOrders] = useState<Order[]>([]);
  const [trackingCounts, setTrackingCounts] = useState<DeliveryTrackingCounts>(EMPTY_COUNTS);
  const [trackingTotal, setTrackingTotal] = useState(0);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const parsedSearch = useMemo(() => parseTrackingSearch(locationSearch), [locationSearch]);

  const [view, setView] = useState<TrackingView>(parsedSearch.view ?? 'needs_action');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(parsedSearch.orderId);

  const isPaginated = view !== 'needs_action';
  const needsActionCount = trackingCounts.pending + trackingCounts.returning;

  const selectedOrder =
    (selectedOrderDetail?.id === selectedOrderId ? selectedOrderDetail : null) ??
    trackingOrders.find((order) => order.id === selectedOrderId) ??
    orders.find((order) => order.id === selectedOrderId) ??
    null;
  const selectedDriver =
    drivers.find((driver) => driver.id === selectedOrder?.assignedDriverId) ?? null;

  const totalPages = Math.max(1, Math.ceil(trackingTotal / PAGE_SIZE));

  useEffect(() => {
    if (parsedSearch.view) setView(parsedSearch.view);
  }, [parsedSearch.view]);

  useEffect(() => {
    if (parsedSearch.orderId) setSelectedOrderId(parsedSearch.orderId);
  }, [parsedSearch.orderId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const requestId = ++listRequestId.current;
    setIsListLoading(true);
    setLoadError(null);

    const load =
      view === 'needs_action'
        ? // รวม 2 สถานะที่ต้องลงมือไว้ในมุมมองเดียว — ส่งกลับขึ้นก่อน (ค้างที่สาขานานสุด)
          Promise.all([
            fetchDeliveryTrackingOrders({
              tab: 'returning',
              query: debouncedQuery,
              take: PAGE_SIZE,
              skip: 0,
            }),
            fetchDeliveryTrackingOrders({
              tab: 'pending',
              query: debouncedQuery,
              take: PAGE_SIZE,
              skip: 0,
            }),
          ]).then(([returning, pending]) => ({
            orders: [...returning.orders, ...pending.orders],
            total: returning.total + pending.total,
          }))
        : fetchDeliveryTrackingOrders({
            tab: view,
            query: debouncedQuery,
            take: PAGE_SIZE,
            skip: (page - 1) * PAGE_SIZE,
          });

    void load
      .then((result) => {
        if (requestId !== listRequestId.current) return;
        setTrackingOrders(result.orders);
        setTrackingTotal(result.total);
      })
      .catch((error: unknown) => {
        if (requestId !== listRequestId.current) return;
        setLoadError(error instanceof Error ? error.message : 'โหลดรายการติดตามไม่สำเร็จ');
      })
      .finally(() => {
        if (requestId === listRequestId.current) setIsListLoading(false);
      });
  }, [view, debouncedQuery, page, refreshKey]);

  useEffect(() => {
    void fetchDeliveryTrackingCounts()
      .then(setTrackingCounts)
      .catch(() => undefined);
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrderDetail(null);
      return;
    }
    const requestId = ++detailRequestId.current;
    setIsDetailLoading(true);
    void fetchAppOrder(selectedOrderId)
      .then((order) => {
        if (requestId === detailRequestId.current) setSelectedOrderDetail(order);
      })
      .catch(() => {
        if (requestId === detailRequestId.current) setSelectedOrderDetail(null);
      })
      .finally(() => {
        if (requestId === detailRequestId.current) setIsDetailLoading(false);
      });
  }, [selectedOrderId, refreshKey]);

  function changeView(next: TrackingView) {
    setView(next);
    setPage(1);
    setSelectedOrderId(null);
  }

  function refreshTracking() {
    setRefreshKey((current) => current + 1);
  }

  // ── ปุ่ม action ตามสถานะ — ใช้ซ้ำทั้งบนการ์ด inline และ footer ของ drawer ──
  function renderActions(order: Order) {
    if (order.status === 'in_transit') {
      return (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setRiderCloseTargetId(order.id)}>
            <Truck className="h-4 w-4" />
            rider ปิดงาน
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setFailTargetId(order.id)}>
            <XCircle className="h-4 w-4" />
            ไม่สำเร็จ
          </Button>
        </div>
      );
    }

    if (order.status === 'pending_confirmation') {
      return (
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={async () => {
              await confirmDelivery(order.id);
              setSelectedOrderId(null);
              refreshTracking();
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            ยืนยันปิดงาน
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setFailTargetId(order.id)}>
            <XCircle className="h-4 w-4" />
            ตีกลับ
          </Button>
        </div>
      );
    }

    if (order.status === 'returning') {
      return (
        <Button
          className="w-full"
          onClick={() => {
            markReturned(order.id);
            setSelectedOrderId(null);
            refreshTracking();
          }}
        >
          <PackageCheck className="h-4 w-4" />
          รับคืนเข้าสาขาแล้ว
        </Button>
      );
    }

    return (
      <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
        งานนี้ปิดแล้ว ไม่มี action เพิ่มเติม
      </div>
    );
  }

  // ── การ์ดในรายการ: สรุป + หลักฐานย่อ + ปุ่ม action ในตัว ──
  function TrackingCard({ order }: { order: Order }) {
    const pod = order.proofOfDelivery;
    const tone =
      order.status === 'in_transit'
        ? 'border-l-info'
        : order.status === 'pending_confirmation' || order.status === 'returning'
          ? 'border-l-warning'
          : 'border-l-muted-foreground/30';
    const isActionable =
      order.status === 'in_transit' ||
      order.status === 'pending_confirmation' ||
      order.status === 'returning';

    return (
      <div
        className={cn(
          'rounded-lg border border-l-[3px] bg-card transition-colors',
          tone,
          selectedOrderId === order.id && 'ring-1 ring-primary',
        )}
      >
        <button
          type="button"
          onClick={() => setSelectedOrderId(order.id)}
          className="block w-full p-4 pb-3 text-left"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-medium">{order.code}</span>
              <Badge
                variant={
                  order.status === 'in_transit'
                    ? 'info'
                    : order.status === 'pending_confirmation' || order.status === 'returning'
                      ? 'warning'
                      : 'muted'
                }
                className="h-5 px-1.5 text-[10px]"
              >
                {statusLabel[order.status]}
              </Badge>
              {order.requiresIdCheck && (
                <Badge
                  variant="warning"
                  className="h-5 gap-0.5 border-destructive/30 bg-destructive/10 px-1.5 text-[10px] text-destructive"
                >
                  <IdCard className="h-2.5 w-2.5" />
                  ตรวจบัตร
                </Badge>
              )}
              {order.payment === 'cod' && (
                <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                  COD
                </Badge>
              )}
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </div>

          <div className="mt-1.5 text-sm font-medium">{order.customer.name}</div>
          <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{order.customer.address}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              <span>{order.customer.phone}</span>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Coins className="h-3 w-3 text-warning" />
              {paymentLabel[order.payment]}
            </div>
            <span className="text-sm font-semibold tabular-nums text-warning">
              {formatTHB(order.totalValue)}
            </span>
          </div>

          {pod && (
            <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-success">
              <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5">
                <CheckCircle2 className="h-2.5 w-2.5" />
                หลักฐานครบจาก rider
              </span>
            </div>
          )}
          {order.resolution?.reason && order.status === 'returning' && (
            <div className="mt-2 text-[11px] text-destructive">
              เหตุ:{' '}
              {failReasonLabel[order.resolution.reason as FailReason] ?? order.resolution.reason}
            </div>
          )}
        </button>

        {isActionable && <div className="px-4 pb-4">{renderActions(order)}</div>}
      </div>
    );
  }

  // แท็บเดียวคุมทั้งหมด — ตัวเลขเป็น badge ในแท็บ (ไม่แยกการ์ด KPI เพื่อเลี่ยงความกำกวมว่าคลิกได้ไหม)
  const TABS: { view: TrackingView; label: string; icon: typeof Truck; count: number }[] = [
    { view: 'needs_action', label: 'ต้องทำ', icon: AlertCircle, count: needsActionCount },
    { view: 'in_transit', label: 'กำลังจัดส่ง', icon: Truck, count: trackingCounts.in_transit },
    { view: 'pending', label: 'รอยืนยัน', icon: CheckCircle2, count: trackingCounts.pending },
    { view: 'returning', label: 'ส่งกลับ', icon: Undo2, count: trackingCounts.returning },
    { view: 'closed', label: 'ปิดงานแล้ว', icon: PackageCheck, count: trackingCounts.closed },
  ];
  const currentTab = TABS.find((tab) => tab.view === view) ?? TABS[0];

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ติดตามการจัดส่ง</h1>
        <p className="text-sm text-muted-foreground">
          สายพานงานตามสถานะจริง — งานที่ต้องลงมืออยู่บนสุด จัดการได้ในที่เดียว
        </p>
      </div>

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${trackingOrders.find((o) => o.id === failTargetId)?.code ?? orders.find((o) => o.id === failTargetId)?.code ?? ''} — เลือกเหตุผลและขั้นตอนต่อไป`
            : undefined
        }
        reasons={FAIL_REASONS}
        actions={{
          label: 'ขั้นตอนต่อไป',
          options: FAIL_ACTIONS,
          defaultValue: 'retry',
          helpText: (value) =>
            value === 'retry'
              ? 'ออเดอร์จะกลับเป็นสถานะมอบหมาย คนขับเดิมรับไปส่งใหม่'
              : value === 'return'
                ? 'ออเดอร์จะถูกย้ายไปงานส่งกลับ รอรับคืนเข้าสาขา'
                : 'ปิดงานเป็นส่งไม่สำเร็จ — ภายหลังยังกดส่งกลับสาขาได้',
        }}
        confirmLabel="บันทึก"
        onCancel={() => setFailTargetId(null)}
        onConfirm={({ reason, note, action }) => {
          if (!failTargetId || !action) return;

          failDelivery(failTargetId, { reason, nextAction: action, note });

          if (action === 'retry') {
            onOpenQueue(buildQueueSearch(failTargetId));
            return;
          }

          setSelectedOrderId(null);
          setFailTargetId(null);
          changeView(action === 'return' ? 'needs_action' : 'closed');
          refreshTracking();
        }}
      />

      <RiderCloseJobDialog
        open={!!riderCloseTargetId}
        order={
          trackingOrders.find((o) => o.id === riderCloseTargetId) ??
          orders.find((o) => o.id === riderCloseTargetId) ??
          null
        }
        onCancel={() => setRiderCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!riderCloseTargetId) return;
          const target =
            trackingOrders.find((o) => o.id === riderCloseTargetId) ??
            orders.find((o) => o.id === riderCloseTargetId);
          await submitDelivery(riderCloseTargetId, input);
          setSelectedOrderId(null);
          setRiderCloseTargetId(null);
          // งานเสี่ยงสูง → ไปแท็บต้องทำ (รอยืนยัน), งานทั่วไป → ปิดเลย
          changeView(target && requiresDeliveryReview(target) ? 'needs_action' : 'closed');
          refreshTracking();
        }}
      />

      {/* มือถือ: dropdown เลือกมุมมอง — ไม่มี scroll แนวนอน */}
      <div className="lg:hidden">
        <Popover open={isViewMenuOpen} onOpenChange={setIsViewMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-11 w-full items-center justify-between rounded-xl border bg-card px-4 text-sm',
                currentTab.view === 'needs_action' && currentTab.count > 0 && 'text-warning',
              )}
            >
              <span className="flex items-center gap-2">
                <currentTab.icon className="h-4 w-4" />
                <span className="font-medium">{currentTab.label}</span>
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    currentTab.view === 'needs_action' && currentTab.count > 0
                      ? 'bg-warning/15 text-warning'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {currentTab.count.toLocaleString('th-TH')}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-sm p-1">
            {TABS.map((tab) => {
              const active = view === tab.view;
              const urgent = tab.view === 'needs_action' && tab.count > 0;
              return (
                <button
                  key={tab.view}
                  type="button"
                  onClick={() => {
                    changeView(tab.view);
                    setIsViewMenuOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted',
                    active && 'bg-muted/60',
                    urgent && 'text-warning',
                  )}
                >
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left font-medium">{tab.label}</span>
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      urgent ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tab.count.toLocaleString('th-TH')}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      {/* เดสก์ท็อป: แท็บเดียวคุมมุมมอง — ตัวเลขเป็น badge ในแท็บ */}
      <div className="hidden lg:block">
        <div className="inline-flex min-w-full gap-1.5 rounded-2xl bg-muted/70 p-1.5">
          {TABS.map((tab) => {
            const active = view === tab.view;
            const Icon = tab.icon;
            const isAction = tab.view === 'needs_action';
            const urgent = isAction && tab.count > 0;
            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => changeView(tab.view)}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm transition-colors',
                  active
                    ? 'bg-background shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                  active && urgent && 'text-warning',
                  active && !urgent && 'text-foreground',
                  !active && urgent && 'text-warning',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    urgent
                      ? 'bg-warning/15 text-warning'
                      : active
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-background/80 text-muted-foreground',
                  )}
                >
                  {tab.count.toLocaleString('th-TH')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="flex min-h-[calc(100vh-16rem)] flex-col overflow-hidden">
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">
              {TABS.find((tab) => tab.view === view)?.label ?? 'ต้องดำเนินการ'}
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">
              {trackingTotal.toLocaleString('th-TH')} รายการ
            </span>
          </div>
          <div className="relative w-full max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหา order, ลูกค้า, เบอร์โทร, คนขับ..."
              className="h-10 rounded-xl pl-9"
            />
          </div>
        </CardHeader>

        <CardContent className="relative flex-1 space-y-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {trackingOrders.map((order) => (
            <TrackingCard key={order.id} order={order} />
          ))}

          {!isListLoading && !loadError && trackingOrders.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
              {view === 'needs_action'
                ? 'เคลียร์งานหมดแล้ว ไม่มีอะไรค้าง 🎉'
                : 'ไม่มีรายการในสถานะนี้'}
            </div>
          )}

          {isListLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {loadError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-xs text-destructive">
              <AlertCircle className="mx-auto mb-2 h-4 w-4" />
              <div>{loadError}</div>
              <Button variant="outline" size="sm" className="mt-3" onClick={refreshTracking}>
                ลองใหม่
              </Button>
            </div>
          )}
        </CardContent>

        {isPaginated && (
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>
              {trackingTotal === 0
                ? '0 รายการ'
                : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, trackingTotal)} จาก ${trackingTotal.toLocaleString('th-TH')}`}
              <span className="ml-1 hidden text-[10px] sm:inline">· โหลดครั้งละ {PAGE_SIZE}</span>
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1 || isListLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="หน้าก่อนหน้า"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-16 text-center tabular-nums">
                {page}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages || isListLoading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                aria-label="หน้าถัดไป"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* รายละเอียดเชิงลึก — drawer ขวา (เดสก์ท็อป) / เต็มจอ (มือถือ) เปิดเมื่อเลือก order */}
      <DetailDrawer
        open={!!selectedOrder}
        title={<span className="font-mono">{selectedOrder?.code}</span>}
        subtitle={selectedOrder ? statusLabel[selectedOrder.status] : undefined}
        onClose={() => setSelectedOrderId(null)}
        footer={selectedOrder ? renderActions(selectedOrder) : undefined}
      >
        {selectedOrder && (
          <>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">Order</div>
              <div className="mt-1">
                <OrderSummary order={selectedOrder} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              <Badge
                variant={
                  selectedOrder.status === 'in_transit'
                    ? 'info'
                    : selectedOrder.status === 'pending_confirmation' ||
                        selectedOrder.status === 'returning'
                      ? 'warning'
                      : 'muted'
                }
              >
                {statusLabel[selectedOrder.status]}
              </Badge>
              {selectedOrder.deliveryPlan?.releaseState === 'released' && (
                <Badge variant="info">จาก Planning</Badge>
              )}
              {selectedDriver && <Badge variant="muted">คนขับ: {selectedDriver.name}</Badge>}
              {isDetailLoading && (
                <Badge variant="muted" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  กำลังโหลด
                </Badge>
              )}
            </div>

            {!isDetailLoading && selectedOrder.proofOfDelivery && (
              <ProofOfDeliveryInfo order={selectedOrder} driverName={selectedDriver?.name} />
            )}

            {(selectedOrder.status === 'returning' ||
              selectedOrder.status === 'failed' ||
              selectedOrder.status === 'cancelled' ||
              selectedOrder.status === 'returned') &&
              selectedOrder.resolution && <ResolutionInfo order={selectedOrder} />}

            <div>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">ข้อมูลคนขับ</div>
              <DriverSummary driver={selectedDriver} order={selectedOrder} />
            </div>

            <OrderTimeline
              order={selectedOrder}
              description="กิจกรรมที่เกิดขึ้นกับออเดอร์นี้"
              compact
            />
          </>
        )}
      </DetailDrawer>
    </div>
  );
}
