import { useEffect, useMemo, useState } from 'react';
import { Ban, CalendarClock, CheckCircle2, FileSpreadsheet, Search, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { LineOrderSource } from '@/components/LineOrderSource';
import {
  DriverCard,
  EmptyState,
  OrderSummary,
} from '@/components/delivery/DeliveryExecutionShared';
import { UrgentDispatchDialog } from '@/features/queue/components/UrgentDispatchDialog';
import {
  dispatchReadinessLabel,
  formatTHB,
  planningCancelReasonLabel,
  type DispatchReadiness,
  type Order,
  type PlanningCancelReason,
} from '@/data/orderTypes';
import {
  canReleasePlannedOrder,
  canPlanOrder,
  formatPlanningDateTime,
  getNextHourTime,
  getTodayDateKey,
  isUnreleasedPlannedOrder,
} from '@/lib/deliveryPlanning';
import { recommendDriverForOrder } from '@/lib/deliveryExecution';
import { buildInboxOrderEditSearch, hasCsvImportSource } from '@/lib/orderSourceLink';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';

type ManageMode = 'immediate' | 'planning';
type ManageFilter = 'all' | 'unplanned' | 'planned';

type FocusRequest = {
  orderId?: string;
  mode?: ManageMode;
  key: number;
};

type Props = {
  initialOrderId?: string;
  initialMode?: ManageMode;
  focusRequest: FocusRequest;
  canImmediate: boolean;
  canPlanning: boolean;
  onOpenInbox: (search?: string) => void;
  onOpenTracking: (search?: string) => void;
  onChanged: () => void;
};

const planningCancelReasons = (
  Object.keys(planningCancelReasonLabel) as PlanningCancelReason[]
).map((value) => ({ value, label: planningCancelReasonLabel[value] }));

function orderStatusBadge(order: Order) {
  if (isUnreleasedPlannedOrder(order)) {
    return {
      label: order.deliveryPlan
        ? formatPlanningDateTime(order.deliveryPlan.plannedDate, order.deliveryPlan.plannedTime)
        : 'วางแผนแล้ว',
      variant: 'info' as const,
    };
  }
  return { label: 'รอตัดสินใจ', variant: 'secondary' as const };
}

export function DeliveryManage({
  initialOrderId,
  initialMode,
  focusRequest,
  canImmediate,
  canPlanning,
  onOpenInbox,
  onOpenTracking,
  onChanged,
}: Props) {
  const {
    orders,
    drivers,
    planOrders,
    clearPlannedOrders,
    releasePlannedOrders,
    publishUrgentRoute,
  } = useRetailStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ManageFilter>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId ?? null);
  const [mode, setMode] = useState<ManageMode>(
    initialMode ?? (canImmediate ? 'immediate' : 'planning'),
  );
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [planDate, setPlanDate] = useState(getTodayDateKey());
  const [planTime, setPlanTime] = useState(getNextHourTime());
  const [planDriverId, setPlanDriverId] = useState('');
  const [readiness, setReadiness] = useState<DispatchReadiness>('ready');
  const [planNote, setPlanNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [urgentOpen, setUrgentOpen] = useState(false);
  const [urgentLoading, setUrgentLoading] = useState(false);
  const [urgentError, setUrgentError] = useState('');
  const [cancelPlanOpen, setCancelPlanOpen] = useState(false);

  const manageableOrders = useMemo(
    () =>
      orders
        .filter(canPlanOrder)
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    [orders],
  );
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('th');
    return manageableOrders.filter((order) => {
      if (filter === 'unplanned' && isUnreleasedPlannedOrder(order)) return false;
      if (filter === 'planned' && !isUnreleasedPlannedOrder(order)) return false;
      if (!normalized) return true;
      return [
        order.orderNo,
        order.code,
        order.customer.name,
        order.customer.phone,
        order.customer.address,
      ].some((value) => value?.toLocaleLowerCase('th').includes(normalized));
    });
  }, [filter, manageableOrders, query]);
  const selectedOrder = manageableOrders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedDrivers = selectedDriverIds
    .map((id) => drivers.find((driver) => driver.id === id))
    .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver));
  const plannedCount = manageableOrders.filter(isUnreleasedPlannedOrder).length;
  const unplannedCount = manageableOrders.length - plannedCount;

  useEffect(() => {
    const requestedId = focusRequest.orderId ?? initialOrderId;
    if (requestedId && manageableOrders.some((order) => order.id === requestedId)) {
      setSelectedOrderId(requestedId);
    }
    const requestedMode = focusRequest.mode ?? initialMode;
    if (requestedMode === 'immediate' && canImmediate) setMode('immediate');
    if (requestedMode === 'planning' && canPlanning) setMode('planning');
  }, [canImmediate, canPlanning, focusRequest, initialMode, initialOrderId, manageableOrders]);

  useEffect(() => {
    if (mode === 'immediate' && !canImmediate && canPlanning) setMode('planning');
    if (mode === 'planning' && !canPlanning && canImmediate) setMode('immediate');
  }, [canImmediate, canPlanning, mode]);

  useEffect(() => {
    if (selectedOrderId && manageableOrders.some((order) => order.id === selectedOrderId)) return;
    setSelectedOrderId(filteredOrders[0]?.id ?? manageableOrders[0]?.id ?? null);
  }, [filteredOrders, manageableOrders, selectedOrderId]);

  useEffect(() => {
    if (!selectedOrder) {
      setSelectedDriverIds([]);
      return;
    }

    const plan = selectedOrder.deliveryPlan;
    if (isUnreleasedPlannedOrder(selectedOrder) && plan) {
      if (canPlanning) setMode('planning');
      setPlanDate(plan.plannedDate);
      setPlanTime(plan.plannedTime ?? getNextHourTime());
      setPlanDriverId(plan.plannedDriverId ?? '');
      setReadiness(selectedOrder.dispatchReadiness ?? 'ready');
      setPlanNote(plan.note ?? '');
    } else {
      setPlanDate(getTodayDateKey());
      setPlanTime(getNextHourTime());
      setPlanDriverId('');
      setReadiness(selectedOrder.dispatchReadiness ?? 'ready');
      setPlanNote('');
    }

    const recommended = recommendDriverForOrder(selectedOrder, drivers);
    setSelectedDriverIds(recommended ? [recommended.id] : []);
  }, [canPlanning, drivers, selectedOrder]);

  const toggleDriver = (driverId: string) => {
    setSelectedDriverIds((current) =>
      current.includes(driverId) ? current.filter((id) => id !== driverId) : [...current, driverId],
    );
  };

  const savePlan = async () => {
    if (!selectedOrder) return;
    if (!planTime) {
      toast.error('กรุณาระบุเวลาออกก่อนบันทึกแผน');
      return;
    }
    setSaving(true);
    try {
      await planOrders([selectedOrder.id], {
        plannedDate: planDate,
        plannedTime: planTime,
        plannedDriverId: planDriverId || undefined,
        dispatchReadiness: readiness,
        note: planNote.trim() || undefined,
      });
      toast.success(`บันทึกแผน ${selectedOrder.orderNo} แล้ว`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกแผนไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const releasePlan = async () => {
    if (!selectedOrder) return;
    setSaving(true);
    try {
      await releasePlannedOrders([selectedOrder.id]);
      toast.success(`ปล่อยรอบส่ง ${selectedOrder.orderNo} ให้ Messenger แล้ว`);
      onChanged();
      onOpenTracking(`?tab=awaiting_acceptance&order=${encodeURIComponent(selectedOrder.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ปล่อยรอบส่งไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const confirmUrgent = async (input: { note?: string; driverIds: string[] }) => {
    if (!selectedOrder || input.driverIds.length === 0) return;
    setUrgentLoading(true);
    setUrgentError('');
    try {
      await publishUrgentRoute(selectedOrder.id, {
        driverCode: input.driverIds[0],
        coDriverCodes: input.driverIds.slice(1),
        note: input.note,
        forceNow: true,
      });
      toast.success(`ส่งงานทันที ${selectedOrder.orderNo} ให้ Messenger แล้ว`);
      setUrgentOpen(false);
      onChanged();
      onOpenTracking(`?tab=awaiting_acceptance&order=${encodeURIComponent(selectedOrder.id)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUrgentError(message);
      toast.error(`ส่งงานทันทีไม่สำเร็จ — ${message}`);
    } finally {
      setUrgentLoading(false);
    }
  };

  const canRelease = Boolean(
    selectedOrder?.deliveryPlan &&
    canReleasePlannedOrder(selectedOrder, selectedOrder.deliveryPlan.plannedDate),
  );
  const canUrgent =
    selectedOrder != null &&
    (selectedOrder.dispatchReadiness ?? 'ready') === 'ready' &&
    selectedDrivers.length > 0 &&
    selectedDrivers.length === selectedDriverIds.length &&
    selectedDrivers.every((driver) => driver.status !== 'off_duty');

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">รอตัดสินใจ</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{unplannedCount}</div>
            <div className="text-xs text-muted-foreground">เลือกส่งทันทีหรือวางแผน</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">วางแผนแล้ว</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{plannedCount}</div>
            <div className="text-xs text-muted-foreground">รอบที่ยังไม่ปล่อยให้ Messenger</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Messenger ว่าง</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
              {drivers.filter((driver) => driver.status === 'available').length}
            </div>
            <div className="text-xs text-muted-foreground">พร้อมรับงานใหม่</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_400px]">
        <Card className="overflow-hidden xl:flex xl:h-[calc(100vh-14rem)] xl:flex-col">
          <CardHeader className="pb-3 xl:shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">งานพร้อมจัดส่ง</CardTitle>
                  <CardDescription>ข้อมูลจาก LINE ที่อนุมัติและเลือกคนขับภายในแล้ว</CardDescription>
                </div>
                <Badge variant="secondary">{filteredOrders.length} งาน</Badge>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหา order, ลูกค้า, เบอร์โทร, ที่อยู่..."
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={filter === 'all' ? 'default' : 'outline'}
                  onClick={() => setFilter('all')}
                >
                  ทั้งหมด {manageableOrders.length}
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'unplanned' ? 'default' : 'outline'}
                  onClick={() => setFilter('unplanned')}
                >
                  รอตัดสินใจ {unplannedCount}
                </Button>
                <Button
                  size="sm"
                  variant={filter === 'planned' ? 'default' : 'outline'}
                  onClick={() => setFilter('planned')}
                >
                  วางแผนแล้ว {plannedCount}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="app-scroll space-y-2 xl:min-h-0 xl:flex-1 xl:overflow-auto">
            {filteredOrders.map((order) => {
              const status = orderStatusBadge(order);
              const selected = order.id === selectedOrderId;
              return (
                <button
                  key={order.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedOrderId(order.id)}
                  className={cn(
                    'w-full rounded-xl border p-4 text-left transition-all',
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'bg-card hover:border-primary/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium">{order.orderNo}</span>
                        <Badge variant={status.variant} className="h-5 px-1.5 text-[10px]">
                          {status.label}
                        </Badge>
                        {hasCsvImportSource(order) && (
                          <Badge variant="warning" className="h-5 gap-1 px-1.5 text-[10px]">
                            <FileSpreadsheet className="h-3 w-3" /> CSV
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
                      <LineOrderSource order={order} className="mt-1" />
                    </div>
                    <span className="shrink-0 text-xs font-medium text-warning">
                      {formatTHB(order.totalValue)}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                    <span className="truncate">{order.customer.address}</span>
                    <span className="truncate sm:text-right">
                      {order.items.map((item) => `${item.name} × ${item.qty}`).join(', ')}
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredOrders.length === 0 && <EmptyState />}
          </CardContent>
        </Card>

        <div className="app-scroll space-y-4 xl:h-[calc(100vh-14rem)] xl:overflow-auto">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">สร้างงานจัดส่ง</CardTitle>
                  <CardDescription>
                    {selectedOrder ? selectedOrder.orderNo : 'เลือก order จากรายการด้านซ้าย'}
                  </CardDescription>
                </div>
                {selectedOrder && <Badge variant="success">ข้อมูลครบ</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedOrder ? (
                <>
                  <OrderSummary order={selectedOrder} />
                  {hasCsvImportSource(selectedOrder) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => onOpenInbox(buildInboxOrderEditSearch(selectedOrder))}
                    >
                      <FileSpreadsheet className="h-4 w-4" /> แก้ไขข้อมูลจาก CSV
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/40 p-1">
                    <Button
                      type="button"
                      variant={mode === 'immediate' ? 'default' : 'ghost'}
                      disabled={!canImmediate}
                      onClick={() => setMode('immediate')}
                    >
                      <Zap className="h-4 w-4" /> ส่งทันที
                    </Button>
                    <Button
                      type="button"
                      variant={mode === 'planning' ? 'default' : 'ghost'}
                      disabled={!canPlanning}
                      onClick={() => setMode('planning')}
                    >
                      <CalendarClock className="h-4 w-4" /> วางแผน
                    </Button>
                  </div>

                  {mode === 'immediate' ? (
                    <div className="space-y-3">
                      <div>
                        <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                          Messenger · เลือกหลายคนได้สำหรับงานส่งร่วม
                        </div>
                        <div className="space-y-2">
                          {drivers.map((driver) => {
                            const rank = selectedDriverIds.indexOf(driver.id);
                            return (
                              <DriverCard
                                key={driver.id}
                                driver={driver}
                                selected={rank !== -1}
                                coRole={
                                  rank === -1 ? undefined : rank === 0 ? 'primary' : 'secondary'
                                }
                                onSelect={() => toggleDriver(driver.id)}
                                orders={orders}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!canUrgent}
                        onClick={() => setUrgentOpen(true)}
                      >
                        <Send className="h-4 w-4" /> สร้าง Route และส่งงาน
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-2">
                          <label className="text-[11px] font-medium text-muted-foreground">
                            วันจัดส่ง
                          </label>
                          <DatePicker value={planDate} onChange={setPlanDate} className="w-full" />
                        </div>
                        <div className="grid gap-2">
                          <label
                            htmlFor="workspace-plan-time"
                            className="text-[11px] font-medium text-muted-foreground"
                          >
                            เวลาออก
                          </label>
                          <Input
                            id="workspace-plan-time"
                            type="time"
                            value={planTime}
                            onChange={(event) => setPlanTime(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <label
                          htmlFor="workspace-plan-driver"
                          className="text-[11px] font-medium text-muted-foreground"
                        >
                          Messenger
                        </label>
                        <Select
                          id="workspace-plan-driver"
                          value={planDriverId}
                          onChange={(event) => setPlanDriverId(event.target.value)}
                        >
                          <option value="">ยังไม่เลือก — จัดภายหลัง</option>
                          {drivers.map((driver) => (
                            <option
                              key={driver.id}
                              value={driver.id}
                              disabled={driver.status === 'off_duty'}
                            >
                              {driver.name} ·{' '}
                              {driver.status === 'available'
                                ? 'ว่าง'
                                : driver.status === 'off_duty'
                                  ? 'หยุด'
                                  : 'กำลังส่ง'}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <label
                          htmlFor="workspace-readiness"
                          className="text-[11px] font-medium text-muted-foreground"
                        >
                          ความพร้อมสินค้า
                        </label>
                        <Select
                          id="workspace-readiness"
                          value={readiness}
                          onChange={(event) =>
                            setReadiness(event.target.value as DispatchReadiness)
                          }
                        >
                          <option value="ready">{dispatchReadinessLabel.ready}</option>
                          <option value="awaiting_items">
                            {dispatchReadinessLabel.awaiting_items}
                          </option>
                          <option value="on_hold">{dispatchReadinessLabel.on_hold}</option>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <label
                          htmlFor="workspace-plan-note"
                          className="text-[11px] font-medium text-muted-foreground"
                        >
                          หมายเหตุแผน
                        </label>
                        <textarea
                          id="workspace-plan-note"
                          rows={3}
                          value={planNote}
                          onChange={(event) => setPlanNote(event.target.value)}
                          placeholder="เช่น นัดส่งพร้อมใบกำกับ"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button onClick={() => void savePlan()} disabled={saving}>
                          <CalendarClock className="h-4 w-4" />{' '}
                          {saving ? 'กำลังบันทึก…' : 'บันทึกแผน'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void releasePlan()}
                          disabled={saving || !canRelease}
                        >
                          <CheckCircle2 className="h-4 w-4" /> ปล่อยรอบส่ง
                        </Button>
                      </div>
                      {isUnreleasedPlannedOrder(selectedOrder) && (
                        <Button
                          variant="ghost"
                          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setCancelPlanOpen(true)}
                        >
                          <Ban className="h-4 w-4" /> ยกเลิกแผนของงานนี้
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  เลือก order ก่อนสร้างงานจัดส่ง
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <UrgentDispatchDialog
        open={urgentOpen}
        order={selectedOrder}
        drivers={selectedDrivers}
        orders={orders}
        loading={urgentLoading}
        error={urgentError}
        onCancel={() => {
          if (!urgentLoading) setUrgentOpen(false);
        }}
        onConfirm={(input) => void confirmUrgent(input)}
      />

      <ResolutionDialog
        open={cancelPlanOpen}
        title="ยกเลิกแผนจัดส่ง"
        description={selectedOrder ? `${selectedOrder.orderNo} — คืนงานไปรอตัดสินใจ` : undefined}
        reasons={planningCancelReasons}
        confirmLabel="ยืนยันยกเลิกแผน"
        confirmVariant="destructive"
        onCancel={() => setCancelPlanOpen(false)}
        onConfirm={({ reason, note }) => {
          if (!selectedOrder) return;
          void clearPlannedOrders([selectedOrder.id], { reason, note })
            .then(() => {
              toast.success(`ยกเลิกแผน ${selectedOrder.orderNo} แล้ว`);
              setCancelPlanOpen(false);
              onChanged();
            })
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : 'ยกเลิกแผนไม่สำเร็จ'),
            );
        }}
      />
    </>
  );
}
