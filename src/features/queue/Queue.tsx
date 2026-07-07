import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { AutoAssignPreviewDialog } from '@/components/delivery/AutoAssignPreviewDialog';
import { OrderTimeline } from '@/components/OrderTimeline';
import { MobileDetailSheet } from '@/components/MobileDetailSheet';
import {
  DriverCard,
  DriverSummary,
  EmptyState,
  OrderSummary,
  QueueOrderCard,
} from '@/components/delivery/DeliveryExecutionShared';
import { type CancelReason, cancelReasonLabel, statusLabel } from '@/data/orderTypes';
import { isVisibleInExecutionQueue } from '@/lib/deliveryPlanning';
import {
  getDriverQueueTab,
  planAutoAssignments,
  recommendDriverForOrder,
} from '@/lib/deliveryExecution';
import {
  formatFastDispatchDueAt,
  getFastDispatchSla,
  isFastDispatchOrder,
} from '@/lib/fastDispatch';
import { getAdminRouteOrigin } from '@/lib/adminLocation';
import { previewPlanningRoute, type RoutePreview } from '@/lib/retailApi';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import {
  Ban,
  BellRing,
  CheckCircle2,
  Clock,
  List,
  MapPin,
  PlayCircle,
  Route,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import { AssignmentPanel } from './components/AssignmentPanel';
import { UrgentDispatchDialog } from './components/UrgentDispatchDialog';
import { buildTrackingSearch, parseQueueSearch } from './utils/queueSearch';
import { PlanningMap } from '@/features/planning/components/PlanningMap';

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({ value, label: cancelReasonLabel[value] }));

type QueuePageProps = {
  locationSearch: string;
  onOpenTracking: (search?: string) => void;
};

