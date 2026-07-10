import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { DriverAvatar } from '@/components/DriverAvatar';
import { toast } from 'sonner';
import { MessengerCloseJobDialog } from '@/components/delivery/MessengerCloseJobDialog';
import {
  planningCancelReasonLabel,
  type FailNextAction,
  type FailReason,
  type Order,
  type PlanningCancelReason,
  failNextActionLabel,
  failReasonLabel,
} from '@/data/orderTypes';
import { getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';
import { formatDriverActiveJobs, getInTransitElapsedMinutes } from '@/lib/deliveryExecution';
import {
  canReviseDeliveryProof,
  deliveryProofRevisionLimits,
  getDeliveryProofRevisionCount,
} from '@/state/retail/delivery';
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
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  RefreshCw,
  Truck,
  Undo2,
  UserCog,
  Search,
  XCircle,
} from 'lucide-react';
import { TrackingCard } from './components/TrackingCard';
import { TrackingDetailDrawer } from './components/TrackingDetailDrawer';
import { type TrackingView, buildQueueSearch, parseTrackingSearch } from './utils/trackingSearch';
import { FleetMap } from './components/FleetMap';
import { MessengerOrderMapPage } from '@/features/messenger/components/MessengerOrderMapPage';

type TrackingChip = {
  view: TrackingView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count: number;
};

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
  onOpenTrackingHistory: () => void;
  onOpenDeliveryReport: () => void;
};

