import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Repeat2,
  Search,
  ShoppingBag,
  Timer,
  Truck,
  UserRound,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Order } from '@/data/orderTypes';
import { statusLabel } from '@/data/orderTypes';
import { QuickCreateDialog } from '@/features/dispatch/components/QuickCreateDialog';
import { createTemplateRun } from '@/features/dispatch/dispatchJobs';
import {
  loadRouteTemplates,
  markTemplateGenerated,
} from '@/features/dispatch/routeTemplateStorage';
import {
  dispatchJobTypeLabel,
  getDispatchJobTitle,
  getDispatchJobType,
  getPickup,
} from '@/features/dispatch/types';
import { getTodayDateKey, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';

type BoardFilter = 'action' | 'ready' | 'waiting' | 'active' | 'all';

type Props = {
  locationSearch?: string;
  onOpenPlanning: (search?: string) => void;
  onOpenTracking: (search?: string) => void;
};

const JOB_ICONS = {
  order: ShoppingBag,
  document: FileText,
  parcel: Package,
  other: Truck,
};

function routeAcceptanceState(order: Order) {
  const route = order.deliveryRoute;
  if (order.status !== 'assigned') return null;
  if (!route?.requiresAcceptance) return 'ready_to_start' as const;
  return route.acceptedAt ? ('accepted' as const) : ('waiting_acceptance' as const);
}

function boardStatus(order: Order) {
  if (order.status === 'ready') {
    return isUnreleasedPlannedOrder(order) ? 'planning' : 'ready';
  }
  const acceptance = routeAcceptanceState(order);
  if (acceptance) return acceptance;
  if (order.status === 'in_transit') return 'active';
  if (order.status === 'pending_confirmation') return 'review';
  if (order.status === 'delivered') return 'done';
  return 'other';
}

function boardStatusLabel(order: Order) {
  const state = boardStatus(order);
  if (state === 'ready') return 'รอจัดคนขับ';
  if (state === 'planning') return 'อยู่ใน Planning';
  if (state === 'waiting_acceptance') return 'รอคนขับรับ';
  if (state === 'accepted') return 'รับงานแล้ว · รอเริ่ม';
  if (state === 'ready_to_start') return 'พร้อมเริ่มงาน';
  if (state === 'active') return 'กำลังวิ่ง';
  if (state === 'review') return 'รอตรวจหลักฐาน';
  return statusLabel[order.status];
}

function countdown(iso: string | undefined, nowMs: number) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - nowMs;
  if (Number.isNaN(diff)) return null;
  const minutes = Math.max(0, Math.ceil(Math.abs(diff) / 60_000));
  return diff >= 0 ? `เหลือ ${minutes} นาที` : `เกิน ${minutes} นาที`;
}

function todayWeekday() {
  return new Date(`${getTodayDateKey()}T12:00:00+07:00`).getDay();
}

