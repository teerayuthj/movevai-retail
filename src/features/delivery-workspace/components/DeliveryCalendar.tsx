import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  eachMonthOfInterval,
  endOfYear,
  format,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { th } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  RefreshCw,
  Route,
  UserCheck,
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
  fetchDeliveryWorkspaceCalendarSummary,
  fetchRouteBuilderCalendar,
  fetchRouteBuilderCalendarSummary,
  type DeliveryCalendarItem,
} from '@/lib/retailApi';
import { getTodayDateKey } from '@/lib/deliveryPlanning';
import { shortRouteCode } from '@/lib/routeCode';
import { CopyRouteCodeButton } from '@/components/CopyRouteCodeButton';
import { cn } from '@/lib/utils';

type CalendarFilter =
  | 'all'
  | 'planned'
  | 'released'
  | 'awaiting_acceptance'
  | 'urgent'
  | 'completed'
  | 'cancelled';
type CalendarView = 'day' | 'week' | 'month' | 'year';

type Props = {
  drivers: Driver[];
  refreshKey: number;
  calendarScope: 'delivery_workspace' | 'route_builder';
  onOpenManage: (orderId?: string, mode?: 'immediate' | 'planning') => void;
  onOpenTracking: (orderId?: string) => void;
};

// จำนวนเที่ยวที่โชว์ต่อวันในมุมมองเดือนก่อนยุบส่วนที่เหลือเป็นปุ่ม "+N"
const MONTH_CELL_LIMIT = 3;
// ชั่วโมงที่ไล่แสดงใน timeline ของมุมมองวัน
const DAY_HOURS = Array.from({ length: 16 }, (_, index) => index + 6); // 06:00–21:00

