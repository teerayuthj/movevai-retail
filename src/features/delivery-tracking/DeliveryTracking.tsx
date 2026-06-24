import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { SuccessToast } from '@/components/ui/SuccessToast';
import { MessengerCloseJobDialog } from '@/components/delivery/MessengerCloseJobDialog';
import {
  planningCancelReasonLabel,
  type FailNextAction,
  type FailReason,
  type Order,
  type PlanningCancelReason,
  failNextActionLabel,
  failReasonLabel,
} from '@/data/mock';
import { getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';
import {
  fetchAppOrder,
  fetchDeliveryTrackingCounts,
  fetchDeliveryTrackingOrders,
  retryPlanningRoutePush,
  type DeliveryTrackingCounts,
} from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Map as MapIcon,
  PackageCheck,
  PenLine,
  RefreshCw,
  Truck,
  Undo2,
  UserCog,
  Search,
  XCircle,
} from 'lucide-react';
import { TrackingViewTabs, type TrackingTab } from './components/TrackingViewTabs';
import { TrackingCard } from './components/TrackingCard';
import { TrackingDetailDrawer } from './components/TrackingDetailDrawer';
import { type TrackingView, buildQueueSearch, parseTrackingSearch } from './utils/trackingSearch';
import { LiveMessengerMap } from './components/LiveMessengerMap';
import { MessengerOrderMapPage } from '@/features/messenger/components/MessengerOrderMapPage';

const PAGE_SIZE = 20;
const EMPTY_COUNTS: DeliveryTrackingCounts = {
  awaiting_acceptance: 0,
  overdue: 0,
  in_transit: 0,
  pending: 0,
  returning: 0,
  closed: 0,
};

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

const PLANNING_CANCEL_REASONS = (
  Object.keys(planningCancelReasonLabel) as PlanningCancelReason[]
).map((value) => ({ value, label: planningCancelReasonLabel[value] }));

type DeliveryTrackingPageProps = {
  locationSearch: string;
  onOpenQueue: (search?: string) => void;
};