export function DispatchBoard({ locationSearch, onOpenPlanning, onOpenTracking }: Props) {
  const { orders, drivers, publishUrgentRoute, syncFromBackend } = useRetailStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BoardFilter>('action');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [initialTemplateId, setInitialTemplateId] = useState<string>();
  const [dispatchDriverId, setDispatchDriverId] = useState('');
  const [acceptMinutes, setAcceptMinutes] = useState(15);
  const [startMinutes, setStartMinutes] = useState(10);
  const [startPolicy, setStartPolicy] = useState<'manual' | 'accept_starts'>('manual');
  const [dispatching, setDispatching] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const generatedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch ?? '');
    if (params.get('quick') === '1') setQuickCreateOpen(true);
    setInitialTemplateId(params.get('template') ?? undefined);
    const orderId = params.get('order');
    if (orderId) setSelectedId(orderId);
  }, [locationSearch]);

  useEffect(() => {
    if (generatedRef.current || drivers.length === 0) return;
    generatedRef.current = true;
    const today = getTodayDateKey();
    const weekday = todayWeekday();
    const due = loadRouteTemplates().filter(
      (template) =>
        template.active &&
        template.autoCreate &&
        template.weekdays.includes(weekday) &&
        !template.generatedDateKeys?.includes(today),
    );
    if (due.length === 0) return;
    void (async () => {
      let created = 0;
      for (const template of due) {
        try {
          const driver = drivers.find((item) => item.id === template.defaultDriverId);
          await createTemplateRun(template, driver);
          markTemplateGenerated(template.id, today);
          created += 1;
        } catch (error) {
          toast.error(
            `สร้างรอบ ${template.name} ไม่สำเร็จ — ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (created > 0) {
        await syncFromBackend();
        toast.success(`สร้าง Route Run ประจำวันนี้ ${created} รอบเข้า Planning แล้ว`);
      }
    })();
  }, [drivers, syncFromBackend]);

  const workflowOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            (order.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
            ['ready', 'assigned', 'in_transit', 'pending_confirmation', 'delivered'].includes(
              order.status,
            ),
        )
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()),
    [orders],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workflowOrders.filter((order) => {
      const state = boardStatus(order);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'action' &&
          ['ready', 'waiting_acceptance', 'accepted', 'ready_to_start'].includes(state)) ||
        (filter === 'ready' && ['ready', 'planning'].includes(state)) ||
        (filter === 'waiting' &&
          ['waiting_acceptance', 'accepted', 'ready_to_start'].includes(state)) ||
        (filter === 'active' && ['active', 'review'].includes(state));
      if (!matchesFilter) return false;
      if (!normalized) return true;
      return [
        order.orderNo,
        order.code,
        getDispatchJobTitle(order),
        order.customer.name,
        order.customer.address,
        order.assignedDriverName,
        order.metadataJson?.dispatch?.routeTemplateName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized);
    });
  }, [filter, query, workflowOrders]);

  useEffect(() => {
    if (!selectedId || !workflowOrders.some((order) => order.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? workflowOrders[0]?.id ?? null);
    }
  }, [filtered, selectedId, workflowOrders]);

  const selected = workflowOrders.find((order) => order.id === selectedId) ?? null;
  const selectedDriver = drivers.find((driver) => driver.id === dispatchDriverId);
  const counts = {
    ready: workflowOrders.filter((order) => ['ready', 'planning'].includes(boardStatus(order)))
      .length,
    waiting: workflowOrders.filter((order) =>
      ['waiting_acceptance', 'accepted', 'ready_to_start'].includes(boardStatus(order)),
    ).length,
    active: workflowOrders.filter((order) => ['active', 'review'].includes(boardStatus(order)))
      .length,
  };

  const dispatchSelected = async () => {
    if (!selected || selected.status !== 'ready' || !selectedDriver) return;
    setDispatching(true);
    try {
      await publishUrgentRoute(selected.id, {
        driverCode: selectedDriver.id,
        acceptWithinMinutes: acceptMinutes,
        startWithinMinutes: startMinutes,
        startPolicy,
      });
      toast.success(`ส่งงานให้ ${selectedDriver.name} แล้ว — รอ Messenger รับงาน`);
      setDispatchDriverId('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ส่งงานไม่สำเร็จ');
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch Board — งานรับส่ง</h1>
          <p className="text-sm text-muted-foreground">
            รวมงานที่พร้อมดำเนินการจาก Intake, Quick Create และ Route ประจำ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onOpenPlanning()}>
            <CalendarClock className="h-4 w-4" /> เปิด Planning
          </Button>
          <Button
            onClick={() => {
              setInitialTemplateId(undefined);
              setQuickCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> สร้างงานด่วน
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">รอจัดคนขับ / Planning</div>
          <div className="mt-1 text-2xl font-semibold">{counts.ready}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">รอรับ / รอเริ่มงาน</div>
          <div className="mt-1 text-2xl font-semibold">{counts.waiting}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">กำลังวิ่ง / รอตรวจ</div>
          <div className="mt-1 text-2xl font-semibold">{counts.active}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-xs font-medium">
          ค้นหางาน
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="เลขงาน จุดส่ง Route หรือคนขับ"
            />
          </div>
        </label>
        <Select
          value={filter}
          onChange={(event) => setFilter(event.target.value as BoardFilter)}
          containerClassName="w-48"
        >
          <option value="action">งานที่ต้องทำต่อ</option>
          <option value="ready">พร้อมส่ง / Planning</option>
          <option value="waiting">รอรับ / รอเริ่ม</option>
          <option value="active">กำลังดำเนินการ</option>
          <option value="all">ทั้งหมด</option>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => void syncFromBackend()}
          aria-label="รีเฟรช"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold">งานตามสิ่งที่ต้องทำต่อ</h2>
            <Badge variant="secondary">{filtered.length}</Badge>
          </div>
          <div className="app-scroll max-h-[calc(100vh-19rem)] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                ไม่พบงานในตัวกรองนี้
              </div>
            ) : (
              filtered.map((order) => {
                const jobType = getDispatchJobType(order);
                const Icon = JOB_ICONS[jobType];
                const state = boardStatus(order);
                const due =
                  state === 'waiting_acceptance'
                    ? countdown(order.deliveryRoute?.acceptBy, nowMs)
                    : state === 'accepted'
                      ? countdown(order.deliveryRoute?.startBy, nowMs)
                      : null;
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className={cn(
                      'grid w-full grid-cols-[32px_1fr_auto] items-center gap-2 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40',
                      selectedId === order.id && 'bg-primary/5',
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {getDispatchJobTitle(order)}
                        </span>
                        {order.metadataJson?.dispatch?.routeTemplateId && (
                          <Badge variant="outline" className="gap-1">
                            <Repeat2 className="h-3 w-3" /> Route
                          </Badge>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {boardStatusLabel(order)}
                        {due ? ` · ${due}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="min-h-[420px] p-5">
          {!selected ? (
            <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
              เลือกงานเพื่อดูรายละเอียด
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{getDispatchJobTitle(selected)}</h2>
                    <Badge variant="outline">
                      {dispatchJobTypeLabel[getDispatchJobType(selected)]}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {selected.orderNo ?? selected.code}
                  </p>
                </div>
                <Badge
                  variant={
                    selected.status === 'in_transit'
                      ? 'info'
                      : selected.status === 'ready'
                        ? 'secondary'
                        : selected.status === 'assigned'
                          ? 'warning'
                          : 'outline'
                  }
                >
                  {boardStatusLabel(selected)}
                </Badge>
              </div>

              <div className="mt-5 space-y-4">
                {getPickup(selected) && (
                  <div className="flex gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">จุดรับ</div>
                      <div className="text-sm font-medium">{getPickup(selected)?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {getPickup(selected)?.address}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border">
                    <Truck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">จุดส่ง</div>
                    <div className="text-sm font-medium">{selected.customer.name}</div>
                    <div className="text-xs text-muted-foreground">{selected.customer.address}</div>
                  </div>
                </div>
              </div>

              {selected.assignedDriverId && (
                <div className="mt-5 grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">คนขับ</div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                      <UserRound className="h-4 w-4" />
                      {selected.assignedDriverName ?? selected.assignedDriverId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">SLA</div>
                    <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                      <Timer className="h-4 w-4" />
                      รับ {selected.deliveryRoute?.acceptWithinMinutes ?? 15} · เริ่ม{' '}
                      {selected.deliveryRoute?.startWithinMinutes ?? 10} นาที
                    </div>
                  </div>
                </div>
              )}

              {selected.status === 'ready' && !isUnreleasedPlannedOrder(selected) && (
                <div className="mt-5 border-t pt-4">
                  <h3 className="text-sm font-semibold">ส่งทันที</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium">
                      คนขับ
                      <Select
                        value={dispatchDriverId}
                        onChange={(event) => setDispatchDriverId(event.target.value)}
                        className="mt-1"
                      >
                        <option value="">เลือกคนขับ</option>
                        {drivers
                          .filter((driver) => driver.status !== 'off_duty')
                          .map((driver) => (
                            <option key={driver.id} value={driver.id}>
                              {driver.name} ·{' '}
                              {driver.status === 'available'
                                ? 'ว่าง'
                                : `${driver.activeOrders} งาน`}
                            </option>
                          ))}
                      </Select>
                    </label>
                    <label className="text-xs font-medium">
                      วิธีเริ่ม
                      <Select
                        value={startPolicy}
                        onChange={(event) =>
                          setStartPolicy(event.target.value as typeof startPolicy)
                        }
                        className="mt-1"
                      >
                        <option value="manual">รับ แล้วกดเริ่มเอง</option>
                        <option value="accept_starts">รับแล้วเริ่มทันที</option>
                      </Select>
                    </label>
                    <label className="text-xs font-medium">
                      รับภายใน
                      <Select
                        value={acceptMinutes}
                        onChange={(event) => setAcceptMinutes(Number(event.target.value))}
                        className="mt-1"
                      >
                        {[5, 10, 15, 30].map((value) => (
                          <option key={value} value={value}>
                            {value} นาที
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="text-xs font-medium">
                      เริ่มภายใน
                      <Select
                        value={startMinutes}
                        onChange={(event) => setStartMinutes(Number(event.target.value))}
                        className="mt-1"
                      >
                        {[5, 10, 15, 30].map((value) => (
                          <option key={value} value={value}>
                            {value} นาทีหลังรับ
                          </option>
                        ))}
                      </Select>
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => onOpenPlanning(`?order=${encodeURIComponent(selected.id)}`)}
                    >
                      <CalendarClock className="h-4 w-4" /> เข้า Planning
                    </Button>
                    <Button
                      disabled={!selectedDriver || dispatching}
                      onClick={() => void dispatchSelected()}
                    >
                      <Zap className="h-4 w-4" />
                      {dispatching ? 'กำลังส่งงาน…' : 'ส่งให้คนขับทันที'}
                    </Button>
                  </div>
                </div>
              )}

              {isUnreleasedPlannedOrder(selected) && (
                <div className="mt-5 rounded-xl border bg-info/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-info">
                    <CalendarClock className="h-4 w-4" /> งานอยู่ใน Planning
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.deliveryPlan?.plannedDate}{' '}
                    {selected.deliveryPlan?.plannedTime
                      ? `· ${selected.deliveryPlan.plannedTime} น.`
                      : ''}
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenPlanning(`?order=${encodeURIComponent(selected.id)}`)}
                  >
                    เปิดแผนจัดส่ง
                  </Button>
                </div>
              )}

              {selected.status === 'assigned' && (
                <div className="mt-5 rounded-xl border bg-warning/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-warning">
                    <Clock3 className="h-4 w-4" />
                    {boardStatusLabel(selected)}
                  </div>
                  {selected.deliveryRoute?.requiresAcceptance &&
                    !selected.deliveryRoute.acceptedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        ต้องรับภายใน {selected.deliveryRoute.acceptWithinMinutes ?? 15} นาที ·{' '}
                        {countdown(selected.deliveryRoute.acceptBy, nowMs)}
                      </p>
                    )}
                  {selected.deliveryRoute?.acceptedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      รับเมื่อ{' '}
                      {new Date(selected.deliveryRoute.acceptedAt).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · ต้องเริ่มภายใน {selected.deliveryRoute.startWithinMinutes ?? 10} นาที
                    </p>
                  )}
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onOpenTracking(
                        `?tab=awaiting_acceptance&order=${encodeURIComponent(selected.id)}`,
                      )
                    }
                  >
                    เปิดติดตามงาน
                  </Button>
                </div>
              )}

              {['in_transit', 'pending_confirmation', 'delivered'].includes(selected.status) && (
                <div className="mt-5 flex justify-end">
                  <Button
                    onClick={() => onOpenTracking(`?order=${encodeURIComponent(selected.id)}`)}
                  >
                    {selected.status === 'delivered' ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Truck className="h-4 w-4" />
                    )}
                    ดูการจัดส่ง
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <QuickCreateDialog
        open={quickCreateOpen}
        drivers={drivers}
        initialTemplateId={initialTemplateId}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={syncFromBackend}
      />
    </div>
  );
}
