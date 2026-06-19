import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { OrderTimeline } from '@/components/OrderTimeline';
import { AlertTriangle, CalendarClock, Route, Search, Users } from 'lucide-react';
import {
  planningCancelReasonLabel,
  type DispatchReadiness,
  type Order,
  type PlanningCancelReason,
} from '@/data/mock';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import {
  canPlanOrder,
  canReleasePlannedOrder,
  formatPlanningDate,
  getNextHourTime,
  getPlannedLoadCount,
  getTodayDateKey,
  getTomorrowDateKey,
  isUnreleasedPlannedOrder,
} from '@/lib/deliveryPlanning';
import { useRetailStore } from '@/state/retailStore';
import { PlanningOrderCard } from './components/PlanningOrderCard';
import { DriverPlanningCard } from './components/DriverPlanningCard';
import { PlanSettingsCard } from './components/PlanSettingsCard';
import { DaySummaryCard } from './components/DaySummaryCard';
import { getDefaultPlanningDate, matchesPlanningQuery } from './utils/planningHelpers';
import { fetchPlanningRoutes, retryPlanningRoutePush, type PlanningRoute } from '@/lib/retailApi';
import { PublishedRoutesCard } from './components/PublishedRoutesCard';

export function PlanningPage({ locationSearch }: { locationSearch: string }) {
  const { orders, drivers, planOrders, clearPlannedOrders, releasePlannedOrders } =
    useRetailStore();
  // เปิดหน้าที่งานวันนี้ก่อนเสมอ เพื่อให้งาน active/เลยเวลาหาเจอและจัดการได้ทันที
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateKey());
  const [query, setQuery] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [planDate, setPlanDate] = useState(() => getDefaultPlanningDate(orders));
  const [planTime, setPlanTime] = useState(() => getNextHourTime());
  const [plannedDriverId, setPlannedDriverId] = useState('');
  const [readiness, setReadiness] = useState<DispatchReadiness>('ready');
  const [planNote, setPlanNote] = useState('');
  const [routes, setRoutes] = useState<PlanningRoute[]>([]);
  const [operationState, setOperationState] = useState<'idle' | 'saving' | 'publishing'>('idle');
  const [operationError, setOperationError] = useState('');
  const [cancelPlansOpen, setCancelPlansOpen] = useState(false);

  const todayDate = getTodayDateKey();
  const focusedOrderId = new URLSearchParams(locationSearch).get('order');
  const planningEligibleOrders = orders.filter((order) => canPlanOrder(order));
  const plannedOrders = planningEligibleOrders.filter((order) => isUnreleasedPlannedOrder(order));
  const plannedForSelectedDate = plannedOrders
    .filter((order) => order.deliveryPlan?.plannedDate === selectedDate)
    .sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'th'));
  const visibleOrders = plannedForSelectedDate.filter((order) =>
    matchesPlanningQuery(order, drivers, query),
  );
  const selectedOrderSet = new Set(selectedOrderIds);
  const selectedOrders = visibleOrders.filter((order) => selectedOrderSet.has(order.id));
  const selectedOrderSnapshot = selectedOrders
    .map(
      (order) =>
        `${order.id}:${order.deliveryPlan?.plannedDate ?? ''}:${order.deliveryPlan?.plannedTime ?? ''}:${order.deliveryPlan?.plannedDriverId ?? ''}:${order.dispatchReadiness ?? 'ready'}:${order.deliveryPlan?.note ?? ''}`,
    )
    .join('|');
  const selectedPlannedOrders = selectedOrders.filter((order) => isUnreleasedPlannedOrder(order));
  const releasableSelectedOrders = selectedOrders.filter((order) =>
    canReleasePlannedOrder(order, selectedDate),
  );
  const assignedPlannedOrders = plannedForSelectedDate.filter(
    (order) => order.deliveryPlan?.plannedDriverId,
  );
  const unassignedPlannedOrders = plannedForSelectedDate.filter(
    (order) => !order.deliveryPlan?.plannedDriverId,
  );
  const awaitingItemsOrders = plannedForSelectedDate.filter(
    (order) => (order.dispatchReadiness ?? 'ready') === 'awaiting_items',
  );
  const onHoldOrders = plannedForSelectedDate.filter(
    (order) => (order.dispatchReadiness ?? 'ready') === 'on_hold',
  );
  const singleSelectedOrder = selectedOrders.length === 1 ? selectedOrders[0] : null;

  useEffect(() => {
    if (!focusedOrderId) return;
    const focusedOrder = orders.find(
      (order) => order.id === focusedOrderId && isUnreleasedPlannedOrder(order),
    );
    if (!focusedOrder?.deliveryPlan) return;
    setSelectedDate(focusedOrder.deliveryPlan.plannedDate);
    setSelectedOrderIds([focusedOrder.id]);
  }, [focusedOrderId, orders]);

  useEffect(() => {
    let cancelled = false;
    const refreshRoutes = () => {
      void fetchPlanningRoutes(selectedDate)
        .then((nextRoutes) => {
          if (!cancelled) setRoutes(nextRoutes);
        })
        .catch((error) => {
          if (!cancelled) {
            setOperationError(error instanceof Error ? error.message : String(error));
          }
        });
    };
    refreshRoutes();
    const intervalId = window.setInterval(refreshRoutes, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDate]);

  useEffect(() => {
    setPlanDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    // เก็บ draft คนขับ/ความพร้อม/หมายเหตุไว้เมื่อสลับแท็บวันที่
    // และ sync ฟอร์มใหม่เฉพาะเมื่อชุด order ที่เลือกหรือข้อมูล plan เปลี่ยนจริง
    if (selectedOrders.length === 0) return;

    const firstOrder = selectedOrders[0];
    const sharedDate = selectedOrders.every(
      (order) => order.deliveryPlan?.plannedDate === firstOrder.deliveryPlan?.plannedDate,
    )
      ? firstOrder.deliveryPlan?.plannedDate
      : undefined;
    const sharedTime = selectedOrders.every(
      (order) =>
        (order.deliveryPlan?.plannedTime ?? '') === (firstOrder.deliveryPlan?.plannedTime ?? ''),
    )
      ? (firstOrder.deliveryPlan?.plannedTime ?? '')
      : '';
    const sharedDriver = selectedOrders.every(
      (order) => order.deliveryPlan?.plannedDriverId === firstOrder.deliveryPlan?.plannedDriverId,
    )
      ? firstOrder.deliveryPlan?.plannedDriverId
      : undefined;
    const sharedReadiness = selectedOrders.every(
      (order) => (order.dispatchReadiness ?? 'ready') === (firstOrder.dispatchReadiness ?? 'ready'),
    )
      ? (firstOrder.dispatchReadiness ?? 'ready')
      : 'ready';
    const sharedNote = selectedOrders.every(
      (order) => (order.deliveryPlan?.note ?? '') === (firstOrder.deliveryPlan?.note ?? ''),
    )
      ? (firstOrder.deliveryPlan?.note ?? '')
      : '';

    setPlanDate(sharedDate ?? selectedDate);
    setPlanTime(sharedTime || getNextHourTime());
    setPlannedDriverId(sharedDriver ?? '');
    setReadiness(sharedReadiness);
    setPlanNote(sharedNote);
    // selectedOrderSnapshot intentionally captures the fields that drive this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderSnapshot]);

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
    );
  };

  const selectAllVisible = () => {
    setSelectedOrderIds(visibleOrders.map((order) => order.id));
  };

  const clearSelection = () => {
    setSelectedOrderIds([]);
    setPlanDate(selectedDate);
    setPlanTime(getNextHourTime());
    setPlannedDriverId('');
    setReadiness('ready');
    setPlanNote('');
  };

  const applyPlanning = async () => {
    if (selectedOrders.length === 0) return;
    setOperationState('saving');
    setOperationError('');
    try {
      await planOrders(
        selectedOrders.map((order) => order.id),
        {
          plannedDate: planDate,
          plannedTime: planTime || undefined,
          plannedDriverId: plannedDriverId || undefined,
          dispatchReadiness: readiness,
          note: planNote.trim() || undefined,
        },
      );
      setSelectedDate(planDate);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    } finally {
      setOperationState('idle');
    }
  };

  const confirmCancelSelectedPlans = async (reason: PlanningCancelReason, note?: string) => {
    if (selectedPlannedOrders.length === 0) return;
    setOperationState('saving');
    setOperationError('');
    try {
      await clearPlannedOrders(
        selectedPlannedOrders.map((order) => order.id),
        { reason, note },
      );
      setCancelPlansOpen(false);
      clearSelection();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    } finally {
      setOperationState('idle');
    }
  };

  const planningCancelReasons = (
    Object.keys(planningCancelReasonLabel) as PlanningCancelReason[]
  ).map((value) => ({ value, label: planningCancelReasonLabel[value] }));

  const publishGroups = async (targetOrders: Order[]) => {
    const groups = new Map<string, string[]>();
    targetOrders.forEach((order) => {
      const key = `${order.deliveryPlan?.plannedDate}:${order.deliveryPlan?.plannedDriverId}`;
      groups.set(key, [...(groups.get(key) ?? []), order.id]);
    });
    for (const orderIds of groups.values()) await releasePlannedOrders(orderIds);
    setRoutes(await fetchPlanningRoutes(selectedDate));
  };

  const releaseSelected = async () => {
    if (releasableSelectedOrders.length === 0) return;
    setOperationState('publishing');
    setOperationError('');
    try {
      await publishGroups(releasableSelectedOrders);
      clearSelection();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    } finally {
      setOperationState('idle');
    }
  };

  const releaseAllForSelectedDate = async () => {
    const releasable = plannedForSelectedDate.filter((order) =>
      canReleasePlannedOrder(order, selectedDate),
    );
    if (releasable.length === 0) return;
    setOperationState('publishing');
    setOperationError('');
    try {
      await publishGroups(releasable);
      clearSelection();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    } finally {
      setOperationState('idle');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning จัดส่งล่วงหน้า</h1>
          <p className="text-sm text-muted-foreground">
            จัดการเฉพาะงานที่ส่งมาวางแผนล่วงหน้า กำหนดวันส่ง คนขับ และความพร้อมสินค้า
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={selectedDate === todayDate ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(todayDate)}
          >
            วันนี้
          </Button>
          <Button
            variant={selectedDate === getTomorrowDateKey() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(getTomorrowDateKey())}
          >
            พรุ่งนี้
          </Button>
          <DatePicker value={selectedDate} onChange={setSelectedDate} className="w-[200px]" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px_380px]">
        <Card className="overflow-hidden xl:h-[calc(100vh-12rem)]">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-sm">รายการสำหรับวางแผน</CardTitle>
                  <CardDescription>
                    งานที่วางไว้วันที่ {formatPlanningDate(selectedDate)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{visibleOrders.length} รายการ</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllVisible}
                    disabled={visibleOrders.length === 0}
                  >
                    เลือกทั้งหมด
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={selectedOrderIds.length === 0}
                  >
                    ล้างที่เลือก
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหา order, ลูกค้า, ที่อยู่, คนขับตามแผน..."
                  className="h-10 rounded-xl pl-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 overflow-auto xl:h-[calc(100%-7.25rem)]">
            {visibleOrders.map((order) => (
              <PlanningOrderCard
                key={order.id}
                order={order}
                drivers={drivers}
                selected={selectedOrderSet.has(order.id)}
                onToggle={() => toggleOrderSelection(order.id)}
              />
            ))}
            {visibleOrders.length === 0 && (
              <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
                <CalendarClock className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" />
                ยังไม่มีงานในแผนวันนี้ — นำงานเข้ามาจากหน้า “จ่ายงานวันนี้”
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden xl:h-[calc(100vh-12rem)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ภาระงานคนขับของวัน</CardTitle>
            <CardDescription>กดเลือกคนขับเพื่อใส่ลงฟอร์มแผนด้านขวา</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 overflow-auto xl:h-[calc(100%-4.75rem)]">
            {drivers.map((driver) => (
              <DriverPlanningCard
                key={driver.id}
                driver={driver}
                plannedLoad={getPlannedLoadCount(orders, driver.id, selectedDate)}
                selected={plannedDriverId === driver.id}
                selectedDate={selectedDate}
                onSelect={() =>
                  setPlannedDriverId((current) => (current === driver.id ? '' : driver.id))
                }
              />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4 overflow-auto xl:h-[calc(100vh-12rem)]">
          <PlanSettingsCard
            drivers={drivers}
            selectedCount={selectedOrders.length}
            planDate={planDate}
            onPlanDate={setPlanDate}
            planTime={planTime}
            onPlanTime={setPlanTime}
            plannedDriverId={plannedDriverId}
            onPlannedDriverId={setPlannedDriverId}
            readiness={readiness}
            onReadiness={setReadiness}
            planNote={planNote}
            onPlanNote={setPlanNote}
            onApply={() => void applyPlanning()}
            onCancelPlans={() => setCancelPlansOpen(true)}
            cancelDisabled={selectedPlannedOrders.length === 0}
          />

          <DaySummaryCard
            selectedDate={selectedDate}
            isToday={selectedDate === todayDate}
            plannedCount={plannedForSelectedDate.length}
            assignedCount={assignedPlannedOrders.length}
            unassignedCount={unassignedPlannedOrders.length}
            awaitingItemsCount={awaitingItemsOrders.length}
            onHoldCount={onHoldOrders.length}
            onReleaseSelected={() => void releaseSelected()}
            releaseSelectedDisabled={
              operationState !== 'idle' || releasableSelectedOrders.length === 0
            }
            onReleaseAll={() => void releaseAllForSelectedDate()}
            releaseAllDisabled={
              operationState !== 'idle' ||
              !plannedForSelectedDate.some((order) => canReleasePlannedOrder(order, selectedDate))
            }
          />

          {operationError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {operationError}
            </div>
          )}

          <PublishedRoutesCard
            routes={routes}
            onRetry={(routeId) => {
              void retryPlanningRoutePush(routeId)
                .then((updated) =>
                  setRoutes((current) =>
                    current.map((route) => (route.id === updated.id ? updated : route)),
                  ),
                )
                .catch((error) =>
                  setOperationError(error instanceof Error ? error.message : String(error)),
                );
            }}
          />

          {singleSelectedOrder ? (
            <OrderTimeline
              order={singleSelectedOrder}
              description="กิจกรรมล่าสุดของ order ที่เลือก"
              compact
              title="Timeline"
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">สถานะการเลือก</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  เลือกอยู่ {selectedOrders.length} รายการ
                </div>
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  ปล่อยเข้าคิวได้ตอนนี้{' '}
                  {
                    plannedForSelectedDate.filter((order) =>
                      canReleasePlannedOrder(order, selectedDate),
                    ).length
                  }{' '}
                  รายการ
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  รอสินค้า/พักไว้ {awaitingItemsOrders.length + onHoldOrders.length} รายการ
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ResolutionDialog
        open={cancelPlansOpen}
        title="ยกเลิกงานที่เลือก"
        description={`คืน ${selectedPlannedOrders.length} งานออกจากแผน (ยังไม่ Publish)`}
        reasons={planningCancelReasons}
        notePlaceholder="เช่น ลูกค้าแจ้งเลื่อน / รอผลิต lot ใหม่"
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => setCancelPlansOpen(false)}
        onConfirm={({ reason, note }) => void confirmCancelSelectedPlans(reason, note)}
      />
    </div>
  );
}
