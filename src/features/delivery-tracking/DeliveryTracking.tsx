import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { ReassignRouteDialog } from '@/components/delivery/ReassignRouteDialog';
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
import { getInTransitElapsedMinutes } from '@/lib/deliveryExecution';
import { shortRouteCode } from '@/lib/routeCode';
import { canReviseDeliveryProof, deliveryProofRevisionLimits } from '@/state/retail/delivery';
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
  ClipboardList,
  Clock3,
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
import { TrackingRouteCard } from './components/TrackingRouteCard';
import { TrackingDetailDrawer } from './components/TrackingDetailDrawer';
import { DeliveryProofReviewDialog } from './components/DeliveryProofReviewDialog';
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
  all_open: 0,
  planned: 0,
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
    unassignOrder,
    clearPlannedOrders,
  } = useRetailStore();
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [messengerCloseTargetId, setMessengerCloseTargetId] = useState<string | null>(null);
  const [proofReviewTarget, setProofReviewTarget] = useState<Order | null>(null);
  const [routeHistoryOrderId, setRouteHistoryOrderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [trackingOrders, setTrackingOrders] = useState<Order[]>([]);
  const [trackingCounts, setTrackingCounts] = useState<DeliveryTrackingCounts>(EMPTY_COUNTS);
  const [trackingTotal, setTrackingTotal] = useState(0);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [selectedRouteActionDetail, setSelectedRouteActionDetail] = useState<Order | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // งานที่เพิ่งกด action — โชว์การ์ดสีเทาค้างไว้สักครู่ก่อนรีเฟรชให้หายไป
  const [settlingOrders, setSettlingOrders] = useState<Record<string, string>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [routeActionError, setRouteActionError] = useState('');
  const [unassignTarget, setUnassignTarget] = useState<Order | null>(null);
  const [unassignError, setUnassignError] = useState('');
  const [clearPlanTarget, setClearPlanTarget] = useState<Order | null>(null);
  const [clearPlanError, setClearPlanError] = useState('');
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

  const [view, setView] = useState<TrackingView>(parsedSearch.view ?? 'all_open');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(parsedSearch.orderId);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [mapFocusVersion, setMapFocusVersion] = useState(0);

  const selectedOrder =
    (selectedOrderDetail?.id === selectedOrderId ? selectedOrderDetail : null) ??
    trackingOrders.find((order) => order.id === selectedOrderId) ??
    orders.find((order) => order.id === selectedOrderId) ??
    null;
  const selectedDriver =
    drivers.find((driver) => driver.id === selectedOrder?.assignedDriverId) ?? null;
  const routeHistoryOrder =
    (selectedRouteActionDetail?.id === routeHistoryOrderId ? selectedRouteActionDetail : null) ??
    (selectedOrderDetail?.id === routeHistoryOrderId ? selectedOrderDetail : null) ??
    trackingOrders.find((order) => order.id === routeHistoryOrderId) ??
    orders.find((order) => order.id === routeHistoryOrderId) ??
    null;

  const totalPages = Math.max(1, Math.ceil(trackingTotal / PAGE_SIZE));

  // การ์ดติดตามต้องสื่อสารเป็น "เที่ยว" ก่อน ส่วน Order ยังเป็นหน่วยข้อมูลของแต่ละจุด
  // เพื่อให้ปิดงาน/เก็บหลักฐานรายจุดได้ตามระบบเดิม. งานที่ไม่มี Route ยังคงแสดงเดี่ยว.
  const trackingListGroups = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const order of trackingOrders) {
      const key = order.deliveryRoute?.id ? `route:${order.deliveryRoute.id}` : `order:${order.id}`;
      const current = groups.get(key);
      if (current) current.push(order);
      else groups.set(key, [order]);
    }
    return [...groups.values()];
  }, [trackingOrders]);
  const routeGroupsOnPage = trackingListGroups.filter(
    (group) => group[0]?.deliveryRoute?.id,
  ).length;
  // เมื่อเลือกจุดในเที่ยว ให้ drawer คงบริบทของทั้งเที่ยวไว้ แล้วสลับเฉพาะรายละเอียด
  // ของจุดที่เลือกอยู่ภายใน drawer เดิม
  const selectedRouteOrders = useMemo(() => {
    if (!selectedOrder) return [];
    const group = trackingListGroups.find((ordersInGroup) =>
      ordersInGroup.some((order) => order.id === selectedOrder.id),
    );
    if (!group) return [selectedOrder];
    return group.map((order) => (order.id === selectedOrder.id ? selectedOrder : order));
  }, [selectedOrder, trackingListGroups]);
  // เปิด drawer ของ Route แล้วให้ชุด action ทำงานกับจุดส่งที่รอตรวจสอบทันที
  // แม้รายละเอียดที่กำลังดูอยู่จะเป็นจุดรับ จึงไม่ต้องกดเลือก stop ที่ 2 ก่อน
  const selectedRouteActionCandidate = useMemo(() => {
    if (!selectedOrder?.deliveryRoute) return selectedOrder;
    return (
      selectedRouteOrders.find(
        (order) =>
          order.status === 'pending_confirmation' &&
          order.metadataJson?.dispatch?.routeLeg !== 'pickup',
      ) ?? selectedOrder
    );
  }, [selectedOrder, selectedRouteOrders]);
  const selectedRouteActionOrder =
    selectedRouteActionCandidate?.id === selectedOrderId
      ? selectedOrder
      : selectedRouteActionDetail?.id === selectedRouteActionCandidate?.id
        ? selectedRouteActionDetail
        : selectedRouteActionCandidate;

  function openLiveRoute(order: Order) {
    setSelectedOrderId(order.id);
    setMapFocusVersion((current) => current + 1);
  }

  useEffect(() => {
    if (parsedSearch.view) setView(parsedSearch.view);
  }, [parsedSearch.view]);

  useEffect(() => {
    if (parsedSearch.orderId) setSelectedOrderId(parsedSearch.orderId);
  }, [parsedSearch.orderId]);

  // รายการ tracking แบบย่อไม่มี payload หลักฐาน จึงโหลดรายละเอียดของ dropoff ควบคู่กัน
  // เพื่อให้ drawer แสดงหลักฐานและเปิดแก้ไขได้ทันทีแม้ผู้ใช้เปิดมาจากจุดรับ
  useEffect(() => {
    const actionOrderId = selectedRouteActionCandidate?.id;
    if (!actionOrderId || actionOrderId === selectedOrderId) {
      setSelectedRouteActionDetail(null);
      return;
    }
    let cancelled = false;
    void fetchAppOrder(actionOrderId)
      .then((order) => {
        if (!cancelled) setSelectedRouteActionDetail(order);
      })
      .catch(() => {
        if (!cancelled) setSelectedRouteActionDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, selectedOrderId, selectedRouteActionCandidate?.id]);

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
      // รองรับ server เวอร์ชันเก่าระหว่าง rollout ที่ยังไม่มี key `planned`
      .then((counts) => setTrackingCounts({ ...EMPTY_COUNTS, ...counts }))
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

  async function confirmRouteAction(
    value: string | { driverCode: string; coDriverCodes: string[]; note?: string },
    note?: string,
  ) {
    const routeId = routeAction?.order.deliveryRoute?.id;
    if (!routeAction || !routeId) return;
    setRouteActionError('');
    const routeCode = routeAction.order.deliveryRoute
      ? shortRouteCode(routeAction.order.deliveryRoute.code)
      : routeId;
    try {
      if (routeAction.type === 'cancel') {
        await cancelRoute(routeId, { reason: value as PlanningCancelReason, note });
      } else {
        if (typeof value === 'string') return;
        await reassignRoute(routeId, value);
      }
      toast.success(
        routeAction.type === 'cancel'
          ? `ดึง Route ${routeCode} กลับมาจัดการแล้ว — แจ้งคนขับเรียบร้อย`
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

  function renderConfirmDeliveryAction(order: Order) {
    return (
      <Button className="w-full" onClick={() => setProofReviewTarget(order)}>
        <CheckCircle2 className="h-4 w-4" />
        ตรวจและยืนยัน
      </Button>
    );
  }

  // ── ปุ่ม action สำหรับ footer ของ drawer ──
  function renderActions(order: Order, options: { includeConfirm?: boolean } = {}) {
    const { includeConfirm = true } = options;
    const isPlannedPreview =
      order.deliveryPlan?.releaseState === 'planned' && Boolean(order.deliveryPlan.plannedDriverId);
    if (isPlannedPreview) {
      return (
        <Button
          variant="outline"
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setClearPlanError('');
            setSelectedOrderId(null);
            setClearPlanTarget(order);
          }}
        >
          <Undo2 className="h-4 w-4" />
          ดึงแผนกลับ
        </Button>
      );
    }

    if (order.status === 'assigned' && !order.deliveryRoute) {
      return (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenQueue(buildQueueSearch(order.id))}
          >
            <ClipboardList className="h-4 w-4" />
            ไปจัด Route ใน Queue
          </Button>
          <Button
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              setUnassignError('');
              setSelectedOrderId(null);
              setUnassignTarget(order);
            }}
          >
            <Undo2 className="h-4 w-4" />
            ดึงงานกลับ
          </Button>
        </div>
      );
    }

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
            ดึงกลับมาจัดการ
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
      const isPickupCheckpoint = order.metadataJson?.dispatch?.routeLeg === 'pickup';
      if (isPickupCheckpoint) {
        return (
          <div className="space-y-2">
            <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success">
              รับของแล้ว — จุดนี้จะปิดพร้อมจุดส่งปลายทาง
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRouteHistoryOrderId(order.id)}
            >
              <MapIcon className="h-4 w-4" />
              เส้นทาง
            </Button>
          </div>
        );
      }
      const canAdminEditProof = canReviseDeliveryProof(order, 'admin');
      const adminRevisionLimit = deliveryProofRevisionLimits.admin;
      return (
        <div className="space-y-2">
          {!canAdminEditProof && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              Admin แก้ไขหลักฐานครบ {adminRevisionLimit} ครั้งแล้ว
            </div>
          )}
          {includeConfirm && renderConfirmDeliveryAction(order)}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setRouteHistoryOrderId(order.id)}
            >
              <MapIcon className="h-4 w-4" />
              เส้นทาง
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
            toast.success(`รับคืน ${order.orderNo} เข้าสาขาแล้ว`);
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

  function plannedRunOrderIds(order: Order) {
    const dispatch = order.metadataJson?.dispatch;
    const runId = dispatch?.routeTemplateRunId ?? dispatch?.adHocRouteRunId;
    if (!runId) return [order.id];
    const ids = orders
      .filter((candidate) => {
        const candidateDispatch = candidate.metadataJson?.dispatch;
        const candidateRunId =
          candidateDispatch?.routeTemplateRunId ?? candidateDispatch?.adHocRouteRunId;
        return (
          candidateRunId === runId &&
          candidate.deliveryPlan?.releaseState === 'planned' &&
          Boolean(candidate.deliveryPlan.plannedDriverId)
        );
      })
      .map((candidate) => candidate.id);
    return ids.length > 0 ? ids : [order.id];
  }

  // chip เดียวคุมทั้งหมด — ตัวเลขเป็น badge ใน chip (ไม่แยกการ์ด KPI เพื่อเลี่ยงความกำกวมว่าคลิกได้ไหม)
  const tabs: TrackingChip[] = [
    {
      view: 'all_open',
      label: 'งานยังไม่ปิด',
      icon: ClipboardList,
      count: trackingCounts.all_open,
    },
    { view: 'planned', label: 'แผนล่วงหน้า', icon: Clock3, count: trackingCounts.planned },
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
      : view === 'all_open'
        ? 'รวมงานที่ยังไม่ปิดทุกขั้นตอน — งานที่ยังไม่มี Route กดกลับไปจัดต่อใน Queue ได้'
        : 'งานที่ยังไม่ปิดทั้งหมด ไม่จำกัดช่วงวันที่ — รายการจะค้างไว้จนกว่าจะจัดการเสร็จ';

  return (
    // full-bleed map-first: หักล้าง padding ของ <main> แล้วกินความสูงที่เหลือใต้ topbar (h-14) พอดีจอ
    <div className="relative -m-4 h-[calc(100dvh-3.5rem)] overflow-hidden sm:-m-6">
      <FleetMap
        focusOrder={selectedOrder}
        onFocusOrder={setSelectedOrderId}
        focusVersion={mapFocusVersion}
      />

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
            ? `${trackingOrders.find((o) => o.id === failTargetId)?.orderNo ?? orders.find((o) => o.id === failTargetId)?.orderNo ?? ''} — เลือกเหตุผลและขั้นตอนต่อไป`
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
            trackingOrders.find((o) => o.id === failTargetId)?.orderNo ??
            orders.find((o) => o.id === failTargetId)?.orderNo ??
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
          (selectedRouteActionDetail?.id === messengerCloseTargetId
            ? selectedRouteActionDetail
            : null) ??
          (selectedOrderDetail?.id === messengerCloseTargetId ? selectedOrderDetail : null) ??
          trackingOrders.find((o) => o.id === messengerCloseTargetId) ??
          orders.find((o) => o.id === messengerCloseTargetId) ??
          null
        }
        editorRole="admin"
        onCancel={() => setMessengerCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!messengerCloseTargetId) return;
          const code =
            trackingOrders.find((o) => o.id === messengerCloseTargetId)?.orderNo ??
            orders.find((o) => o.id === messengerCloseTargetId)?.orderNo ??
            '';
          await submitDelivery(messengerCloseTargetId, input);
          toast.success(`บันทึกหลักฐานการส่ง ${code} แล้ว — รอยืนยันปิดงาน`);
          const settlingId = messengerCloseTargetId;
          setMessengerCloseTargetId(null);
          settleAndRefresh(settlingId, 'บันทึกหลักฐานแล้ว');
        }}
      />

      <DeliveryProofReviewDialog
        order={proofReviewTarget}
        onClose={() => setProofReviewTarget(null)}
        onSubmit={async (input) => {
          const target = proofReviewTarget;
          if (!target) return;
          await confirmDelivery(target.id, input);
          setProofReviewTarget(null);
          if ((input.decision ?? 'approved') === 'approved') {
            toast.success(`ตรวจหลักฐานและปิดงาน ${target.orderNo} เรียบร้อย`);
            settleAndRefresh(target.id, 'ตรวจหลักฐานผ่าน — ปิดงานแล้ว');
            return;
          }
          toast.success(
            input.decision === 'needs_revision'
              ? `ส่งคำขอแก้หลักฐาน ${target.orderNo} ให้ Messenger แล้ว`
              : `ปฏิเสธหลักฐาน ${target.orderNo} แล้ว`,
          );
          refreshTracking();
        }}
      />

      {unassignTarget && (
        <ResolutionDialog
          open
          title={`ดึงงาน ${unassignTarget.orderNo} กลับ`}
          description="เอางานออกจาก Messenger และคืนเป็นงานรอมอบหมาย โดยไม่ยกเลิกออเดอร์"
          error={unassignError}
          reasons={PLANNING_CANCEL_REASONS}
          notePlaceholder="เช่น เลือกคนขับผิด / ต้องจัดคิวใหม่"
          confirmLabel="ยืนยันดึงกลับ"
          confirmVariant="destructive"
          onCancel={() => {
            setUnassignError('');
            setUnassignTarget(null);
          }}
          onConfirm={({ reason, note }) => {
            const target = unassignTarget;
            setUnassignError('');
            void unassignOrder(target.id, {
              reason: reason as PlanningCancelReason,
              note,
            })
              .then(() => {
                toast.success(`ดึงงาน ${target.orderNo} กลับแล้ว — คืนเข้าคิวรอมอบหมาย`);
                setSelectedOrderId(null);
                setUnassignTarget(null);
                refreshTracking();
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                setUnassignError(message);
                toast.error(`ดึงงาน ${target.orderNo} กลับไม่สำเร็จ — ${message}`);
              });
          }}
        />
      )}

      {clearPlanTarget && (
        <ResolutionDialog
          open
          title={`ดึงแผน ${clearPlanTarget.orderNo} กลับ`}
          description={`นำ ${plannedRunOrderIds(clearPlanTarget).length} จุดออกจากตาราง Messenger และคืนเข้าคิวจัดส่ง งานยังไม่ถูก Publish หรือเริ่มจัดส่ง`}
          error={clearPlanError}
          reasons={PLANNING_CANCEL_REASONS}
          notePlaceholder="เช่น เปลี่ยนวันนัด / ต้องจัดคนขับใหม่"
          confirmLabel="ยืนยันดึงกลับ"
          confirmVariant="destructive"
          onCancel={() => {
            setClearPlanError('');
            setClearPlanTarget(null);
          }}
          onConfirm={({ reason, note }) => {
            const target = clearPlanTarget;
            const targetIds = plannedRunOrderIds(target);
            setClearPlanError('');
            void clearPlannedOrders(targetIds, {
              reason: reason as PlanningCancelReason,
              note,
            })
              .then(() => {
                toast.success(
                  `ดึงแผน ${targetIds.length} จุดกลับแล้ว — Messenger จะไม่เห็นงานนี้อีก`,
                );
                setSelectedOrderId(null);
                setClearPlanTarget(null);
                refreshTracking();
              })
              .catch((error: unknown) => {
                const message = error instanceof Error ? error.message : String(error);
                setClearPlanError(message);
                toast.error(`ดึงแผน ${target.orderNo} กลับไม่สำเร็จ — ${message}`);
              });
          }}
        />
      )}

      {routeAction?.type === 'cancel' && routeAction.order.deliveryRoute && (
        <ResolutionDialog
          open
          title={`ดึง Route ${shortRouteCode(routeAction.order.deliveryRoute.code)} กลับมาจัดการ`}
          description={`นำทั้ง Route ${routeAction.order.deliveryRoute.stopCount ?? 1} จุดกลับมาจัดการ โดยเก็บวัน เวลา และ Messenger ตามแผนเดิมไว้ พร้อมแจ้งคนขับ`}
          error={routeActionError}
          reasons={PLANNING_CANCEL_REASONS}
          notePlaceholder="เช่น ลูกค้าเลื่อนนัด / สินค้าไม่พร้อม"
          confirmLabel="ยืนยันดึงกลับมาจัดการ"
          confirmVariant="destructive"
          onCancel={() => setRouteAction(null)}
          onConfirm={({ reason, note }) => void confirmRouteAction(reason, note)}
        />
      )}

      {routeAction?.type === 'reassign' && routeAction.order.deliveryRoute && (
        <ReassignRouteDialog
          open
          title={`เปลี่ยนคนขับ Route ${shortRouteCode(routeAction.order.deliveryRoute.code)}`}
          description={`ย้ายงานที่ยังรอส่ง ${routeAction.order.deliveryRoute.stopCount ?? 1} จุดไปคนขับใหม่`}
          error={routeActionError}
          drivers={drivers}
          orders={orders}
          initialDriverIds={[
            ...(routeAction.order.assignedDriverId ? [routeAction.order.assignedDriverId] : []),
            ...(routeAction.order.coDriverIds ?? []),
          ]}
          onCancel={() => setRouteAction(null)}
          onConfirm={(input) => void confirmRouteAction(input)}
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
                  {trackingTotal.toLocaleString('th-TH')} จุด
                  {routeGroupsOnPage > 0 && ` · ${routeGroupsOnPage} เที่ยวในหน้านี้`}
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
                placeholder="ค้นหา Route, order, ลูกค้า, เบอร์โทร, คนขับ..."
                className="h-9 rounded-lg pl-9"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">{currentViewDescription}</div>
          </div>

          <div className="relative flex-1 space-y-2 overflow-y-auto p-2 [scrollbar-gutter:stable]">
            {trackingListGroups.map((group) => {
              const first = group[0];
              const isRoute = Boolean(first.deliveryRoute?.id);
              if (isRoute) {
                // การ์ด Route ต้องพาไป action ของจุดที่รอตรวจสอบได้ทันที
                // ไม่เช่นนั้นงานสถานะ pending_confirmation จะมีปุ่มยืนยันเฉพาะใน drawer
                // ซึ่งผู้ใช้หาไม่เจอจากรายการเที่ยวหลัก
                const actionableOrder =
                  group.find(
                    (order) =>
                      order.status === 'pending_confirmation' &&
                      order.metadataJson?.dispatch?.routeLeg !== 'pickup',
                  ) ?? group.find((order) => order.status === 'assigned');
                return (
                  <TrackingRouteCard
                    key={first.deliveryRoute!.id}
                    orders={group}
                    selectedOrderId={selectedOrderId}
                    onSelectStop={(order) => setSelectedOrderId(order.id)}
                    onViewLive={openLiveRoute}
                    settling={group.some((order) => !!settlingOrders[order.id])}
                    settledLabel={group
                      .map((order) => settlingOrders[order.id])
                      .find((label): label is string => Boolean(label))}
                    actions={
                      actionableOrder
                        ? actionableOrder.status === 'pending_confirmation'
                          ? renderConfirmDeliveryAction(actionableOrder)
                          : renderActions(actionableOrder)
                        : undefined
                    }
                    nowMs={nowMs}
                  />
                );
              }
              return (
                <TrackingCard
                  key={first.id}
                  order={first}
                  selected={selectedOrderId === first.id}
                  onSelect={() => setSelectedOrderId(first.id)}
                  actions={renderActions(first)}
                  overdueMinutes={getAssignedOrderOverdueMinutes(first, nowMs)}
                  inTransitMinutes={getInTransitElapsedMinutes(first, nowMs)}
                  settling={!!settlingOrders[first.id]}
                  settledLabel={settlingOrders[first.id]}
                  nowMs={nowMs}
                />
              );
            })}

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
        proofOrder={selectedRouteActionOrder}
        driver={selectedDriver}
        drivers={drivers}
        routeOrders={selectedRouteOrders}
        isDetailLoading={isDetailLoading}
        onClose={() => setSelectedOrderId(null)}
        onSelectStop={(order) => setSelectedOrderId(order.id)}
        actions={selectedRouteActionOrder ? renderActions(selectedRouteActionOrder) : undefined}
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
