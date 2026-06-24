import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { AutoAssignPreviewDialog } from '@/components/delivery/AutoAssignPreviewDialog';
import { OrderTimeline } from '@/components/OrderTimeline';
import { MobileDetailSheet } from '@/components/MobileDetailSheet';
import {
  DriverCard,
  DriverSummary,
  EmptyState,
  OrderSummary,
  QueueAiAssessment,
  QueueOrderCard,
} from '@/components/delivery/DeliveryExecutionShared';
import { type CancelReason, cancelReasonLabel, statusLabel } from '@/data/mock';
import { getTomorrowDateKey, isVisibleInExecutionQueue } from '@/lib/deliveryPlanning';
import {
  compareOrderPriority,
  canDriverTakeOrder,
  driverQueueTabLabels,
  getDriverQueueTab,
  planAutoAssignments,
  recommendDriverForOrder,
  type DriverQueueTab,
} from '@/lib/deliveryExecution';
import { getAdminRouteOrigin } from '@/lib/adminLocation';
import { previewPlanningRoute, type RoutePreview } from '@/lib/retailApi';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import { Ban, BellRing, CalendarClock, List, MapPin, Route, Search, Sparkles } from 'lucide-react';
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
  onOpenPlanning: (search?: string) => void;
};

export function QueuePage({ locationSearch, onOpenTracking, onOpenPlanning }: QueuePageProps) {
  const {
    orders,
    drivers,
    autoAssignReadyOrders,
    startDelivery,
    cancelOrder,
    planOrders,
    publishUrgentRoute,
  } = useRetailStore();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [paneView, setPaneView] = useState<'list' | 'map'>('list');
  const [autoPreviewOpen, setAutoPreviewOpen] = useState(false);
  const [planningTargetId, setPlanningTargetId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState('');
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routePreviewLoading, setRoutePreviewLoading] = useState(false);
  const [urgentTarget, setUrgentTarget] = useState<{
    orderId: string;
    driverId: string;
  } | null>(null);
  const [urgentLoading, setUrgentLoading] = useState(false);
  const [urgentError, setUrgentError] = useState('');

  const workflowOrders = orders.filter(
    (order) => getDriverQueueTab(order) && isVisibleInExecutionQueue(order),
  );
  const readyOrders = workflowOrders.filter((order) => order.status === 'ready');
  const assignedOrders = workflowOrders.filter((order) => order.status === 'assigned');
  const defaultTab: DriverQueueTab =
    readyOrders.length > 0 || assignedOrders.length === 0 ? 'ready' : 'assigned';
  const parsedSearch = useMemo(() => parseQueueSearch(locationSearch), [locationSearch]);

  const [activeTab, setActiveTab] = useState<DriverQueueTab>(parsedSearch.tab ?? defaultTab);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    parsedSearch.orderId ?? readyOrders[0]?.id ?? assignedOrders[0]?.id ?? null,
  );
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  // มือถือ: เปิด overlay เฉพาะตอนผู้ใช้แตะรายการ (กัน auto-select ไม่ให้เด้งทับ list ตอนโหลด)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? null;

  // คนขับที่ระบบแนะนำสำหรับออเดอร์ที่เลือก (โซน + capacity + ใบรับรอง)
  const recommendedDriverId =
    selectedOrder?.status === 'ready'
      ? (recommendDriverForOrder(selectedOrder, drivers)?.id ?? null)
      : null;

  // แผนจ่ายงานอัตโนมัติ (dry-run) สำหรับ preview ก่อนยืนยัน
  const autoAssignProposals = useMemo(
    () => planAutoAssignments(orders, drivers),
    [orders, drivers],
  );

  const filteredOrders = workflowOrders
    .filter((order) => {
      const tab = getDriverQueueTab(order);
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

      return tab === activeTab && matchesQuery;
    })
    // แท็บ "รอมอบหมาย" เรียงตามความสำคัญ — งานด่วน/มูลค่าสูง/ค้างนานขึ้นก่อน
    .sort((a, b) => (activeTab === 'ready' ? compareOrderPriority(a, b) : 0));

  useEffect(() => {
    if (parsedSearch.tab) {
      setActiveTab(parsedSearch.tab);
    }
  }, [parsedSearch.tab]);

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
      setSelectedDriverId(null);
      return;
    }
    if (selectedOrder.assignedDriverId) {
      setSelectedDriverId(selectedOrder.assignedDriverId);
      return;
    }
    setSelectedDriverId(selectedOrder.status === 'ready' ? recommendedDriverId : null);
  }, [recommendedDriverId, selectedOrder]);

  const canAssign =
    selectedOrder?.status === 'ready' &&
    selectedDriver &&
    canDriverTakeOrder(selectedOrder, selectedDriver);

  const tabCounts: Record<DriverQueueTab, number> = {
    ready: readyOrders.length,
    assigned: assignedOrders.length,
  };

  const assignedReadyToStart = assignedOrders.length > 0;

  const handleStartRoute = (orderIds: string[], selectedOrderForFocus?: string) => {
    orderIds.forEach((orderId) => startDelivery(orderId));
    onOpenTracking(buildTrackingSearch(selectedOrderForFocus));
  };

  const moveToPlanning = async (orderId: string) => {
    setPlanningTargetId(orderId);
    setOperationError('');
    try {
      await planOrders([orderId], {
        plannedDate: getTomorrowDateKey(),
        dispatchReadiness: 'ready',
      });
      onOpenPlanning(`?order=${encodeURIComponent(orderId)}`);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    } finally {
      setPlanningTargetId(null);
    }
  };

  const confirmUrgentDispatch = async (note?: string) => {
    if (!urgentTarget) return;
    setUrgentLoading(true);
    setUrgentError('');
    try {
      await publishUrgentRoute(urgentTarget.orderId, {
        driverCode: urgentTarget.driverId,
        note,
      });
      const orderId = urgentTarget.orderId;
      setUrgentTarget(null);
      onOpenTracking(`?tab=awaiting_acceptance&order=${encodeURIComponent(orderId)}`);
    } catch (error) {
      setUrgentError(error instanceof Error ? error.message : String(error));
    } finally {
      setUrgentLoading(false);
    }
  };

  const routeTargetOrders =
    activeTab === 'assigned' && selectedOrder?.status === 'assigned'
      ? [selectedOrder]
      : assignedOrders;

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
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={!canAssign}
              onClick={() => {
                if (!selectedOrder || !selectedDriverId) return;
                setUrgentError('');
                setUrgentTarget({ orderId: selectedOrder.id, driverId: selectedDriverId });
              }}
            >
              <BellRing className="h-4 w-4" />
              ส่งด่วนทันที
            </Button>
            <Button
              variant="outline"
              disabled={planningTargetId === selectedOrder.id}
              onClick={() => void moveToPlanning(selectedOrder.id)}
            >
              <CalendarClock className="h-4 w-4" />
              วางแผนล่วงหน้า
            </Button>
          </div>
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
          <h1 className="text-2xl font-semibold tracking-tight">คิวงานพร้อมจ่าย</h1>
          <p className="text-sm text-muted-foreground">
            ส่งทันทีให้เลือกคนขับที่นี่ หรือนำงานไปวางแผนล่วงหน้าโดยไม่แสดงซ้ำสองหน้า
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            disabled={!assignedReadyToStart}
            onClick={() =>
              handleStartRoute(
                routeTargetOrders.map((order) => order.id),
                routeTargetOrders.length === 1 ? routeTargetOrders[0]?.id : undefined,
              )
            }
          >
            <Route className="h-4 w-4" />
            สร้าง Route
          </Button>
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
          autoAssignReadyOrders(orderIds);
          setAutoPreviewOpen(false);
          setActiveTab('assigned');
        }}
      />

      <UrgentDispatchDialog
        open={!!urgentTarget}
        order={orders.find((order) => order.id === urgentTarget?.orderId) ?? null}
        driver={drivers.find((driver) => driver.id === urgentTarget?.driverId) ?? null}
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
          if (cancelTargetId) cancelOrder(cancelTargetId, { reason, note });
          setCancelTargetId(null);
        }}
      />

      {operationError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {operationError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px_380px]">
        <Card className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <div className="space-y-3">
              <CardTitle className="text-sm">งานพร้อมจ่ายวันนี้</CardTitle>
              <div className="flex flex-col gap-3">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as DriverQueueTab)}
                  className="w-full"
                >
                  <div className="w-full">
                    <TabsList className="flex h-auto w-full flex-nowrap justify-start gap-1.5 overflow-x-auto rounded-2xl bg-muted/70 p-1.5 lg:flex-wrap">
                      {(Object.keys(driverQueueTabLabels) as DriverQueueTab[]).map((tab) => (
                        <TabsTrigger
                          key={tab}
                          value={tab}
                          className="h-10 shrink-0 gap-2 rounded-xl px-3.5 text-sm text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                        >
                          <span>{driverQueueTabLabels[tab]}</span>
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/80 px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {tabCounts[tab]}
                          </span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                </Tabs>
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
                            geometry: routePreview?.geometry ?? [],
                          }
                        : null
                    }
                    emptyLabel="เลือก order จากรายการเพื่อดูปลายทาง"
                    selectedLabel="กำลังพรีวิวเส้นทางของ order นี้"
                    unselectedLabel="แตะเพื่อพรีวิวเส้นทางของ order นี้"
                    routePreviewTitle="พรีวิวเส้นทางก่อนส่งด่วน"
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
                      rank={activeTab === 'ready' ? index + 1 : undefined}
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
                  ? `สำหรับ ${selectedOrder.code}`
                  : `${selectedOrder.code} · ${statusLabel[selectedOrder.status]}`
                : 'เลือก order ก่อน'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-auto">
            {drivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                selected={selectedDriverId === driver.id}
                onSelect={() => setSelectedDriverId(driver.id)}
                recommended={driver.id === recommendedDriverId}
              />
            ))}
          </CardContent>
        </Card>

        <div className="hidden h-[calc(100vh-12rem)] space-y-4 overflow-auto lg:block">
          <AssignmentPanel
            order={selectedOrder}
            driver={selectedDriver}
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
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">เลือกคนขับ</div>
                <div className="space-y-2">
                  {drivers.map((driver) => (
                    <DriverCard
                      key={driver.id}
                      driver={driver}
                      selected={selectedDriverId === driver.id}
                      onSelect={() => setSelectedDriverId(driver.id)}
                      recommended={driver.id === recommendedDriverId}
                    />
                  ))}
                </div>
              </div>
            )}
            {selectedOrder.status === 'assigned' && selectedDriver && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-muted-foreground">คนขับ</div>
                <DriverSummary driver={selectedDriver} order={selectedOrder} />
              </div>
            )}
            <QueueAiAssessment />
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