const VIEW_LABELS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: 'วัน' },
  { value: 'week', label: 'สัปดาห์' },
  { value: 'month', label: 'เดือน' },
  { value: 'year', label: 'ปี' },
];

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function weekStartOf(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

// กริดมุมมองเดือนแบบ 6 สัปดาห์ (เริ่มวันจันทร์) — รวมวันเดือนก่อน/หลังที่ล้นเข้ามา
function monthGridOf(date: Date) {
  const start = weekStartOf(startOfMonth(date));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
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
  // route.status === 'published' — แยกตามการรับงานของ messenger
  if (isAwaitingAcceptance(item)) return { label: 'รอรับงาน', variant: 'warning' as const };
  if (item.acceptedAt) return { label: 'รับแล้ว รอออก', variant: 'success' as const };
  return { label: 'ปล่อยรอบแล้ว', variant: 'success' as const };
}

// route ที่ปล่อยแล้ว ต้องให้ messenger กดรับ แต่ยังไม่รับ (ยังไม่ acceptedAt)
function isAwaitingAcceptance(item: DeliveryCalendarItem) {
  return (
    item.kind === 'route' &&
    item.status === 'published' &&
    item.requiresAcceptance &&
    !item.acceptedAt
  );
}

// โทนสีของ chip/การ์ดในปฏิทิน (semantic token) — เรียงตามความเร่งด่วน:
// ยกเลิก=เทา (งานจบ) · ส่งทันที=แดง (เตะตาสุด) · รอสินค้า=ส้ม · วางแผน/กำลังส่ง=ฟ้า · ปล่อย/เสร็จ=เขียว
type EventTone = { dot: string; chipBg: string; chipText: string; border: string };
const EVENT_TONE = {
  info: { dot: 'bg-info', chipBg: 'bg-info/10', chipText: 'text-info', border: 'border-info' },
  success: {
    dot: 'bg-success',
    chipBg: 'bg-success/10',
    chipText: 'text-success',
    border: 'border-success',
  },
  warning: {
    dot: 'bg-warning',
    chipBg: 'bg-warning/10',
    chipText: 'text-warning',
    border: 'border-warning',
  },
  destructive: {
    dot: 'bg-destructive',
    chipBg: 'bg-destructive/10',
    chipText: 'text-destructive',
    border: 'border-destructive',
  },
  muted: {
    dot: 'bg-muted-foreground',
    chipBg: 'bg-muted',
    chipText: 'text-muted-foreground',
    border: 'border-border',
  },
} satisfies Record<string, EventTone>;

function eventTone(item: DeliveryCalendarItem): EventTone {
  if (item.status === 'cancelled') return EVENT_TONE.muted;
  if (item.dispatchMode === 'urgent') return EVENT_TONE.destructive;
  if (item.status === 'completed') return EVENT_TONE.success;
  if (item.status === 'active') return EVENT_TONE.info;
  if (item.kind === 'plan') {
    if (item.status === 'awaiting_items') return EVENT_TONE.warning;
    if (item.status === 'on_hold') return EVENT_TONE.muted;
    return EVENT_TONE.info;
  }
  // route.status === 'published' — รอรับงานเน้นสีเตือน (amber), รับแล้ว/ไม่ต้องรับ = เขียว
  if (isAwaitingAcceptance(item)) return EVENT_TONE.warning;
  return EVENT_TONE.success;
}

function matchesFilter(item: DeliveryCalendarItem, filter: CalendarFilter) {
  if (filter === 'all') return true;
  if (filter === 'planned') return item.kind === 'plan';
  if (filter === 'released') return item.kind === 'route' && item.dispatchMode !== 'urgent';
  if (filter === 'awaiting_acceptance') return isAwaitingAcceptance(item);
  if (filter === 'urgent') return item.dispatchMode === 'urgent';
  return item.status === filter;
}

function calendarItemAccent(item: DeliveryCalendarItem) {
  if (item.status === 'cancelled') return 'bg-muted-foreground';
  if (item.dispatchMode === 'urgent') return 'bg-destructive';
  if (item.status === 'completed') return 'bg-success';
  if (item.status === 'active') return 'bg-info';
  if (item.kind === 'plan') return 'bg-primary';
  if (isAwaitingAcceptance(item)) return 'bg-warning';
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

function calendarAppointmentLabel(item: DeliveryCalendarItem) {
  if (!item.appointmentDate || !item.appointmentTime) return null;
  const dateLabel =
    item.appointmentDate === item.plannedDate
      ? ''
      : `${format(parseISO(item.appointmentDate), 'd MMM', { locale: th })} · `;
  return `นัด ${dateLabel}${item.appointmentTime} น.`;
}

// หัวเรื่องช่วงเวลาตามมุมมอง
function rangeTitle(view: CalendarView, cursor: Date) {
  if (view === 'year') return format(cursor, 'yyyy');
  if (view === 'month') return format(cursor, 'MMMM yyyy', { locale: th });
  if (view === 'day') return format(cursor, 'EEEE d MMMM yyyy', { locale: th });
  const start = weekStartOf(cursor);
  const end = addDays(start, 6);
  const startLabel = isSameMonth(start, end)
    ? format(start, 'd', { locale: th })
    : format(start, 'd MMM', { locale: th });
  return `${startLabel}–${format(end, 'd MMM yyyy', { locale: th })}`;
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

  const [view, setView] = useState<CalendarView>('week');
  const [cursor, setCursor] = useState(() => parseISO(getTodayDateKey()));
  const [driverCode, setDriverCode] = useState('');
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [items, setItems] = useState<DeliveryCalendarItem[]>([]);
  const [summaryByDate, setSummaryByDate] = useState<Map<string, number>>(() => new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestKey, setRequestKey] = useState(0);

  const todayKey = getTodayDateKey();

  // ช่วงวันที่ที่ต้องดึงข้อมูลรายละเอียด (day/week/month)
  const detailRange = useMemo(() => {
    if (view === 'day') {
      const key = dateKey(cursor);
      return { from: key, to: key };
    }
    if (view === 'week') {
      const start = weekStartOf(cursor);
      return { from: dateKey(start), to: dateKey(addDays(start, 6)) };
    }
    const grid = monthGridOf(cursor);
    return { from: dateKey(grid[0]), to: dateKey(grid[41]) };
  }, [view, cursor]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (view === 'year') {
        const fetchSummary =
          calendarScope === 'delivery_workspace'
            ? fetchDeliveryWorkspaceCalendarSummary
            : fetchRouteBuilderCalendarSummary;
        const response = await fetchSummary({
          year: cursor.getFullYear(),
          driverCode: driverCode || undefined,
        });
        setSummaryByDate(new Map(response.days.map((day) => [day.date, day.count])));
        setItems([]);
      } else {
        const fetchCalendar =
          calendarScope === 'delivery_workspace'
            ? fetchDeliveryWorkspaceCalendar
            : fetchRouteBuilderCalendar;
        const response = await fetchCalendar({
          dateFrom: detailRange.from,
          dateTo: detailRange.to,
          driverCode: driverCode || undefined,
        });
        setItems(response.items);
      }
    } catch (loadError) {
      setItems([]);
      setSummaryByDate(new Map());
      setError(loadError instanceof Error ? loadError.message : 'โหลดภาพรวมปฏิทินไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [calendarScope, cursor, detailRange.from, detailRange.to, driverCode, view]);

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
  const awaitingAcceptanceCount = items.filter(isAwaitingAcceptance).length;

  const goToday = () => setCursor(parseISO(todayKey));
  const step = (direction: 1 | -1) =>
    setCursor((current) => {
      if (view === 'year') return addYears(current, direction);
      if (view === 'month') return addMonths(current, direction);
      if (view === 'week') return addWeeks(current, direction);
      return addDays(current, direction);
    });
  const openDay = (date: Date) => {
    setCursor(date);
    setView('day');
  };
  const openMonth = (date: Date) => {
    setCursor(date);
    setView('month');
  };

  // การ์ด/chip ของเที่ยวหนึ่งรายการ พร้อม popover รายละเอียด (ใช้ร่วมกันทุกมุมมอง)
  const renderEvent = (item: DeliveryCalendarItem, variant: 'month' | 'week' | 'day') => {
    const selected = selectedItem?.id === item.id;
    const driverRecord = driverRecordFor(item.driver?.code);
    const tone = eventTone(item);
    const timeLabel = item.plannedTime ?? 'ไม่ระบุเวลา';

    let trigger: React.ReactNode;
    if (variant === 'month') {
      trigger = (
        <button
          type="button"
          aria-label={`ดูรายละเอียด ${shortRouteCode(item.code)}`}
          aria-pressed={selected}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors',
            tone.chipBg,
            selected && 'ring-1 ring-primary',
            item.status === 'cancelled' && 'opacity-60',
          )}
        >
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden="true" />
          <span className={cn('shrink-0 text-[10px] font-medium tabular-nums', tone.chipText)}>
            {item.plannedTime ?? '—'}
          </span>
          <span className="min-w-0 truncate text-[11px] text-foreground">
            {calendarItemTitle(item)}
          </span>
        </button>
      );
    } else if (variant === 'week') {
      trigger = (
        <button
          type="button"
          aria-label={`ดูรายละเอียด ${shortRouteCode(item.code)}`}
          aria-pressed={selected}
          className={cn(
            'w-full rounded-r-lg border-l-[3px] py-1.5 pl-2 pr-1.5 text-left transition-colors',
            tone.border,
            tone.chipBg,
            selected && 'ring-1 ring-primary',
            item.status === 'cancelled' && 'opacity-60',
          )}
        >
          <div className={cn('text-[10px] font-medium tabular-nums', tone.chipText)}>
            {timeLabel}
          </div>
          <div className="truncate text-xs font-semibold text-foreground">
            {calendarItemTitle(item)}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            <UserRound className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{item.driver?.name ?? 'รอเลือก Messenger'}</span>
          </div>
        </button>
      );
    } else {
      trigger = (
        <button
          type="button"
          aria-label={`ดูรายละเอียด ${shortRouteCode(item.code)}`}
          aria-pressed={selected}
          className={cn(
            'w-full rounded-r-lg border-l-[3px] p-2.5 text-left transition-colors',
            tone.border,
            tone.chipBg,
            selected && 'ring-1 ring-primary',
            item.status === 'cancelled' && 'opacity-60',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {calendarItemTitle(item)}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
              {shortRouteCode(item.code)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {driverRecord ? (
              <DriverAvatar driver={driverRecord} className="h-5 w-5" />
            ) : item.driver ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                {item.driver.name.trim().charAt(0)}
              </span>
            ) : (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                <UserRound className="h-2.5 w-2.5" />
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {item.driver?.name ?? 'รอเลือก Messenger'}
            </span>
            {calendarAppointmentLabel(item) && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-info">
                <CalendarDays className="h-3 w-3" />
                {calendarAppointmentLabel(item)}
              </span>
            )}
          </div>
        </button>
      );
    }

    return (
      <Popover
        key={item.id}
        open={selected}
        onOpenChange={(open) => setSelectedId(open ? item.id : null)}
      >
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
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
                    เวลาออก ·{' '}
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
              {item.appointmentDate && item.appointmentTime && (
                <div className="flex gap-2.5 text-info">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">
                      นัดลูกค้า ·{' '}
                      {format(parseISO(item.appointmentDate), 'd MMMM yyyy', {
                        locale: th,
                      })}{' '}
                      · {item.appointmentTime} น.
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      ใช้คำนวณสถานะเลยกำหนด
                    </div>
                  </div>
                </div>
              )}
              {item.kind === 'route' && item.requiresAcceptance && (
                <div
                  className={cn('flex gap-2.5', item.acceptedAt ? 'text-success' : 'text-warning')}
                >
                  {item.acceptedAt ? (
                    <UserCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">
                      {item.acceptedAt
                        ? `Messenger รับงานแล้ว · ${format(parseISO(item.acceptedAt), 'd MMM · HH:mm', { locale: th })} น.`
                        : 'ยังไม่รับงาน — รอ Messenger กดรับ'}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {item.acceptedAt ? 'รอเริ่มเที่ยว' : 'รอบนี้ต้องกดรับก่อนเริ่ม'}
                    </div>
                  </div>
                </div>
              )}
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
                  <Button variant="outline" size="icon-xs" asChild aria-label="โทรหาคนขับ">
                    <a href={`tel:${driverRecord.phone}`}>
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </div>
              {item.coDrivers.length > 0 && (
                <div className="flex items-center gap-1.5 pl-[42px] text-xs text-muted-foreground">
                  <UsersRound className="h-3.5 w-3.5 shrink-0" />
                  ร่วมส่ง: {item.coDrivers.map((driver) => driver.name).join(', ')}
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
                    <div className="truncate font-medium">{item.lineProfile.displayName}</div>
                    <div className="text-xs text-muted-foreground">ผู้ส่งจาก LINE</div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[0.9rem] bg-muted/70 px-3 py-3">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">รายการจัดส่ง ({item.orderCount})</h4>
              </div>
              <div className="app-scroll max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {item.orders.map((order) => {
                  const phone =
                    order.customerPhone && order.customerPhone !== '-' ? order.customerPhone : null;
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
                          .map((line) => (line.qty > 1 ? `${line.name} ×${line.qty}` : line.name))
                          .join(', ');
                  return (
                    <div
                      key={order.id}
                      className="space-y-1 rounded-lg bg-background/80 px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{order.customerName}</div>
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
                          <span className="whitespace-pre-wrap break-words">{address}</span>
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
                <div className="text-[11px] font-medium text-muted-foreground">หมายเหตุ</div>
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
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{rangeTitle(view, cursor)}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {calendarScope === 'route_builder'
              ? 'แสดงเฉพาะเที่ยวที่สร้างจากหน้าสร้างเที่ยววิ่ง'
              : 'แสดงแผนและ Route ที่สร้างจากมุมมอง “จัดการงาน” แล้ว'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div
            role="tablist"
            aria-label="มุมมองปฏิทิน"
            className="flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5"
          >
            {VIEW_LABELS.map((option) => {
              const active = view === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setView(option.value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    active
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
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
          {view !== 'year' && (
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
                <option value="awaiting_acceptance">รอรับงาน</option>
                <option value="urgent">ส่งทันที</option>
                <option value="completed">เสร็จแล้ว</option>
                <option value="cancelled">ยกเลิก</option>
              </Select>
            </div>
          )}
          <Button variant="outline" size="icon" aria-label="ก่อนหน้า" onClick={() => step(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={goToday}>
            วันนี้
          </Button>
          <Button variant="outline" size="icon" aria-label="ถัดไป" onClick={() => step(1)}>
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

      {view !== 'year' && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">วางแผนแล้ว {plannedCount}</Badge>
          <Badge variant="success">ปล่อยรอบแล้ว {releasedCount}</Badge>
          {awaitingAcceptanceCount > 0 && (
            <Badge variant="warning">รอรับงาน {awaitingAcceptanceCount}</Badge>
          )}
          <Badge variant="destructive">ส่งทันที {urgentCount}</Badge>
        </div>
      )}

      {error ? (
        <Card className="border-destructive/30">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-sm text-destructive">{error}</div>
            <Button variant="outline" onClick={() => setRequestKey((value) => value + 1)}>
              ลองใหม่
            </Button>
          </CardContent>
        </Card>
      ) : view === 'year' ? (
        <YearView
          cursor={cursor}
          summaryByDate={summaryByDate}
          todayKey={todayKey}
          loading={loading}
          onOpenMonth={openMonth}
        />
      ) : view === 'month' ? (
        <MonthView
          cursor={cursor}
          itemsByDate={itemsByDate}
          todayKey={todayKey}
          loading={loading}
          renderEvent={renderEvent}
          onOpenDay={openDay}
        />
      ) : view === 'week' ? (
        <WeekView
          cursor={cursor}
          itemsByDate={itemsByDate}
          todayKey={todayKey}
          loading={loading}
          renderEvent={renderEvent}
          onOpenDay={openDay}
        />
      ) : (
        <DayView
          dayItems={itemsByDate.get(dateKey(cursor)) ?? []}
          loading={loading}
          renderEvent={renderEvent}
        />
      )}
    </div>
  );
}

type RenderEvent = (
  item: DeliveryCalendarItem,
  variant: 'month' | 'week' | 'day',
) => React.ReactNode;

const WEEKDAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

function YearView({
  cursor,
  summaryByDate,
  todayKey,
  loading,
  onOpenMonth,
}: {
  cursor: Date;
  summaryByDate: Map<string, number>;
  todayKey: string;
  loading: boolean;
  onOpenMonth: (date: Date) => void;
}) {
  const months = eachMonthOfInterval({
    start: startOfYear(cursor),
    end: endOfYear(cursor),
  });
  return (
    <Card className="overflow-hidden">
      {loading && (
        <div className="flex items-center justify-center gap-2 border-b py-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด
        </div>
      )}
      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {months.map((month) => {
          const grid = monthGridOf(month);
          return (
            <button
              key={month.toISOString()}
              type="button"
              onClick={() => onOpenMonth(month)}
              className="rounded-xl border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-muted/50"
            >
              <div
                className={cn(
                  'mb-1.5 px-1 text-sm font-semibold',
                  isSameMonth(month, parseISO(todayKey)) && 'text-primary',
                )}
              >
                {format(month, 'MMMM', { locale: th })}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="text-center text-[9px] text-muted-foreground">
                    {label.charAt(0)}
                  </div>
                ))}
                {grid.map((day) => {
                  const key = dateKey(day);
                  const inMonth = isSameMonth(day, month);
                  const isToday = key === todayKey;
                  const hasWork = (summaryByDate.get(key) ?? 0) > 0;
                  return (
                    <div
                      key={key}
                      className={cn(
                        'mx-auto flex h-4 w-4 items-center justify-center rounded-full text-[10px] tabular-nums',
                        !inMonth && 'text-muted-foreground/40',
                        inMonth && !isToday && !hasWork && 'text-muted-foreground',
                        inMonth && !isToday && hasWork && 'font-semibold text-foreground',
                        isToday && 'bg-primary font-semibold text-primary-foreground',
                      )}
                    >
                      {inMonth && hasWork && !isToday ? (
                        <span className="relative">
                          {format(day, 'd')}
                          <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                        </span>
                      ) : (
                        format(day, 'd')
                      )}
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function MonthView({
  cursor,
  itemsByDate,
  todayKey,
  loading,
  renderEvent,
  onOpenDay,
}: {
  cursor: Date;
  itemsByDate: Map<string, DeliveryCalendarItem[]>;
  todayKey: string;
  loading: boolean;
  renderEvent: RenderEvent;
  onOpenDay: (date: Date) => void;
}) {
  const grid = monthGridOf(cursor);
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 border-b">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day, index) => {
              const key = dateKey(day);
              const inMonth = isSameMonth(day, cursor);
              const isToday = key === todayKey;
              const dayItems = itemsByDate.get(key) ?? [];
              const shown = dayItems.slice(0, MONTH_CELL_LIMIT);
              const hidden = dayItems.length - shown.length;
              return (
                <div
                  key={key}
                  className={cn(
                    'min-h-[104px] border-b border-r p-1.5',
                    index % 7 === 6 && 'border-r-0',
                    !inMonth && 'bg-muted/30',
                    isToday && 'bg-primary/[0.04]',
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenDay(day)}
                      aria-label={`เปิดวัน ${format(day, 'd MMMM', { locale: th })}`}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums transition-colors hover:bg-muted',
                        isToday &&
                          'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                        !isToday && !inMonth && 'text-muted-foreground/50',
                      )}
                    >
                      {format(day, 'd')}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {shown.map((item) => renderEvent(item, 'month'))}
                    {hidden > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenDay(day)}
                        className="w-full rounded-md px-1.5 py-0.5 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      >
                        +{hidden} เที่ยว
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {loading && (
        <div className="flex items-center justify-center gap-2 border-t py-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด
        </div>
      )}
    </Card>
  );
}

function WeekView({
  cursor,
  itemsByDate,
  todayKey,
  loading,
  renderEvent,
  onOpenDay,
}: {
  cursor: Date;
  itemsByDate: Map<string, DeliveryCalendarItem[]>;
  todayKey: string;
  loading: boolean;
  renderEvent: RenderEvent;
  onOpenDay: (date: Date) => void;
}) {
  const start = weekStartOf(cursor);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-7 divide-x border-b">
          {days.map((day) => {
            const key = dateKey(day);
            const dayItems = itemsByDate.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <section
                key={key}
                className={cn('min-h-[430px] p-3', isToday && 'bg-primary/[0.03]')}
                aria-label={format(day, 'EEEE d MMMM', { locale: th })}
              >
                <div className="mb-3 flex items-start justify-between gap-2 border-b pb-2">
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="rounded-md text-left transition-colors hover:opacity-80"
                    aria-label={`เปิดวัน ${format(day, 'd MMMM', { locale: th })}`}
                  >
                    <div className="text-xs text-muted-foreground">
                      {format(day, 'EEE', { locale: th })}
                    </div>
                    <div
                      className={cn(
                        'font-semibold',
                        isToday &&
                          'flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground',
                      )}
                    >
                      {format(day, 'd')}
                    </div>
                  </button>
                  {isToday && <Badge variant="info">วันนี้</Badge>}
                </div>
                <div className="space-y-2">
                  {dayItems.map((item) => renderEvent(item, 'week'))}
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
  );
}

function DayView({
  dayItems,
  loading,
  renderEvent,
}: {
  dayItems: DeliveryCalendarItem[];
  loading: boolean;
  renderEvent: RenderEvent;
}) {
  // แยกเที่ยวที่ไม่ระบุเวลาไว้บนสุด ที่เหลือจัดเข้าแถวชั่วโมงตาม plannedTime
  const untimed = dayItems.filter((item) => !item.plannedTime);
  const byHour = new Map<number, DeliveryCalendarItem[]>();
  dayItems.forEach((item) => {
    if (!item.plannedTime) return;
    const hour = Number.parseInt(item.plannedTime.slice(0, 2), 10);
    if (Number.isNaN(hour)) return;
    byHour.set(hour, [...(byHour.get(hour) ?? []), item]);
  });

  return (
    <Card className="overflow-hidden">
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด
        </div>
      ) : dayItems.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-6 w-6" />
          ไม่มีรอบส่งในวันนี้
        </div>
      ) : (
        <div>
          {untimed.length > 0 && (
            <div className="grid grid-cols-[64px_1fr] border-b bg-muted/30">
              <div className="px-2 py-3 text-right text-xs text-muted-foreground">ไม่ระบุ</div>
              <div className="space-y-1.5 border-l py-2 pl-3 pr-3">
                {untimed.map((item) => renderEvent(item, 'day'))}
              </div>
            </div>
          )}
          {DAY_HOURS.map((hour) => {
            const hourItems = byHour.get(hour) ?? [];
            return (
              <div
                key={hour}
                className="grid min-h-[52px] grid-cols-[64px_1fr] border-b last:border-b-0"
              >
                <div className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                  {String(hour).padStart(2, '0')}:00
                </div>
                <div className="space-y-1.5 border-l py-1.5 pl-3 pr-3">
                  {hourItems.map((item) => renderEvent(item, 'day'))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
