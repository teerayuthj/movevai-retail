import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Route,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DriverAvatar } from '@/components/DriverAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import type { Driver } from '@/data/orderTypes';
import {
  fetchDeliveryWorkspaceCalendar,
  fetchRouteBuilderCalendar,
  type DeliveryCalendarItem,
} from '@/lib/retailApi';
import { getTodayDateKey } from '@/lib/deliveryPlanning';
import { shortRouteCode } from '@/lib/routeCode';
import { CopyRouteCodeButton } from '@/components/CopyRouteCodeButton';
import { cn } from '@/lib/utils';

type CalendarFilter = 'all' | 'planned' | 'released' | 'urgent' | 'completed' | 'cancelled';

type Props = {
  drivers: Driver[];
  refreshKey: number;
  calendarScope: 'delivery_workspace' | 'route_builder';
  onOpenManage: (orderId?: string, mode?: 'immediate' | 'planning') => void;
  onOpenTracking: (orderId?: string) => void;
};

// จำนวนเที่ยวที่โชว์ต่อวันก่อนยุบส่วนที่เหลือเป็นปุ่ม "+N เที่ยว"
const DAY_VISIBLE_LIMIT = 4;

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function calendarStatus(item: DeliveryCalendarItem) {
  if (item.dispatchMode === 'urgent') return { label: 'ส่งทันที', variant: 'warning' as const };
  if (item.kind === 'plan') {
    if (item.status === 'awaiting_items') return { label: 'รอสินค้า', variant: 'warning' as const };
    if (item.status === 'on_hold') return { label: 'พักไว้', variant: 'muted' as const };
    return { label: 'วางแผนแล้ว', variant: 'info' as const };
  }
  if (item.status === 'completed') return { label: 'เสร็จแล้ว', variant: 'success' as const };
  if (item.status === 'cancelled') return { label: 'ยกเลิก', variant: 'destructive' as const };
  if (item.status === 'active') return { label: 'กำลังส่ง', variant: 'info' as const };
  return { label: 'ปล่อยรอบแล้ว', variant: 'success' as const };
}

function matchesFilter(item: DeliveryCalendarItem, filter: CalendarFilter) {
  if (filter === 'all') return true;
  if (filter === 'planned') return item.kind === 'plan';
  if (filter === 'released') return item.kind === 'route' && item.dispatchMode !== 'urgent';
  if (filter === 'urgent') return item.dispatchMode === 'urgent';
  return item.status === filter;
}

function calendarItemAccent(item: DeliveryCalendarItem) {
  if (item.status === 'cancelled') return 'bg-destructive';
  if (item.dispatchMode === 'urgent') return 'bg-warning';
  if (item.status === 'completed') return 'bg-success';
  if (item.status === 'active') return 'bg-info';
  if (item.kind === 'plan') return 'bg-primary';
  return 'bg-success';
}

function calendarItemTitle(item: DeliveryCalendarItem) {
  if (item.orderCount === 1) return item.orders[0]?.customerName ?? shortRouteCode(item.code);
  return `รอบส่ง ${item.orderCount} จุด`;
}

function calendarItemType(item: DeliveryCalendarItem) {
  if (item.dispatchMode === 'urgent') return 'งานส่งทันที';
  return item.kind === 'plan' ? 'แผนจัดส่ง' : 'รอบจัดส่ง';
}