export function DeliveryTrackingPage({
  locationSearch,
  onOpenQueue,
  onOpenTrackingHistory,
  onOpenDeliveryReport,
}: DeliveryTrackingPageProps) {
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
  // งานที่เพิ่งกด action — โชว์การ์ดสีเทาค้างไว้สักครู่ก่อนรีเฟรชให้หายไป
  const [settlingOrders, setSettlingOrders] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [routeActionError, setRouteActionError] = useState('');
  const [routeAction, setRouteAction] = useState<{
    type: 'cancel' | 'reassign';
    order: Order;
  } | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  // order id ที่โหลดรายละเอียดสำเร็จแล้ว — ใช้แยก "เปิดใหม่" (โชว์ loading) ออกจาก "รีเฟรชเบื้องหลัง" (อัปเดตเงียบ)
  const loadedDetailIdRef = useRef<string | null>(null);
  const settleTimers = useRef<number[]>([]);
  const parsedSearch = useMemo(() => parseTrackingSearch(locationSearch), [locationSearch]);

  const [view, setView] = useState<TrackingView>(parsedSearch.view ?? 'overdue');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(parsedSearch.orderId);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

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

    const load = fetchDeliveryTrackingOrders({
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
      setIsDetailLoading(false);
      loadedDetailIdRef.current = null;
      return;
    }
    const requestId = ++detailRequestId.current;
    // โชว์สถานะกำลังโหลดเฉพาะตอนเปิด order ใหม่ ส่วนการรีเฟรชเบื้องหลัง (interval 30 วิ / หลังกด action)
    // อัปเดตข้อมูลแบบเงียบ ๆ ไม่ซ่อนเนื้อหาหรือโชว์ spinner เพื่อไม่ให้ drawer กระพริบ/ข้อมูลเด้ง
    const isInitialLoad = loadedDetailIdRef.current !== selectedOrderId;
    if (isInitialLoad) setIsDetailLoading(true);
    void fetchAppOrder(selectedOrderId)
      .then((order) => {
        if (requestId !== detailRequestId.current) return;
        setSelectedOrderDetail(order);
        loadedDetailIdRef.current = selectedOrderId;
      })
      .catch(() => {
        if (requestId !== detailRequestId.current) return;
        // ล้างข้อมูลเฉพาะตอนเปิดใหม่แล้วโหลดไม่ได้ — ถ้าเป็นรีเฟรชเบื้องหลังล้มเหลว ให้คงข้อมูลเดิมไว้
        if (isInitialLoad) setSelectedOrderDetail(null);
      })
      .finally(() => {
        if (requestId === detailRequestId.current && isInitialLoad) setIsDetailLoading(false);
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

  // เคลียร์ timer ที่ค้างเมื่อออกจากหน้า
  useEffect(
    () => () => {
      settleTimers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  // กด action แล้วโชว์การ์ดสีเทา (พร้อม label) ค้างไว้ ~1.5 วิ แล้วค่อยรีเฟรชให้หายไป
  // เพื่อให้ user เห็นว่ารายการนี้ถูกดำเนินการไปแล้วจริง
  function settleAndRefresh(orderId: string, label: string) {
    setSelectedOrderId(null);
    setSettlingOrders((current) => ({ ...current, [orderId]: label }));
    const timer = window.setTimeout(() => {
      setSettlingOrders((current) => {
        const next = { ...current };
        delete next[orderId];
        return next;
      });
      refreshTracking();
    }, 1500);
    settleTimers.current.push(timer);
  }

  async function confirmRouteAction(value: string, note?: string) {
    const routeId = routeAction?.order.deliveryRoute?.id;
    if (!routeAction || !routeId) return;
    setRouteActionError('');
    const routeCode = routeAction.order.deliveryRoute?.code ?? routeId;
    try {
      if (routeAction.type === 'cancel') {
        await cancelRoute(routeId, { reason: value as PlanningCancelReason, note });
      } else {
        await reassignRoute(routeId, { driverCode: value, note });
      }
      toast.success(
        routeAction.type === 'cancel'
          ? `ดึง Route ${routeCode} กลับเข้า Planning แล้ว — แจ้งคนขับเรียบร้อย`
          : `เปลี่ยนคนขับ Route ${routeCode} เรียบร้อย — แจ้งคนขับใหม่แล้ว`,
      );
      setRouteAction(null);
      setSelectedOrderId(null);
      refreshTracking();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRouteActionError(message);
      toast.error(`ดำเนินการ Route ${routeCode} ไม่สำเร็จ — ${message}`);
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
      const canAdminEditProof = canReviseDeliveryProof(order, 'admin');
      const messengerRevisionCount = getDeliveryProofRevisionCount(order, 'messenger');
      const messengerRevisionLimit = deliveryProofRevisionLimits.messenger;
      const adminRevisionCount = getDeliveryProofRevisionCount(order, 'admin');
      const adminRevisionLimit = deliveryProofRevisionLimits.admin;
      return (
        <div className="space-y-2">
          <div
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              canAdminEditProof
                ? 'border-info/30 bg-info/10 text-info'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            แก้ไข: M {messengerRevisionCount}/{messengerRevisionLimit} · A {adminRevisionCount}/
            {adminRevisionLimit}
          </div>
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
                try {
                  await confirmDelivery(order.id);
                  toast.success(`ปิดงาน ${order.code} เรียบร้อย`);
                  settleAndRefresh(order.id, 'ปิดงานแล้ว');
                } catch (error) {
                  toast.error(
                    `ปิดงานไม่สำเร็จ — ${error instanceof Error ? error.message : String(error)}`,
                  );
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              ยืนยันปิดงาน
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={!canAdminEditProof}
              title={canAdminEditProof ? undefined : 'admin แก้ไขหลักฐานได้ครบ 2 ครั้งแล้ว'}
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
        </div>
      );
    }

    if (order.status === 'returning') {
      return (
        <Button
          className="w-full"
          onClick={() => {
            markReturned(order.id);
            toast.success(`รับคืน ${order.code} เข้าสาขาแล้ว`);
            settleAndRefresh(order.id, 'รับคืนเข้าสาขาแล้ว');
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

  // chip เดียวคุมทั้งหมด — ตัวเลขเป็น badge ใน chip (ไม่แยกการ์ด KPI เพื่อเลี่ยงความกำกวมว่าคลิกได้ไหม)
  const tabs: TrackingChip[] = [
    { view: 'overdue', label: 'เลยกำหนด', icon: AlertCircle, count: trackingCounts.overdue },
    {
      view: 'awaiting_acceptance',
      label: 'รอคนขับรับ',
      icon: Truck,
      count: trackingCounts.awaiting_acceptance,
    },
    { view: 'in_transit', label: 'กำลังจัดส่ง', icon: Truck, count: trackingCounts.in_transit },
    { view: 'pending', label: 'รอยืนยัน', icon: CheckCircle2, count: trackingCounts.pending },
    { view: 'returning', label: 'ส่งกลับ', icon: Undo2, count: trackingCounts.returning },
    { view: 'closed', label: 'ปิดล่าสุด', icon: PackageCheck, count: trackingCounts.closed },
  ];
  const currentTabLabel = tabs.find((tab) => tab.view === view)?.label ?? 'ต้องดำเนินการ';
  const currentViewDescription =
    view === 'closed'
      ? 'แสดงงานที่ปิดใน 24 ชั่วโมงล่าสุด — รายการเก่าย้ายไปดูที่ Tracking History'
      : 'งานที่ยังไม่ปิดทั้งหมด ไม่จำกัดช่วงวันที่ — รายการจะค้างไว้จนกว่าจะจัดการเสร็จ';

  return (
    // full-bleed map-first: หักล้าง padding ของ <main> แล้วกินความสูงที่เหลือใต้ topbar (h-14) พอดีจอ
    <div className="relative -m-4 h-[calc(100dvh-3.5rem)] overflow-hidden sm:-m-6">
      <FleetMap focusOrder={selectedOrder} />

      {/* แถบบนลอยเหนือแผนที่ — chip สถานะ (คุม view ของ panel) + ปุ่มไปหน้ารายงาน */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border bg-background/90 p-1 shadow-sm backdrop-blur">
          {tabs.map((tab) => {
            const active = view === tab.view;
            const Icon = tab.icon;
            const overdueTone = tab.view === 'overdue' && tab.count > 0;
            const pendingTone = tab.view === 'pending' && tab.count > 0;
            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => changeView(tab.view)}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors',
                  active
                    ? overdueTone
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-foreground text-background'
                    : cn(
                        'text-muted-foreground hover:bg-muted hover:text-foreground',
                        overdueTone && 'text-destructive',
                        pendingTone && 'text-warning',
                      ),
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                    active ? 'bg-background/25' : 'bg-muted',
                  )}
                >
                  {tab.count.toLocaleString('th-TH')}
                </span>
              </button>
            );
          })}
        </div>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <Button
            variant="outline"
            size="sm"
            className="bg-background/90 shadow-sm backdrop-blur"
            onClick={onOpenTrackingHistory}
          >
            ดู Tracking History
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-background/90 shadow-sm backdrop-blur"
            onClick={onOpenDeliveryReport}
          >
            ดู Delivery Report
          </Button>
        </div>
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

          const code =
            trackingOrders.find((o) => o.id === failTargetId)?.code ??
            orders.find((o) => o.id === failTargetId)?.code ??
            '';
          failDelivery(failTargetId, { reason, nextAction: action, note });
          toast.success(
            action === 'retry'
              ? `${code} กลับเข้าคิวให้คนขับเดิมส่งใหม่แล้ว`
              : action === 'return'
                ? `${code} ย้ายไปงานส่งกลับแล้ว — รอรับคืนเข้าสาขา`
                : `ปิดงาน ${code} เป็นส่งไม่สำเร็จแล้ว`,
          );

          if (action === 'retry') {
            setFailTargetId(null);
            onOpenQueue(buildQueueSearch(failTargetId));
            return;
          }

          const settlingId = failTargetId;
          setFailTargetId(null);
          settleAndRefresh(
            settlingId,
            action === 'return' ? 'ตีกลับ — ส่งกลับสาขา' : 'ปิดงานไม่สำเร็จ',
          );
        }}
      />

      <MessengerCloseJobDialog
        open={!!messengerCloseTargetId}
        order={
          trackingOrders.find((o) => o.id === messengerCloseTargetId) ??
          orders.find((o) => o.id === messengerCloseTargetId) ??
          null
        }
        editorRole="admin"
        onCancel={() => setMessengerCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!messengerCloseTargetId) return;
          const code =
            trackingOrders.find((o) => o.id === messengerCloseTargetId)?.code ??
            orders.find((o) => o.id === messengerCloseTargetId)?.code ??
            '';
          await submitDelivery(messengerCloseTargetId, input);
          toast.success(`บันทึกหลักฐานการส่ง ${code} แล้ว — รอยืนยันปิดงาน`);
          const settlingId = messengerCloseTargetId;
          setMessengerCloseTargetId(null);
          settleAndRefresh(settlingId, 'บันทึกหลักฐานแล้ว');
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
            .map((driver) => ({
              value: driver.id,
              label: driver.name,
              leading: <DriverAvatar driver={driver} className="h-9 w-9" />,
              description: `${driver.phone} · ${formatDriverActiveJobs(driver, orders)}`,
            }))}
          reasonLabel="คนขับใหม่"
          notePlaceholder="เช่น คนขับเดิมไม่สามารถรับงานได้"
          confirmLabel="ย้ายงาน"
          onCancel={() => setRouteAction(null)}
          onConfirm={({ reason, note }) => void confirmRouteAction(reason, note)}
        />
      )}

      {/* panel รายการงานลอยซ้าย — ย่อเก็บได้เพื่อดูแผนที่เต็มตา */}
      {!isPanelOpen && (
        <Button
          variant="outline"
          className="absolute left-3 top-[3.75rem] z-10 bg-background/95 shadow-lg backdrop-blur"
          onClick={() => setIsPanelOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
          รายการงาน
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums">
            {trackingTotal.toLocaleString('th-TH')}
          </span>
        </Button>
      )}
      {isPanelOpen && (
        <section
          aria-label="รายการงานติดตาม"
          className="absolute bottom-3 left-3 top-[3.75rem] z-10 flex w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur"
        >
          <div className="flex flex-col gap-2 border-b px-3 pb-3 pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                {currentTabLabel}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {trackingTotal.toLocaleString('th-TH')} รายการ
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsPanelOpen(false)}
                aria-label="ย่อรายการงาน"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหา order, ลูกค้า, เบอร์โทร, คนขับ..."
                className="h-9 rounded-lg pl-9"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">{currentViewDescription}</div>
          </div>

          <div className="relative flex-1 space-y-2 overflow-y-auto p-2 [scrollbar-gutter:stable]">
            {trackingOrders.map((order) => (
              <TrackingCard
                key={order.id}
                order={order}
                selected={selectedOrderId === order.id}
                onSelect={() => setSelectedOrderId(order.id)}
                actions={renderActions(order)}
                overdueMinutes={getAssignedOrderOverdueMinutes(order, nowMs)}
                inTransitMinutes={getInTransitElapsedMinutes(order, nowMs)}
                settling={!!settlingOrders[order.id]}
                settledLabel={settlingOrders[order.id]}
                nowMs={nowMs}
              />
            ))}

            {!isListLoading && !loadError && trackingOrders.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
                {view === 'closed'
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
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
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
        </section>
      )}

      <TrackingDetailDrawer
        order={selectedOrder}
        driver={selectedDriver}
        isDetailLoading={isDetailLoading}
        onClose={() => setSelectedOrderId(null)}
        actions={selectedOrder ? renderActions(selectedOrder) : undefined}
        nowMs={nowMs}
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
