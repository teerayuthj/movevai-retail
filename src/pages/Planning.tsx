import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { DriverAvatar } from '@/components/DriverAvatar';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Package,
  Route,
  Search,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  dispatchReadinessLabel,
  formatTHB,
  type DispatchReadiness,
  type Driver,
  type Order,
} from '@/data/mock';
import {
  canPlanOrder,
  canReleasePlannedOrder,
  formatPlanningDate,
  getPlannedLoadCount,
  getTodayDateKey,
  getTomorrowDateKey,
  isUnreleasedPlannedOrder,
} from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';

function getDefaultPlanningDate(orders: Order[]) {
  const activePlanDates = orders
    .filter((order) => isUnreleasedPlannedOrder(order))
    .map((order) => order.deliveryPlan?.plannedDate)
    .filter((value): value is string => Boolean(value))
    .sort();

  return activePlanDates[0] ?? getTomorrowDateKey();
}

function formatDriverStatus(driver: Driver) {
  if (driver.status === 'available') return { label: 'ว่าง', variant: 'success' as const };
  if (driver.status === 'on_delivery') return { label: 'กำลังส่ง', variant: 'muted' as const };
  return { label: 'หยุด', variant: 'warning' as const };
}

function matchesPlanningQuery(order: Order, drivers: Driver[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const plannedDriverName = order.deliveryPlan?.plannedDriverId
    ? (drivers.find((driver) => driver.id === order.deliveryPlan?.plannedDriverId)?.name ?? '')
    : '';

  return [
    order.code,
    order.customer.name,
    order.customer.phone,
    order.customer.address,
    plannedDriverName,
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function PlanningOrderCard({
  order,
  drivers,
  selected,
  onToggle,
}: {
  order: Order;
  drivers: Driver[];
  selected: boolean;
  onToggle: () => void;
}) {
  const plannedDriverName = order.deliveryPlan?.plannedDriverId
    ? drivers.find((driver) => driver.id === order.deliveryPlan?.plannedDriverId)?.name
    : undefined;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full rounded-xl border bg-card p-4 text-left transition-all',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.code}</span>
            {isUnreleasedPlannedOrder(order) ? (
              <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                {formatPlanningDate(order.deliveryPlan!.plannedDate)}
              </Badge>
            ) : (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                ยังไม่วางแผน
              </Badge>
            )}
            <Badge
              variant={order.dispatchReadiness === 'awaiting_items' ? 'warning' : 'success'}
              className="h-5 px-1.5 text-[10px]"
            >
              {dispatchReadinessLabel[order.dispatchReadiness ?? 'ready']}
            </Badge>
          </div>
          <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
        </div>
        <Badge variant={selected ? 'default' : 'outline'} className="shrink-0">
          {selected ? 'เลือกแล้ว' : `${order.items.length} รายการ`}
        </Badge>
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Package className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.customer.address}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {plannedDriverName ? `คนขับตามแผน: ${plannedDriverName}` : 'ยังไม่เลือกคนขับ'}
          </span>
          <span className="font-medium text-amber-800">{formatTHB(order.totalValue)}</span>
        </div>
      </div>
    </button>
  );
}

function DriverPlanningCard({
  driver,
  plannedLoad,
  selected,
  selectedDate,
  onSelect,
}: {
  driver: Driver;
  plannedLoad: number;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
}) {
  const status = formatDriverStatus(driver);
  const capacityOverflow = plannedLoad > driver.capacity;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-all',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{driver.name}</span>
            <Badge variant={status.variant} className="h-5 px-1.5 text-[10px]">
              {status.label}
            </Badge>
            {driver.status === 'off_duty' && (
              <Badge variant="warning" className="h-5 gap-1 px-1.5 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                Off duty
              </Badge>
            )}
            {capacityOverflow && (
              <Badge variant="warning" className="h-5 gap-1 px-1.5 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                เกิน capacity
              </Badge>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{driver.zone}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-muted-foreground">
            แผนวันที่ {formatPlanningDate(selectedDate)}
          </span>
          <span className="font-semibold tabular-nums">
            {plannedLoad}/{driver.capacity}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>งาน active วันนี้</span>
          <span className="font-medium tabular-nums">{driver.activeOrders}</span>
        </div>
      </div>
    </button>
  );
}

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
        <Card className="h-[calc(100vh-12rem)] overflow-hidden">
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
          <CardContent className="h-[calc(100%-7.25rem)] space-y-3 overflow-auto">
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

        <Card className="h-[calc(100vh-12rem)] overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ภาระงานคนขับของวัน</CardTitle>
            <CardDescription>กดเลือกคนขับเพื่อใส่ลงฟอร์มแผนด้านขวา</CardDescription>
          </CardHeader>
          <CardContent className="h-[calc(100%-4.75rem)] space-y-3 overflow-auto">
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

        <div className="h-[calc(100vh-12rem)] overflow-auto space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">ตั้งค่าแผน</CardTitle>
              <CardDescription>
                {selectedOrders.length > 0
                  ? `กำลังแก้ไข ${selectedOrders.length} รายการ`
                  : 'เลือก order จากรายการด้านซ้ายก่อน'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <label className="text-[11px] font-medium text-muted-foreground">
                  วันจัดส่งตามแผน
                </label>
                <DatePicker value={planDate} onChange={setPlanDate} className="w-full" />
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-medium text-muted-foreground">คนขับตามแผน</label>
                <select
                  value={plannedDriverId}
                  onChange={(event) => setPlannedDriverId(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">ยังไม่เลือกคนขับ</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name} · {driver.zone}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-medium text-muted-foreground">
                  ความพร้อมสินค้า
                </label>
                <select
                  value={readiness}
                  onChange={(event) => setReadiness(event.target.value as DispatchReadiness)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="ready">{dispatchReadinessLabel.ready}</option>
                  <option value="awaiting_items">{dispatchReadinessLabel.awaiting_items}</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-medium text-muted-foreground">หมายเหตุแผน</label>
                <textarea
                  value={planNote}
                  onChange={(event) => setPlanNote(event.target.value)}
                  rows={3}
                  placeholder="เช่น รอทองครบ lot ช่วงบ่าย / นัดส่งพร้อมใบกำกับ"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={applyPlanning} disabled={selectedOrders.length === 0}>
                  <CalendarClock className="h-4 w-4" />
                  บันทึกแผน
                </Button>
                <Button
                  variant="outline"
                  onClick={clearSelectedPlans}
                  disabled={selectedPlannedOrders.length === 0}
                >
                  <XCircle className="h-4 w-4" />
                  ล้างแผนที่เลือก
                </Button>
              </div>

              {singleSelectedOrder && (
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                    ปรับความพร้อมสินค้าอย่างเร็ว
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={
                        (singleSelectedOrder.dispatchReadiness ?? 'ready') === 'ready'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() =>
                        setDispatchReadiness(singleSelectedOrder.id, 'ready', planNote || undefined)
                      }
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      พร้อมปล่อยงาน
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        (singleSelectedOrder.dispatchReadiness ?? 'ready') === 'awaiting_items'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() =>
                        setDispatchReadiness(
                          singleSelectedOrder.id,
                          'awaiting_items',
                          planNote || undefined,
                        )
                      }
                    >
                      <Clock3 className="h-4 w-4" />
                      รอสินค้ามาครบ
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                สรุปของวันที่ {formatPlanningDate(selectedDate)}
              </CardTitle>
              <CardDescription>
                ดู load ของวันนั้นและปล่อยงานเข้าคิวจริงเมื่อถึงวันปฏิบัติงาน
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">ตามแผนทั้งหมด</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {plannedForSelectedDate.length}
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">มีคนขับแล้ว</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {assignedPlannedOrders.length}
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">ยังไม่เลือกคนขับ</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {unassignedPlannedOrders.length}
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="text-[11px] text-muted-foreground">รอสินค้ามาครบ</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">
                    {awaitingItemsOrders.length}
                  </div>
                </div>
              </div>

              {awaitingItemsOrders.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  งานที่รอสินค้ามาครบยังปล่อยเข้าคิวได้ แต่ควรตรวจของก่อนปล่อยงานจริง
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={releaseSelected}
                  disabled={selectedDate !== todayDate || releasableSelectedOrders.length === 0}
                >
                  <Route className="h-4 w-4" />
                  ปล่อยที่เลือกเข้าคิว
                </Button>
                <Button
                  variant="outline"
                  onClick={releaseAllForSelectedDate}
                  disabled={selectedDate !== todayDate || plannedForSelectedDate.length === 0}
                >
                  <Truck className="h-4 w-4" />
                  ปล่อยทั้งหมดของวันนี้
                </Button>
              </div>

              <div className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
                {selectedDate === todayDate
                  ? 'วันนี้สามารถปล่อยแผนเข้าคิวจริงได้'
                  : `จะปล่อยเข้าคิวได้เมื่อถึงวันที่ ${formatPlanningDate(selectedDate)}`}
              </div>
            </CardContent>
          </Card>

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