export function QueuePage({ locationSearch, onOpenTracking }: QueuePageProps) {
  const {
    orders,
    drivers,
    autoAssignAndDispatchReadyOrders,
    startDelivery,
    cancelOrder,
    publishUrgentRoute,
  } = useRetailStore();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [paneView, setPaneView] = useState<'list' | 'map'>('list');
  const [autoPreviewOpen, setAutoPreviewOpen] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routePreviewLoading, setRoutePreviewLoading] = useState(false);
  const [urgentTarget, setUrgentTarget] = useState<{
    orderId: string;
    driverIds: string[];
  } | null>(null);
  const [urgentLoading, setUrgentLoading] = useState(false);
  const [urgentError, setUrgentError] = useState('');

  const workflowOrders = orders.filter(
    (order) => getDriverQueueTab(order) && isVisibleInExecutionQueue(order),
  );
  const readyOrders = workflowOrders.filter((order) => order.status === 'ready');
  const assignedOrders = workflowOrders.filter((order) => order.status === 'assigned');
  const parsedSearch = useMemo(() => parseQueueSearch(locationSearch), [locationSearch]);
  const fastMode = parsedSearch.mode === 'fast';
  const fastReadyOrders = readyOrders.filter(isFastDispatchOrder);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    parsedSearch.orderId ?? readyOrders[0]?.id ?? assignedOrders[0]?.id ?? null,
  );
  // เลือกคนขับได้หลายคน (co-delivery) — index 0 = คนขับหลัก, ที่เหลือ = คนขับร่วม
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  // มือถือ: เปิด overlay เฉพาะตอนผู้ใช้แตะรายการ (กัน auto-select ไม่ให้เด้งทับ list ตอนโหลด)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const toggleDriver = (driverId: string) =>
    setSelectedDriverIds((current) =>
      current.includes(driverId) ? current.filter((id) => id !== driverId) : [...current, driverId],
    );

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedDrivers = selectedDriverIds
    .map((id) => drivers.find((driver) => driver.id === id))
    .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver));
  const fastSelectedSla = selectedOrder ? getFastDispatchSla(selectedOrder) : null;

  // คนขับที่ระบบแนะนำสำหรับออเดอร์ที่เลือก (ความพร้อม + โหลดงาน + ใบรับรอง)
  const recommendedDriverId =
    selectedOrder?.status === 'ready'
      ? (recommendDriverForOrder(selectedOrder, drivers)?.id ?? null)
      : null;

  // แผนจ่ายงานอัตโนมัติ (dry-run) สำหรับ preview ก่อนยืนยัน
  const autoAssignProposals = useMemo(
    () => planAutoAssignments(orders, drivers),
    [orders, drivers],
  );

  // list เดียวรวม ready + assigned — ไม่มีแท็บแล้ว แยกสถานะด้วย badge บนการ์ด
  const filteredOrders = workflowOrders
    .filter((order) => {
      const normalizedQuery = query.trim().toLowerCase();
      const assignedDriverName = order.assignedDriverId
        ? (drivers.find((driver) => driver.id === order.assignedDriverId)?.name ?? '')
        : '';
      const matchesQuery =
        !normalizedQuery ||
        [
          order.code,
          order.customer.name,
          order.customer.phone,
          order.customer.address,
          assignedDriverName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesQuery;
    })
    .sort((a, b) => {
      if (fastMode) {
        const fastDiff = Number(isFastDispatchOrder(b)) - Number(isFastDispatchOrder(a));
        if (fastDiff !== 0) return fastDiff;
      }
      // เรียง order ล่าสุดขึ้นก่อน (newest receivedAt first)
      return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
    });

  useEffect(() => {
    if (parsedSearch.orderId) {
      setSelectedOrderId(parsedSearch.orderId);
    }
  }, [parsedSearch.orderId]);

  useEffect(() => {
    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? null);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrder) {
      setSelectedDriverIds([]);
      return;
    }
    if (selectedOrder.assignedDriverId) {
      setSelectedDriverIds([selectedOrder.assignedDriverId, ...(selectedOrder.coDriverIds ?? [])]);
      return;
    }
    setSelectedDriverIds(
      selectedOrder.status === 'ready' && recommendedDriverId ? [recommendedDriverId] : [],
    );
  }, [recommendedDriverId, selectedOrder]);

  const canUrgentDispatch =
    selectedOrder?.status === 'ready' &&
    selectedDriverIds.length > 0 &&
    selectedDrivers.length === selectedDriverIds.length &&
    selectedDrivers.every((driver) => driver.status !== 'off_duty');

  const handleStartRoute = (orderIds: string[], selectedOrderForFocus?: string) => {
    orderIds.forEach((orderId) => startDelivery(orderId));
    toast.success(
      orderIds.length === 1
        ? 'สร้าง Route และเริ่มจัดส่งแล้ว'
        : `สร้าง Route และเริ่มจัดส่ง ${orderIds.length} งานแล้ว`,
    );
    onOpenTracking(buildTrackingSearch(selectedOrderForFocus));
  };

  const confirmUrgentDispatch = async (note?: string) => {
    if (!urgentTarget) return;
    setUrgentLoading(true);
    setUrgentError('');
    try {
      await publishUrgentRoute(urgentTarget.orderId, {
        driverCode: urgentTarget.driverIds[0],
        coDriverCodes: urgentTarget.driverIds.slice(1),
        note,
      });
      const orderId = urgentTarget.orderId;
      const orderCode = orders.find((order) => order.id === orderId)?.code ?? '';
      setUrgentTarget(null);
      toast.success(`ส่งงานทันที ${orderCode} ให้คนขับแล้ว — รอคนขับรับงาน`);
      onOpenTracking(`?tab=awaiting_acceptance&order=${encodeURIComponent(orderId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUrgentError(message);
      toast.error(`ส่งงานทันทีไม่สำเร็จ — ${message}`);
    } finally {
      setUrgentLoading(false);
    }
  };

  const simulateMessengerAccept = async () => {
    if (!selectedOrder) return;
    setOperationError('');
    try {
      await startDelivery(selectedOrder.id);
      toast.success(`${selectedOrder.code} จำลอง Messenger รับงานและเริ่มส่งแล้ว`);
      onOpenTracking(`?tab=in_transit&order=${encodeURIComponent(selectedOrder.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOperationError(message);
      toast.error(`จำลองรับงานไม่สำเร็จ — ${message}`);
    }
  };

  const openUrgentTimeoutView = () => {
    if (!selectedOrder) return;
    toast.message('เปิดมุมมองงานเลยกำหนดใน Tracking');
    onOpenTracking(`?tab=overdue&order=${encodeURIComponent(selectedOrder.id)}`);
  };

  const selectedOrderSet = useMemo(
    () => new Set(selectedOrderId ? [selectedOrderId] : []),
    [selectedOrderId],
  );
  const mapPreviewOrders = selectedOrder ? [selectedOrder] : [];

  useEffect(() => {
    if (paneView !== 'map' || !selectedOrder) {
      setRoutePreview(null);
      setRoutePreviewLoading(false);
      return;
    }
    let cancelled = false;
    setRoutePreviewLoading(true);
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const origin = await getAdminRouteOrigin();
        try {
          const preview = await previewPlanningRoute({ orderIds: [selectedOrder.id], origin });
          if (!cancelled) setRoutePreview(preview);
        } catch {
          if (!cancelled) setRoutePreview(null);
        } finally {
          if (!cancelled) setRoutePreviewLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [paneView, selectedOrder]);

  // ปุ่ม action ตามสถานะ — ใช้ซ้ำทั้งคอลัมน์ขวา (เดสก์ท็อป) และ footer ของ overlay มือถือ
  const assignmentActions = selectedOrder ? (
    <>
      {selectedOrder.status === 'ready' && (
        <div className="space-y-2">
          <Button
            className="w-full"
            disabled={!canUrgentDispatch}
            onClick={() => {
              if (!selectedOrder || selectedDriverIds.length === 0) return;
              setUrgentError('');
              setUrgentTarget({ orderId: selectedOrder.id, driverIds: selectedDriverIds });
            }}
          >
            <Send className="h-4 w-4" />
            ส่งทันที
          </Button>
          <Button
            variant="ghost"
            className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setCancelTargetId(selectedOrder.id)}
          >
            <Ban className="h-4 w-4" />
            ยกเลิกออเดอร์
          </Button>
        </div>
      )}

      {selectedOrder.status === 'assigned' && (
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => handleStartRoute([selectedOrder.id], selectedOrder.id)}
          >
            <Route className="h-4 w-4" />
            สร้าง Route และเริ่มจัดส่ง
          </Button>
          <Button
            variant="outline"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setCancelTargetId(selectedOrder.id)}
          >
            <Ban className="h-4 w-4" />
            ยกเลิกออเดอร์
          </Button>
        </div>
      )}
    </>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ส่งทันที</h1>
          <p className="text-sm text-muted-foreground">
            เลือกคนขับเพื่อส่งงานให้ Messenger ทันที หรือใช้ Auto-assign สำหรับงานวันนี้
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => setAutoPreviewOpen(true)} disabled={readyOrders.length === 0}>
            <Sparkles className="h-4 w-4" /> Auto-assign งานวันนี้
          </Button>
        </div>
      </div>

      <AutoAssignPreviewDialog
        open={autoPreviewOpen}
        proposals={autoAssignProposals}
        drivers={drivers}
        onCancel={() => setAutoPreviewOpen(false)}
        onConfirm={(orderIds) => {
          setAutoPreviewOpen(false);
          void (async () => {
            const dispatched = await autoAssignAndDispatchReadyOrders(orderIds);
            toast.success(`จ่ายงาน + เริ่มจัดส่ง ${dispatched.length} งานแล้ว`);
            onOpenTracking(
              buildTrackingSearch(dispatched.length === 1 ? dispatched[0] : undefined),
            );
          })();
        }}
      />

      <UrgentDispatchDialog
        open={!!urgentTarget}
        order={orders.find((order) => order.id === urgentTarget?.orderId) ?? null}
        drivers={
          urgentTarget
            ? urgentTarget.driverIds
                .map((id) => drivers.find((driver) => driver.id === id))
                .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver))
            : []
        }
        loading={urgentLoading}
        error={urgentError}
        onCancel={() => {
          if (!urgentLoading) setUrgentTarget(null);
        }}
        onConfirm={(note) => void confirmUrgentDispatch(note)}
      />

      <ResolutionDialog
        open={!!cancelTargetId}
        title="ยกเลิกออเดอร์"
        description={
          cancelTargetId
            ? `${orders.find((order) => order.id === cancelTargetId)?.code ?? ''} — เลือกเหตุผล`
            : undefined
        }
        reasons={CANCEL_REASONS}
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => setCancelTargetId(null)}
        onConfirm={({ reason, note }) => {
          if (cancelTargetId) {
            const code = orders.find((order) => order.id === cancelTargetId)?.code ?? '';
            cancelOrder(cancelTargetId, { reason, note });
            toast.success(`ยกเลิกออเดอร์ ${code} แล้ว`);
          }
          setCancelTargetId(null);
        }}
      />

      {operationError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {operationError}
        </div>
      )}

      {fastMode && (
        <div className="grid gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm lg:grid-cols-[1fr_220px_220px]">
          <div>
            <div className="flex items-center gap-2 font-medium text-warning">
              <BellRing className="h-4 w-4" />
              Fast Dispatch local demo
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              งานจาก import ถูกเปิดเข้าคิวพร้อม focus order แล้ว ขั้นต่อไปคือเลือก Messenger,
              พรีวิวแผนที่ แล้วกดยืนยันส่งทันที
            </div>
          </div>
          <div className="rounded-lg border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">จับ SLA ด่วนได้</div>
            <div className="mt-0.5 text-lg font-semibold text-warning">
              {fastReadyOrders.length}
              <span className="ml-1 text-xs font-normal text-muted-foreground">งานพร้อมจ่าย</span>
            </div>
          </div>
          <div className="rounded-lg border bg-background/70 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Order ที่เลือก</div>
            <div className="mt-0.5 truncate font-mono text-sm font-semibold">
              {selectedOrder?.code ?? 'ยังไม่ได้เลือก'}
            </div>
            {fastSelectedSla && (
              <div
                className={cn(
                  'mt-0.5 text-[11px]',
                  fastSelectedSla.urgent ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                {fastSelectedSla.urgent
                  ? `${fastSelectedSla.detail} · ${formatFastDispatchDueAt(fastSelectedSla.dueAt)}`
                  : 'ยังไม่พบ keyword ด่วนจากข้อมูลนำเข้า'}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px_380px]">
        <Card className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <div className="space-y-3">
              <CardTitle className="text-sm">งานพร้อมจ่ายวันนี้</CardTitle>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                    รอมอบหมาย
                    <span className="font-semibold tabular-nums text-foreground">
                      {readyOrders.length}
                    </span>
                  </span>
                  {assignedOrders.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-2.5 py-1 font-medium text-info">
                      จับคู่แล้ว · รอสร้าง Route
                      <span className="font-semibold tabular-nums">{assignedOrders.length}</span>
                    </span>
                  )}
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
                <div className="flex rounded-xl border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPaneView('list')}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      paneView === 'list'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-pressed={paneView === 'list'}
                  >
                    <List className="h-3.5 w-3.5" />
                    รายการ
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                      {filteredOrders.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaneView('map')}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                      paneView === 'map'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-pressed={paneView === 'map'}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    แผนที่
                    {selectedOrder && (
                      <span className="rounded-full bg-info/15 px-1.5 text-[10px] tabular-nums text-info">
                        1
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            {paneView === 'map' ? (
              <section className="flex h-full min-h-0 flex-col" aria-labelledby="queue-map-title">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div
                      id="queue-map-title"
                      className="flex items-center gap-1.5 text-xs font-medium"
                    >
                      <MapPin className="h-3.5 w-3.5 text-info" />
                      {selectedOrder
                        ? routePreview?.geometry.length || routePreviewLoading
                          ? 'พรีวิวเส้นทางตามถนน'
                          : 'ปลายทางของ order ที่เลือก'
                        : 'ตรวจสอบจุดส่งบนแผนที่'}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedOrder
                        ? `${selectedOrder.code} · ${selectedOrder.customer.address}`
                        : 'เลือก order จากรายการหรือแตะหมุดเพื่อคำนวณเส้นทาง'}
                    </p>
                  </div>
                  {mapPreviewOrders.length > 0 && (
                    <Badge variant="info" className="shrink-0">
                      {mapPreviewOrders.length} จุด
                    </Badge>
                  )}
                </div>
                <div className="min-h-[320px] flex-1">
                  <PlanningMap
                    orders={mapPreviewOrders}
                    selectedIds={selectedOrderSet}
                    onToggle={(orderId) => {
                      setSelectedOrderId(orderId);
                      setMobileDetailOpen(false);
                    }}
                    route={
                      selectedOrder && (routePreview?.geometry.length || routePreviewLoading)
                        ? {
                            preview: true,
                            loading: routePreviewLoading && !routePreview?.geometry.length,
                            distanceMeters: routePreview?.distanceMeters,
                            durationSeconds: routePreview?.durationSeconds,
                            geometry: routePreview?.geometry ?? [],
                          }
                        : null
                    }
                    emptyLabel="เลือก order จากรายการเพื่อดูปลายทาง"
                    selectedLabel="กำลังพรีวิวเส้นทางของ order นี้"
                    unselectedLabel="แตะเพื่อพรีวิวเส้นทางของ order นี้"
                    routePreviewTitle="พรีวิวเส้นทางก่อนส่งทันที"
                  />
                </div>
              </section>
            ) : (
              <div className="h-full space-y-2 overflow-auto pr-1">
                {filteredOrders.map((order, index) => (
                  <div key={order.id} className="relative">
                    <QueueOrderCard
                      order={order}
                      selected={selectedOrderId === order.id}
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        setMobileDetailOpen(true);
                      }}
                      statusText={statusLabel[order.status]}
                      rank={index + 1}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-12 inline-flex h-8 items-center justify-center gap-1.5 rounded-full border bg-background/95 px-2.5 text-xs font-medium text-info shadow-sm transition hover:bg-info/10"
                      aria-label={`ดูแผนที่ของ ${order.code}`}
                      title="ดูแผนที่"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedOrderId(order.id);
                        setMobileDetailOpen(false);
                        setPaneView('map');
                      }}
                    >
                      <MapPin className="h-4 w-4" />
                      ดูแผนที่
                    </button>
                  </div>
                ))}
                {filteredOrders.length === 0 && <EmptyState />}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hidden h-[calc(100vh-12rem)] flex-col overflow-hidden lg:flex">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">เลือกคนขับ</CardTitle>
            <CardDescription>
              {selectedOrder
                ? selectedOrder.status === 'ready'
                  ? selectedDriverIds.length > 1
                    ? `สำหรับ ${selectedOrder.code} · ส่งร่วม ${selectedDriverIds.length} คน`
                    : `สำหรับ ${selectedOrder.code} · เลือกหลายคนเพื่อส่งร่วมกัน`
                  : `${selectedOrder.code} · ${statusLabel[selectedOrder.status]}`
                : 'เลือก order ก่อน'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-auto">
            {drivers.map((driver) => {
              const rank = selectedDriverIds.indexOf(driver.id);
              return (
                <DriverCard
                  key={driver.id}
                  driver={driver}
                  selected={rank !== -1}
                  coRole={rank === -1 ? undefined : rank === 0 ? 'primary' : 'secondary'}
                  onSelect={() => toggleDriver(driver.id)}
                  orders={orders}
                />
              );
            })}
          </CardContent>
        </Card>

        <div className="hidden h-[calc(100vh-12rem)] space-y-4 overflow-auto lg:block">
          {fastMode && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm text-warning">
                  <PlayCircle className="h-4 w-4" />
                  Local Route Simulator
                </CardTitle>
                <CardDescription>
                  ใช้ action จริงของระบบเพื่อทดสอบภาพรวมก่อนต่อ Google Maps/automation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-[20px_1fr] gap-x-2 gap-y-2 text-xs">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                  <div>
                    <div className="font-medium">1. Import approved</div>
                    <div className="text-muted-foreground">Order ถูกเปิดในคิวพร้อมจ่ายแล้ว</div>
                  </div>
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                      selectedOrder?.status === 'assigned' ||
                        selectedOrder?.status === 'in_transit' ||
                        selectedOrder?.status === 'pending_confirmation'
                        ? 'border-success text-success'
                        : 'border-muted-foreground/40 text-muted-foreground',
                    )}
                  >
                    2
                  </div>
                  <div>
                    <div className="font-medium">Create urgent route</div>
                    <div className="text-muted-foreground">เลือก Messenger แล้วกดส่งทันที</div>
                  </div>
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px]',
                      selectedOrder?.status === 'in_transit' ||
                        selectedOrder?.status === 'pending_confirmation'
                        ? 'border-success text-success'
                        : 'border-muted-foreground/40 text-muted-foreground',
                    )}
                  >
                    3
                  </div>
                  <div>
                    <div className="font-medium">Messenger accepts</div>
                    <div className="text-muted-foreground">จำลองการรับงานและเริ่มส่ง</div>
                  </div>
                </div>

                {/* ปุ่มส่งทันทีของ order ที่พร้อมจ่าย อยู่ที่แผง "ยืนยันการมอบหมาย" ด้านล่างแล้ว
                    (assignmentActions) — ไม่ต้องมีปุ่มซ้ำในการ์ด simulator */}
                {selectedOrder?.status === 'ready' && (
                  <div className="rounded-lg border border-dashed bg-background/70 p-3 text-center text-xs text-muted-foreground">
                    เลือกคนขับด้านล่าง แล้วกด “ส่งทันที” ที่แผงยืนยันการมอบหมาย
                  </div>
                )}

                {selectedOrder?.status === 'assigned' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => void simulateMessengerAccept()}>
                      <PlayCircle className="h-4 w-4" />
                      รับงาน
                    </Button>
                    <Button variant="outline" onClick={openUrgentTimeoutView}>
                      <Clock className="h-4 w-4" />
                      ไม่รับงาน
                    </Button>
                  </div>
                )}

                {!selectedOrder && (
                  <div className="rounded-lg border border-dashed bg-background/70 p-3 text-center text-xs text-muted-foreground">
                    เลือก order เพื่อจำลอง route
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <AssignmentPanel
            order={selectedOrder}
            drivers={selectedDrivers}
            actions={assignmentActions}
          />
          <OrderTimeline
            order={selectedOrder}
            description="กิจกรรมที่เกิดขึ้นกับออเดอร์นี้"
            compact
          />
        </div>
      </div>

      {/* มือถือ: เลือกคนขับ + มอบหมาย/สร้าง Route แบบเต็มจอ */}
      <MobileDetailSheet
        open={!!selectedOrder && mobileDetailOpen}
        title={<span className="font-mono">{selectedOrder?.code}</span>}
        subtitle={selectedOrder ? statusLabel[selectedOrder.status] : undefined}
        onClose={() => setMobileDetailOpen(false)}
        footer={assignmentActions}
      >
        {selectedOrder && (
          <>
            <OrderSummary order={selectedOrder} />
            {selectedOrder.status === 'ready' && (
              <div>
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                  เลือกคนขับ · เลือกหลายคนเพื่อส่งร่วมกัน
                </div>
                <div className="space-y-2">
                  {drivers.map((driver) => {
                    const rank = selectedDriverIds.indexOf(driver.id);
                    return (
                      <DriverCard
                        key={driver.id}
                        driver={driver}
                        selected={rank !== -1}
                        coRole={rank === -1 ? undefined : rank === 0 ? 'primary' : 'secondary'}
                        onSelect={() => toggleDriver(driver.id)}
                        orders={orders}
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {selectedOrder.status === 'assigned' && selectedDrivers.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                  คนขับ{selectedDrivers.length > 1 ? ` · ส่งร่วม ${selectedDrivers.length} คน` : ''}
                </div>
                <div className="space-y-2">
                  {selectedDrivers.map((driver) => (
                    <DriverSummary
                      key={driver.id}
                      driver={driver}
                      order={selectedOrder}
                      orders={orders}
                    />
                  ))}
                </div>
              </div>
            )}
            <OrderTimeline
              order={selectedOrder}
              description="กิจกรรมที่เกิดขึ้นกับออเดอร์นี้"
              compact
            />
          </>
        )}
      </MobileDetailSheet>
    </div>
  );
}