export function DeliveryCalendar({
  drivers,
  refreshKey,
  calendarScope,
  onOpenManage,
  onOpenTracking,
}: Props) {
  const showLineProfile = calendarScope === 'delivery_workspace';
  // Driver.id ฝั่ง frontend คือ driver code — ใช้จับคู่ item.driver.code เพื่อดึงรูป/เบอร์โทร
  const driverRecordFor = (code?: string) =>
    code ? (drivers.find((driver) => driver.id === code) ?? null) : null;
  const initialWeek = startOfWeek(parseISO(getTodayDateKey()), { weekStartsOn: 1 });
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [driverCode, setDriverCode] = useState('');
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [items, setItems] = useState<DeliveryCalendarItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  );
  const dateFrom = dateKey(days[0]);
  const dateTo = dateKey(days[6]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fetchCalendar =
        calendarScope === 'delivery_workspace'
          ? fetchDeliveryWorkspaceCalendar
          : fetchRouteBuilderCalendar;
      const response = await fetchCalendar({
        dateFrom,
        dateTo,
        driverCode: driverCode || undefined,
      });
      setItems(response.items);
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : 'โหลดภาพรวมปฏิทินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [calendarScope, dateFrom, dateTo, driverCode]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar, refreshKey, requestKey]);

  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [filter, items],
  );
  const selectedItem = visibleItems.find((item) => item.id === selectedId) ?? null;
  const itemsByDate = useMemo(() => {
    const grouped = new Map<string, DeliveryCalendarItem[]>();
    visibleItems.forEach((item) =>
      grouped.set(item.plannedDate, [...(grouped.get(item.plannedDate) ?? []), item]),
    );
    return grouped;
  }, [visibleItems]);
  const plannedCount = items.filter((item) => item.kind === 'plan').length;
  const releasedCount = items.filter(
    (item) => item.kind === 'route' && item.dispatchMode !== 'urgent',
  ).length;
  const urgentCount = items.filter((item) => item.dispatchMode === 'urgent').length;

  const toggleDayExpanded = (dayKey: string) =>
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {format(days[0], 'd MMM', { locale: th })}–
              {format(days[6], 'd MMM yyyy', { locale: th })}
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {calendarScope === 'route_builder'
              ? 'แสดงเฉพาะเที่ยวที่สร้างจากหน้าสร้างเที่ยววิ่ง'
              : 'แสดงแผนและ Route ที่สร้างจากมุมมอง “จัดการงาน” แล้ว'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <label
              htmlFor="calendar-driver"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Messenger
            </label>
            <Select
              id="calendar-driver"
              value={driverCode}
              onChange={(event) => setDriverCode(event.target.value)}
              containerClassName="w-44"
            >
              <option value="">ทุกคน</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-1">
            <label
              htmlFor="calendar-status"
              className="text-[11px] font-medium text-muted-foreground"
            >
              สถานะ
            </label>
            <Select
              id="calendar-status"
              value={filter}
              onChange={(event) => setFilter(event.target.value as CalendarFilter)}
              containerClassName="w-40"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="planned">วางแผนแล้ว</option>
              <option value="released">ปล่อยรอบแล้ว</option>
              <option value="urgent">ส่งทันที</option>
              <option value="completed">เสร็จแล้ว</option>
              <option value="cancelled">ยกเลิก</option>
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="สัปดาห์ก่อน"
            onClick={() => setWeekStart((current) => addWeeks(current, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setWeekStart(initialWeek)}>
            วันนี้
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="สัปดาห์ถัดไป"
            onClick={() => setWeekStart((current) => addWeeks(current, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="อัปเดตปฏิทิน"
            onClick={() => setRequestKey((value) => value + 1)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="info">วางแผนแล้ว {plannedCount}</Badge>
        <Badge variant="success">ปล่อยรอบแล้ว {releasedCount}</Badge>
        <Badge variant="warning">ส่งทันที {urgentCount}</Badge>
      </div>

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-sm text-destructive">{error}</div>
            <Button variant="outline" onClick={() => setRequestKey((value) => value + 1)}>
              ลองใหม่
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-7 divide-x border-b">
              {days.map((day) => {
                const key = dateKey(day);
                const dayItems = itemsByDate.get(key) ?? [];
                const isToday = key === getTodayDateKey();
                const isExpanded = expandedDays.has(key);
                const shownItems =
                  isExpanded || dayItems.length <= DAY_VISIBLE_LIMIT
                    ? dayItems
                    : dayItems.slice(0, DAY_VISIBLE_LIMIT);
                const hiddenCount = dayItems.length - shownItems.length;
                return (
                  <section
                    key={key}
                    className={cn('min-h-[430px] p-3', isToday && 'bg-primary/[0.03]')}
                    aria-label={format(day, 'EEEE d MMMM', { locale: th })}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2 border-b pb-2">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          {format(day, 'EEE', { locale: th })}
                        </div>
                        <div className="font-semibold">{format(day, 'd')}</div>
                      </div>
                      {isToday && <Badge variant="info">วันนี้</Badge>}
                    </div>
                    <div className="space-y-2">
                      {shownItems.map((item) => {
                        const selected = selectedItem?.id === item.id;
                        const driverRecord = driverRecordFor(item.driver?.code);
                        return (
                          <Popover
                            key={item.id}
                            open={selected}
                            onOpenChange={(open) => setSelectedId(open ? item.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label={`ดูรายละเอียด ${shortRouteCode(item.code)}`}
                                aria-pressed={selected}
                                className={cn(
                                  'w-full rounded-lg border p-2 text-left transition-all',
                                  selected
                                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                    : 'bg-card hover:border-primary/40',
                                  item.status === 'cancelled' && 'opacity-60',
                                )}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="min-w-0 truncate font-mono text-[11px] font-medium">
                                    {shortRouteCode(item.code)}
                                  </span>
                                  <span className="shrink-0 text-[10px] text-muted-foreground">
                                    {item.plannedTime ?? 'ไม่ระบุเวลา'}
                                  </span>
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5">
                                  {driverRecord ? (
                                    <DriverAvatar driver={driverRecord} className="h-6 w-6" />
                                  ) : item.driver ? (
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                      {item.driver.name.trim().charAt(0)}
                                    </span>
                                  ) : (
                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                                      <UserRound className="h-3 w-3" />
                                    </span>
                                  )}
                                  <span className="min-w-0">
                                    {item.driver ? (
                                      <>
                                        <span className="block truncate text-xs font-semibold">
                                          {item.driver.name}
                                        </span>
                                        <span className="block text-[9px] leading-tight text-muted-foreground">
                                          คนขับ
                                        </span>
                                      </>
                                    ) : (
                                      <span className="block truncate text-xs font-medium text-muted-foreground">
                                        รอเลือก Messenger
                                      </span>
                                    )}
                                  </span>
                                </div>
                                {showLineProfile && item.lineProfile && (
                                  <div className="mt-1 flex min-w-0 items-center gap-1.5">
                                    <Avatar className="h-6 w-6 border border-[#06c755]/20">
                                      {item.lineProfile.pictureUrl && (
                                        <AvatarImage
                                          src={item.lineProfile.pictureUrl}
                                          alt={`รูป LINE ของ ${item.lineProfile.displayName}`}
                                        />
                                      )}
                                      <AvatarFallback className="bg-[#06c755]/15 text-[#07883d]">
                                        <MessageCircle className="h-3 w-3" />
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-semibold">
                                        {item.lineProfile.displayName}
                                      </span>
                                      <span className="block text-[9px] leading-tight text-muted-foreground">
                                        ชื่อจาก LINE
                                      </span>
                                    </span>
                                  </div>
                                )}
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              side="right"
                              align="center"
                              sideOffset={10}
                              collisionPadding={16}
                              className="w-[min(22rem,calc(100vw-2rem))] rounded-[1.25rem] border-border/80 bg-popover p-2 shadow-2xl"
                            >
                              <div className="space-y-2">
                                <section className="rounded-[0.9rem] bg-muted/70 px-3 py-3">
                                  <div className="flex items-start gap-2">
                                    <span
                                      aria-hidden="true"
                                      className={cn(
                                        'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                                        calendarItemAccent(item),
                                      )}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <h3 className="break-words text-base font-semibold leading-tight">
                                        {calendarItemTitle(item)}
                                      </h3>
                                      <p className="mt-1 flex items-center gap-1 font-mono text-xs font-medium text-muted-foreground">
                                        {shortRouteCode(item.code)}
                                        <CopyRouteCodeButton code={item.code} />
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label="ปิดรายละเอียด"
                                      onClick={() => setSelectedId(null)}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </section>

                                <section className="space-y-2 rounded-[0.9rem] bg-muted/70 px-3 py-3 text-sm">
                                  <div className="flex gap-2.5">
                                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <div>
                                      <div className="font-medium">
                                        {format(parseISO(item.plannedDate), 'd MMMM yyyy', {
                                          locale: th,
                                        })}
                                        {item.plannedTime ? ` · ${item.plannedTime} น.` : ''}
                                      </div>
                                      <div className="mt-0.5 text-xs text-muted-foreground">
                                        {calendarItemType(item)} · {calendarStatus(item).label}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2.5">
                                    {driverRecord ? (
                                      <DriverAvatar driver={driverRecord} className="h-8 w-8" />
                                    ) : item.driver ? (
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                                        {item.driver.name.trim().charAt(0)}
                                      </span>
                                    ) : (
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                                        <UserRound className="h-4 w-4" />
                                      </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium">
                                        {item.driver?.name ?? 'ยังไม่เลือก Messenger'}
                                      </div>
                                      {item.driver && (
                                        <div className="text-xs text-muted-foreground">
                                          คนขับ
                                          {driverRecord?.phone ? ` · ${driverRecord.phone}` : ''}
                                        </div>
                                      )}
                                    </div>
                                    {driverRecord?.phone && (
                                      <Button
                                        variant="outline"
                                        size="icon-xs"
                                        asChild
                                        aria-label="โทรหาคนขับ"
                                      >
                                        <a href={`tel:${driverRecord.phone}`}>
                                          <Phone className="h-3.5 w-3.5" />
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                  {item.coDrivers.length > 0 && (
                                    <div className="flex items-center gap-1.5 pl-[42px] text-xs text-muted-foreground">
                                      <UsersRound className="h-3.5 w-3.5 shrink-0" />
                                      ร่วมส่ง:{' '}
                                      {item.coDrivers.map((driver) => driver.name).join(', ')}
                                    </div>
                                  )}
                                  {showLineProfile && item.lineProfile && (
                                    <div className="flex items-center gap-2.5">
                                      <Avatar className="h-8 w-8 border border-[#06c755]/20">
                                        {item.lineProfile.pictureUrl && (
                                          <AvatarImage
                                            src={item.lineProfile.pictureUrl}
                                            alt={`รูป LINE ของ ${item.lineProfile.displayName}`}
                                          />
                                        )}
                                        <AvatarFallback className="bg-[#06c755]/15 text-[#07883d]">
                                          <MessageCircle className="h-4 w-4" />
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">
                                          {item.lineProfile.displayName}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          ผู้ส่งจาก LINE
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </section>

                                <section className="rounded-[0.9rem] bg-muted/70 px-3 py-3">
                                  <div className="mb-2 flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-muted-foreground" />
                                    <h4 className="text-sm font-semibold">
                                      รายการจัดส่ง ({item.orderCount})
                                    </h4>
                                  </div>
                                  <div className="app-scroll max-h-64 space-y-1.5 overflow-y-auto pr-1">
                                    {item.orders.map((order) => {
                                      const phone =
                                        order.customerPhone && order.customerPhone !== '-'
                                          ? order.customerPhone
                                          : null;
                                      const address =
                                        order.customerAddress && order.customerAddress !== '-'
                                          ? order.customerAddress
                                          : null;
                                      // เที่ยว ad-hoc ใช้ชื่อเที่ยวเป็นชื่อ item (ไม่ใช่สินค้าจริง)
                                      // จึงซ้ำกับหมายเหตุ — ซ่อนไว้ ให้โชว์เฉพาะออเดอร์ที่มีสินค้าจริง
                                      const itemLabel =
                                        item.createdVia === 'ad_hoc_route'
                                          ? ''
                                          : order.items
                                              .map((line) =>
                                                line.qty > 1
                                                  ? `${line.name} ×${line.qty}`
                                                  : line.name,
                                              )
                                              .join(', ');
                                      return (
                                        <div
                                          key={order.id}
                                          className="space-y-1 rounded-lg bg-background/80 px-2.5 py-2"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="truncate text-sm font-medium">
                                              {order.customerName}
                                            </div>
                                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                              {order.orderNo ?? order.code}
                                            </span>
                                          </div>
                                          {phone && (
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                              <Phone className="h-3 w-3 shrink-0" />
                                              <a href={`tel:${phone}`} className="hover:underline">
                                                {phone}
                                              </a>
                                            </div>
                                          )}
                                          {address && (
                                            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                              <span className="whitespace-pre-wrap break-words">
                                                {address}
                                              </span>
                                            </div>
                                          )}
                                          {itemLabel && (
                                            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                              <Package className="mt-0.5 h-3 w-3 shrink-0" />
                                              <span className="break-words">{itemLabel}</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </section>

                                {item.note && (
                                  <section className="rounded-[0.9rem] bg-muted/70 px-3 py-3">
                                    <div className="text-[11px] font-medium text-muted-foreground">
                                      หมายเหตุ
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap text-sm">{item.note}</p>
                                  </section>
                                )}

                                <div className="flex items-center justify-end gap-2 px-1 pt-1">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setSelectedId(null)}
                                  >
                                    ปิด
                                  </Button>
                                  {item.kind === 'plan' ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedId(null);
                                        onOpenManage(item.orders[0]?.id, 'planning');
                                      }}
                                    >
                                      <CalendarDays className="h-3.5 w-3.5" /> ไปที่จัดการงาน
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedId(null);
                                        onOpenTracking(item.orders[0]?.id);
                                      }}
                                    >
                                      <Route className="h-3.5 w-3.5" /> ติดตามการจัดส่ง
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        );
                      })}
                      {dayItems.length > DAY_VISIBLE_LIMIT && (
                        <button
                          type="button"
                          onClick={() => toggleDayExpanded(key)}
                          aria-expanded={isExpanded}
                          className="w-full rounded-lg border border-dashed py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          {isExpanded ? 'ย่อ' : `+${hiddenCount} เที่ยว`}
                        </button>
                      )}
                      {!loading && dayItems.length === 0 && (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                          ไม่มีรอบส่ง
                        </div>
                      )}
                      {loading && (
                        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
