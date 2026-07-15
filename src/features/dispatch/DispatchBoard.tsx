import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
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
import {
  boardActionLabel,
  boardActionPriority,
  getBoardAction,
} from '@/features/dispatch/boardActions';
import { QuickCreateDialog } from '@/features/dispatch/components/QuickCreateDialog';
import {
  dispatchJobTypeLabel,
  getDispatchJobTitle,
  getDispatchJobType,
  getPickup,
  type DispatchCreationOutcome,
} from '@/features/dispatch/types';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';

type BoardFilter = 'all' | 'unassigned' | 'exception';

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

export function DispatchBoard({ locationSearch, onOpenPlanning, onOpenTracking }: Props) {
  const { orders, drivers, publishUrgentRoute, syncFromBackend } = useRetailStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BoardFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [initialTemplateId, setInitialTemplateId] = useState<string>();
  const [dispatchDriverId, setDispatchDriverId] = useState('');
  const [acceptMinutes, setAcceptMinutes] = useState(15);
  const [startMinutes, setStartMinutes] = useState(10);
  const [startPolicy, setStartPolicy] = useState<'manual' | 'accept_starts'>('manual');
  const [dispatching, setDispatching] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

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

  const actionableOrders = useMemo(
    () =>
      orders
        .filter((order) => (order.shippingMethod ?? 'internal_driver') === 'internal_driver')
        .filter((order) => getBoardAction(order, nowMs) != null)
        .sort((a, b) => {
          const aAction = getBoardAction(a, nowMs)!;
          const bAction = getBoardAction(b, nowMs)!;
          const priority = boardActionPriority(bAction) - boardActionPriority(aAction);
          if (priority !== 0) return priority;
          return new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime();
        }),
    [nowMs, orders],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return actionableOrders.filter((order) => {
      const action = getBoardAction(order, nowMs)!;
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unassigned' && action.kind === 'unassigned') ||
        (filter === 'exception' && action.kind !== 'unassigned');
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
  }, [actionableOrders, filter, nowMs, query]);

  useEffect(() => {
    if (!selectedId || !filtered.some((order) => order.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const selected = actionableOrders.find((order) => order.id === selectedId) ?? null;
  const selectedAction = selected ? getBoardAction(selected, nowMs) : null;
  const selectedDriver = drivers.find((driver) => driver.id === dispatchDriverId);
  const counts = {
    all: actionableOrders.length,
    unassigned: actionableOrders.filter(
      (order) => getBoardAction(order, nowMs)?.kind === 'unassigned',
    ).length,
    exception: actionableOrders.filter(
      (order) => getBoardAction(order, nowMs)?.kind !== 'unassigned',
    ).length,
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
      toast.success(`ส่งงานให้ ${selectedDriver.name} แล้ว — ไปติดตามการรับงานต่อ`);
      onOpenTracking(`?tab=awaiting_acceptance&order=${encodeURIComponent(selected.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ส่งงานไม่สำเร็จ');
    } finally {
      setDispatching(false);
    }
  };

  const handleCreated = async (outcome: DispatchCreationOutcome) => {
    await syncFromBackend();
    const focusedOrder = outcome.orderIds[0];
    if (outcome.destination === 'planning') {
      onOpenPlanning(focusedOrder ? `?order=${encodeURIComponent(focusedOrder)}` : undefined);
      return;
    }
    onOpenTracking(
      focusedOrder
        ? `?tab=awaiting_acceptance&order=${encodeURIComponent(focusedOrder)}`
        : '?tab=awaiting_acceptance',
    );
  };

  const filteredHeading =
    filter === 'unassigned'
      ? 'งานรอจัดคนขับ'
      : filter === 'exception'
        ? 'งานผิดปกติที่ต้องแก้'
        : 'งานที่ต้องทำตอนนี้';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Dispatch Board — งานที่ต้องจัดการ
          </h1>
          <p className="text-sm text-muted-foreground">
            แสดงเฉพาะงานที่ต้องจัดคนขับหรือมีปัญหาให้แก้ไข
            งานที่ส่งแล้วติดตามต่อในหน้าติดตามการจัดส่ง
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
          <div className="text-xs text-muted-foreground">ต้องทำตอนนี้</div>
          <div className="mt-1 text-2xl font-semibold">{counts.all}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">รอจัดคนขับ</div>
          <div className="mt-1 text-2xl font-semibold">{counts.unassigned}</div>
        </Card>
        <Card className={cn('p-4', counts.exception > 0 && 'border-destructive/30')}>
          <div className="text-xs text-muted-foreground">ผิดปกติ / เกินเวลา</div>
          <div
            className={cn(
              'mt-1 text-2xl font-semibold',
              counts.exception > 0 && 'text-destructive',
            )}
          >
            {counts.exception}
          </div>
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
          containerClassName="w-52"
        >
          <option value="all">งานที่ต้องทำทั้งหมด</option>
          <option value="unassigned">รอจัดคนขับ</option>
          <option value="exception">ผิดปกติ / เกินเวลา</option>
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
            <h2 className="text-sm font-semibold">{filteredHeading}</h2>
            <Badge variant="secondary">{filtered.length}</Badge>
          </div>
          <div className="app-scroll max-h-[calc(100vh-19rem)] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-sm font-medium">ไม่มีงานที่ต้องจัดการในกลุ่มนี้</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  งานที่ Assign แล้วตามปกติจะอยู่ในหน้าติดตามการจัดส่ง
                </div>
              </div>
            ) : (
              filtered.map((order) => {
                const jobType = getDispatchJobType(order);
                const Icon = JOB_ICONS[jobType];
                const action = getBoardAction(order, nowMs)!;
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
                      {action.kind === 'unassigned' ? (
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
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
                      <span
                        className={cn(
                          'mt-1 block text-xs',
                          action.kind === 'unassigned'
                            ? 'text-muted-foreground'
                            : 'text-destructive',
                        )}
                      >
                        {boardActionLabel(action)}
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
          {!selected || !selectedAction ? (
            <div className="flex h-full min-h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
              เลือกงานที่ต้องจัดการเพื่อดูรายละเอียด
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
                <Badge variant={selectedAction.kind === 'unassigned' ? 'secondary' : 'destructive'}>
                  {selectedAction.kind === 'unassigned' ? 'รอจัดคนขับ' : 'ต้องแก้ไข'}
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

              {selectedAction.kind === 'unassigned' && (
                <div className="mt-5 border-t pt-4">
                  <h3 className="text-sm font-semibold">จัดคนขับและส่งงาน</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    เลือกคนขับเพื่อส่งทันที หรือย้ายงานนี้ไปจัดรอบใน Planning
                  </p>
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

              {selectedAction.kind !== 'unassigned' && (
                <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                    {selectedAction.kind === 'push_failed' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Clock3 className="h-4 w-4" />
                    )}
                    {boardActionLabel(selectedAction)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    เปิดหน้าติดตามเพื่อตรวจสอบการแจ้งเตือน เปลี่ยนคนขับ หรือดำเนินการกับเที่ยวนี้
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onOpenTracking(`?tab=overdue&order=${encodeURIComponent(selected.id)}`)
                    }
                  >
                    เปิดติดตามและแก้ไข
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
        orders={orders}
        initialTemplateId={initialTemplateId}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
