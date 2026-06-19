import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { OrderTimeline } from '@/components/OrderTimeline';
import { AlertTriangle, CalendarClock, Route, Search, Users } from 'lucide-react';
import { type DispatchReadiness } from '@/data/mock';
import {
  canPlanOrder,
  canReleasePlannedOrder,
  formatPlanningDate,
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

export function PlanningPage() {
  const {
    orders,
    drivers,
    planOrders,
    clearPlannedOrders,
    releasePlannedOrders,
    setDispatchReadiness,
  } = useRetailStore();
  const [selectedDate, setSelectedDate] = useState(() => getDefaultPlanningDate(orders));
  const [query, setQuery] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [planDate, setPlanDate] = useState(() => getDefaultPlanningDate(orders));
  const [plannedDriverId, setPlannedDriverId] = useState('');
  const [readiness, setReadiness] = useState<DispatchReadiness>('ready');
  const [planNote, setPlanNote] = useState('');

  const todayDate = getTodayDateKey();
  const planningEligibleOrders = orders.filter((order) => canPlanOrder(order));
  const plannedOrders = planningEligibleOrders.filter((order) => isUnreleasedPlannedOrder(order));
  const plannedForSelectedDate = plannedOrders
    .filter((order) => order.deliveryPlan?.plannedDate === selectedDate)
    .sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'th'));
  const unplannedOrders = planningEligibleOrders
    .filter((order) => !isUnreleasedPlannedOrder(order))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const visibleOrders = [...plannedForSelectedDate, ...unplannedOrders].filter((order) =>
    matchesPlanningQuery(order, drivers, query),
  );
  const selectedOrderSet = new Set(selectedOrderIds);
  const selectedOrders = visibleOrders.filter((order) => selectedOrderSet.has(order.id));
  const selectedOrderSnapshot = selectedOrders
    .map(
      (order) =>
        `${order.id}:${order.deliveryPlan?.plannedDate ?? ''}:${order.deliveryPlan?.plannedDriverId ?? ''}:${order.dispatchReadiness ?? 'ready'}:${order.deliveryPlan?.note ?? ''}`,
    )
    .join('|');
  const selectedPlannedOrders = selectedOrders.filter((order) => isUnreleasedPlannedOrder(order));
  const releasableSelectedOrders = selectedOrders.filter((order) =>
    canReleasePlannedOrder(order, todayDate),
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
  const singleSelectedOrder = selectedOrders.length === 1 ? selectedOrders[0] : null;

  useEffect(() => {
    setSelectedOrderIds((current) => {
      const next = current.filter((id) => visibleOrders.some((order) => order.id === id));
      if (next.length === current.length) return current;
      return next;
    });
  }, [visibleOrders]);

  useEffect(() => {
    if (selectedOrders.length === 0) {
      setPlanDate(selectedDate);
      setPlannedDriverId('');
      setReadiness('ready');
      setPlanNote('');
      return;
    }

    const firstOrder = selectedOrders[0];
    const sharedDate = selectedOrders.every(
      (order) => order.deliveryPlan?.plannedDate === firstOrder.deliveryPlan?.plannedDate,
    )
      ? firstOrder.deliveryPlan?.plannedDate
      : undefined;
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
    setPlannedDriverId(sharedDriver ?? '');
    setReadiness(sharedReadiness);
    setPlanNote(sharedNote);
  }, [selectedDate, selectedOrderSnapshot]);

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
  };

  const applyPlanning = () => {
    if (selectedOrders.length === 0) return;
    planOrders(
      selectedOrders.map((order) => order.id),
      {
        plannedDate: planDate,
        plannedDriverId: plannedDriverId || undefined,
        dispatchReadiness: readiness,
        note: planNote.trim() || undefined,
      },
    );
    setSelectedDate(planDate);
  };

  const clearSelectedPlans = () => {
    if (selectedPlannedOrders.length === 0) return;
    clearPlannedOrders(selectedPlannedOrders.map((order) => order.id));
  };

  const releaseSelected = () => {
    if (releasableSelectedOrders.length === 0) return;
    releasePlannedOrders(releasableSelectedOrders.map((order) => order.id));
    clearSelection();
  };

  const releaseAllForSelectedDate = () => {
    if (selectedDate !== todayDate || plannedForSelectedDate.length === 0) return;
    releasePlannedOrders(plannedForSelectedDate.map((order) => order.id));
    clearSelection();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning จัดส่งล่วงหน้า</h1>
          <p className="text-sm text-muted-foreground">
            ใช้ order เดียวกับ Inbox และ Queue ในการวางแผนวันส่ง คนขับ และความพร้อมสินค้าล่วงหน้า
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
                    งานที่ยังไม่วางแผน + งานที่วางไว้วันที่ {formatPlanningDate(selectedDate)}
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
                ไม่มี order ที่พร้อมวางแผนในมุมมองนี้
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
            plannedDriverId={plannedDriverId}
            onPlannedDriverId={setPlannedDriverId}
            readiness={readiness}
            onReadiness={setReadiness}
            planNote={planNote}
            onPlanNote={setPlanNote}
            onApply={applyPlanning}
            onClearPlans={clearSelectedPlans}
            clearDisabled={selectedPlannedOrders.length === 0}
            singleSelectedOrder={singleSelectedOrder}
            onSetReadiness={setDispatchReadiness}
          />

          <DaySummaryCard
            selectedDate={selectedDate}
            isToday={selectedDate === todayDate}
            plannedCount={plannedForSelectedDate.length}
            assignedCount={assignedPlannedOrders.length}
            unassignedCount={unassignedPlannedOrders.length}
            awaitingItemsCount={awaitingItemsOrders.length}
            onReleaseSelected={releaseSelected}
            releaseSelectedDisabled={
              selectedDate !== todayDate || releasableSelectedOrders.length === 0
            }
            onReleaseAll={releaseAllForSelectedDate}
            releaseAllDisabled={selectedDate !== todayDate || plannedForSelectedDate.length === 0}
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
                  {selectedDate === todayDate ? plannedForSelectedDate.length : 0} รายการ
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  รอสินค้ามาครบ {awaitingItemsOrders.length} รายการ
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