export function DeliveryTrackingPage({ locationSearch, onOpenQueue }: DeliveryTrackingPageProps) {
  const {
    orders,
    drivers,
    submitDelivery,
    confirmDelivery,
    failDelivery,
    markReturned,
    cancelRoute,
    reassignRoute,
  } = useRetailStore();
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [messengerCloseTargetId, setMessengerCloseTargetId] = useState<string | null>(null);
  const [routeHistoryOrderId, setRouteHistoryOrderId] = useState<string | null>(null);
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
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [routeActionError, setRouteActionError] = useState('');
  const [routeActionSuccess, setRouteActionSuccess] = useState('');
  const [routeAction, setRouteAction] = useState<{
    type: 'cancel' | 'reassign';
    order: Order;
  } | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const parsedSearch = useMemo(() => parseTrackingSearch(locationSearch), [locationSearch]);

  const [view, setView] = useState<TrackingView>(parsedSearch.view ?? 'overdue');
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
  const routeHistoryOrder =
    trackingOrders.find((order) => order.id === routeHistoryOrderId) ??
    orders.find((order) => order.id === routeHistoryOrderId) ??
    null;

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
    const minuteId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    const refreshId = window.setInterval(() => setRefreshKey((current) => current + 1), 30_000);
    return () => {
      window.clearInterval(minuteId);
      window.clearInterval(refreshId);
    };
  }, []);

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

  // ข้อความแจ้งสำเร็จเป็นแบบชั่วคราว — ล้างเองหลัง 5 วินาที
  useEffect(() => {
    if (!routeActionSuccess) return;
    const timeoutId = window.setTimeout(() => setRouteActionSuccess(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [routeActionSuccess]);

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

  async function confirmRouteAction(value: string, note?: string) {
    const routeId = routeAction?.order.deliveryRoute?.id;
    if (!routeAction || !routeId) return;
    setRouteActionError('');
    try {
      const routeCode = routeAction.order.deliveryRoute?.code ?? routeId;
      if (routeAction.type === 'cancel') {
        await cancelRoute(routeId, { reason: value as PlanningCancelReason, note });
      } else {
        await reassignRoute(routeId, { driverCode: value, note });
      }
      setRouteActionSuccess(
        routeAction.type === 'cancel'
          ? `ดึง Route ${routeCode} กลับเข้า Planning แล้ว — แจ้งคนขับเรียบร้อย`
          : `เปลี่ยนคนขับ Route ${routeCode} เรียบร้อย — แจ้งคนขับใหม่แล้ว`,
      );
      setRouteAction(null);
      setSelectedOrderId(null);
      refreshTracking();
    } catch (error) {
      setRouteActionError(error instanceof Error ? error.message : String(error));
    }
  }

  // ── ปุ่ม action ตามสถานะ — ใช้ซ้ำทั้งบนการ์ด inline และ footer ของ drawer ──
  function renderActions(order: Order) {
    if (order.status === 'assigned' && order.deliveryRoute) {
      return (
        <div className="flex flex-wrap gap-2">
          {order.deliveryRoute.pushStatus === 'failed' && (
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await retryPlanningRoutePush(order.deliveryRoute!.id);
                refreshTracking();
              }}
            >
              <RefreshCw className="h-4 w-4" /> Retry Push
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setRouteActionError('');
              setRouteAction({ type: 'reassign', order });
            }}
          >
            <UserCog className="h-4 w-4" />
            เปลี่ยนคนขับ
          </Button>
          <Button
            variant="outline"
            className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/5"
            onClick={() => {
              setRouteActionError('');
              setRouteAction({ type: 'cancel', order });
            }}
          >
            <Ban className="h-4 w-4" />
            ดึงกลับเข้า Planning
          </Button>
        </div>
      );
    }

    if (order.status === 'in_transit') {
      return (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => setMessengerCloseTargetId(order.id)}>
            <Truck className="h-4 w-4" />
            messenger ปิดงาน
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setRouteHistoryOrderId(order.id)}
          >
            <MapIcon className="h-4 w-4" />
            เส้นทาง
          </Button>
          <Button
            className="w-full"
            onClick={async () => {
              await confirmDelivery(order.id);
              setSelectedOrderId(null);
              refreshTracking();
            }}
          >
            <CheckCircle2 className="h-4 w-4" />
            ยืนยันปิดงาน
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setMessengerCloseTargetId(order.id)}
          >
            <PenLine className="h-4 w-4" />
            แก้ไขหลักฐาน
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setFailTargetId(order.id)}>
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

  // แท็บเดียวคุมทั้งหมด — ตัวเลขเป็น badge ในแท็บ (ไม่แยกการ์ด KPI เพื่อเลี่ยงความกำกวมว่าคลิกได้ไหม)
  const tabs: TrackingTab[] = [
    { view: 'overdue', label: 'เลยกำหนด', icon: AlertCircle, count: trackingCounts.overdue },
    {
      view: 'awaiting_acceptance',
      label: 'รอคนขับรับ',
      icon: Truck,
      count: trackingCounts.awaiting_acceptance,
    },
    { view: 'needs_action', label: 'ต้องทำ', icon: AlertCircle, count: needsActionCount },
    { view: 'in_transit', label: 'กำลังจัดส่ง', icon: Truck, count: trackingCounts.in_transit },
    { view: 'pending', label: 'รอยืนยัน', icon: CheckCircle2, count: trackingCounts.pending },
    { view: 'returning', label: 'ส่งกลับ', icon: Undo2, count: trackingCounts.returning },
    { view: 'closed', label: 'ปิดล่าสุด', icon: PackageCheck, count: trackingCounts.closed },
  ];
  const currentTabLabel = tabs.find((tab) => tab.view === view)?.label ?? 'ต้องดำเนินการ';
  const currentViewDescription =
    view === 'closed'
      ? 'แสดงงานที่ปิดใน 24 ชั่วโมงล่าสุด — รายการเก่าย้ายไปดูที่ Tracking History'
      : 'งานที่ยังไม่ปิดจะแสดงค้างไว้จนกว่าจะจัดการเสร็จ แม้เป็นงานต่างจังหวัดหรือค้างหลายวัน';

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">ติดตามการจัดส่ง</h1>
        <p className="text-sm text-muted-foreground">
          งานสดและงานค้างที่ยังต้องจัดการ — ค้างไว้จนกว่าจะปิดงาน ส่วนงานย้อนหลังดูที่ Tracking
          History
        </p>
      </div>

      <LiveMessengerMap />

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

      <MessengerCloseJobDialog
        open={!!messengerCloseTargetId}
        order={
          trackingOrders.find((o) => o.id === messengerCloseTargetId) ??
          orders.find((o) => o.id === messengerCloseTargetId) ??
          null
        }
        onCancel={() => setMessengerCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!messengerCloseTargetId) return;
          await submitDelivery(messengerCloseTargetId, input);
          setSelectedOrderId(null);
          setMessengerCloseTargetId(null);
          changeView('needs_action');
          refreshTracking();
        }}
      />

      {routeAction?.type === 'cancel' && routeAction.order.deliveryRoute && (
        <ResolutionDialog
          open
          title={`ดึง Route ${routeAction.order.deliveryRoute.code} กลับเข้า Planning`}
          description={`ดึงทั้ง Route ${routeAction.order.deliveryRoute.stopCount ?? 1} จุดกลับเข้า Planning โดยเก็บวัน เวลา และ Messenger ตามแผนเดิมไว้ พร้อมแจ้งคนขับ`}
          error={routeActionError}
          reasons={PLANNING_CANCEL_REASONS}
          notePlaceholder="เช่น ลูกค้าเลื่อนนัด / สินค้าไม่พร้อม"
          confirmLabel="ยืนยันดึงกลับเข้า Planning"
          confirmVariant="destructive"
          onCancel={() => setRouteAction(null)}
          onConfirm={({ reason, note }) => void confirmRouteAction(reason, note)}
        />
      )}

      {routeAction?.type === 'reassign' && routeAction.order.deliveryRoute && (
        <ResolutionDialog
          open
          title={`เปลี่ยนคนขับ Route ${routeAction.order.deliveryRoute.code}`}
          description={`ย้ายงานที่ยังรอส่ง ${routeAction.order.deliveryRoute.stopCount ?? 1} จุดไปคนขับใหม่`}
          error={routeActionError}
          reasons={drivers
            .filter((driver) => driver.id !== routeAction.order.assignedDriverId)
            .map((driver) => ({ value: driver.id, label: `${driver.name} · ${driver.zone}` }))}
          notePlaceholder="เช่น คนขับเดิมไม่สามารถรับงานได้"
          confirmLabel="ย้ายงาน"
          onCancel={() => setRouteAction(null)}
          onConfirm={({ reason, note }) => void confirmRouteAction(reason, note)}
        />
      )}

      <SuccessToast message={routeActionSuccess} onClose={() => setRouteActionSuccess('')} />

      <TrackingViewTabs tabs={tabs} view={view} onChange={changeView} />

      <Card className="flex min-h-[calc(100vh-16rem)] flex-col overflow-hidden">
        <CardHeader className="gap-3 pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">{currentTabLabel}</CardTitle>
            <span className="text-[11px] text-muted-foreground">
              {trackingTotal.toLocaleString('th-TH')} รายการ
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{currentViewDescription}</div>
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
            <TrackingCard
              key={order.id}
              order={order}
              selected={selectedOrderId === order.id}
              onSelect={() => setSelectedOrderId(order.id)}
              actions={renderActions(order)}
              overdueMinutes={getAssignedOrderOverdueMinutes(order, nowMs)}
            />
          ))}

          {!isListLoading && !loadError && trackingOrders.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
              {view === 'needs_action'
                ? 'เคลียร์งานหมดแล้ว ไม่มีอะไรค้าง'
                : view === 'closed'
                  ? 'ยังไม่มีงานที่ปิดใน 24 ชั่วโมงล่าสุด'
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

      <TrackingDetailDrawer
        order={selectedOrder}
        driver={selectedDriver}
        isDetailLoading={isDetailLoading}
        onClose={() => setSelectedOrderId(null)}
        actions={selectedOrder ? renderActions(selectedOrder) : undefined}
      />

      {routeHistoryOrderId && (
        <div className="fixed inset-0 z-[70] bg-background">
          <MessengerOrderMapPage
            order={routeHistoryOrder}
            orderId={routeHistoryOrderId}
            onBack={() => setRouteHistoryOrderId(null)}
          />
        </div>
      )}
    </div>
  );
}
