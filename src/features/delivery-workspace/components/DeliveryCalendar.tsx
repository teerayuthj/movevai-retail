import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, addWeeks, format, parseISO, startOfWeek } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  RefreshCw,
  Route,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import type { Driver } from '@/data/orderTypes';
import { fetchDeliveryCalendar, type DeliveryCalendarItem } from '@/lib/retailApi';
import { getTodayDateKey } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';

type CalendarFilter = 'all' | 'planned' | 'released' | 'urgent' | 'completed' | 'cancelled';

type Props = {
  drivers: Driver[];
  refreshKey: number;
  onOpenManage: (orderId?: string, mode?: 'immediate' | 'planning') => void;
  onOpenTracking: (orderId?: string) => void;
};

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

export function DeliveryCalendar({ drivers, refreshKey, onOpenManage, onOpenTracking }: Props) {
  const initialWeek = startOfWeek(parseISO(getTodayDateKey()), { weekStartsOn: 1 });
  const [weekStart, setWeekStart] = useState(initialWeek);
  const [driverCode, setDriverCode] = useState('');
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const [items, setItems] = useState<DeliveryCalendarItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      const response = await fetchDeliveryCalendar({
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
  }, [dateFrom, dateTo, driverCode]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar, refreshKey, requestKey]);

  const visibleItems = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [filter, items],
  );
  const selectedItem =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0] ?? null;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {format(days[0], 'd MMM', { locale: th })}–
              {format(days[6], 'd MMM yyyy', { locale: th })}
            </h2>
            <Badge variant="secondary" className="gap-1">
              <Eye className="h-3 w-3" /> ดูอย่างเดียว
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            แสดงแผนและ Route ที่สร้างจากมุมมอง “จัดการงาน” แล้ว
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
                      {dayItems.map((item) => {
                        const status = calendarStatus(item);
                        const selected = selectedItem?.id === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setSelectedId(item.id)}
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
                                {item.code}
                              </span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                {item.plannedTime ?? 'ไม่ระบุเวลา'}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs font-medium">
                              {item.driver?.name ?? 'รอเลือก Messenger'}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <Badge variant={status.variant} className="h-5 px-1.5 text-[10px]">
                                {status.label}
                              </Badge>
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                {item.orderCount} จุด
                              </Badge>
                            </div>
                          </button>
                        );
                      })}
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

      {selectedItem && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Route className="h-4 w-4" /> {selectedItem.code}
                </CardTitle>
                <div className="mt-1 text-xs text-muted-foreground">
                  {selectedItem.plannedDate} ·{' '}
                  {selectedItem.plannedTime ? `${selectedItem.plannedTime} น.` : 'ไม่ระบุเวลา'}
                </div>
              </div>
              <Badge variant={calendarStatus(selectedItem).variant}>
                {calendarStatus(selectedItem).label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-[11px] text-muted-foreground">Messenger</div>
                <div className="font-medium">{selectedItem.driver?.name ?? 'ยังไม่เลือก'}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground">จำนวนจุดส่ง</div>
                <div className="font-medium">{selectedItem.orderCount} จุด</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[11px] text-muted-foreground">ลูกค้า</div>
                <div className="font-medium">
                  {selectedItem.orders.map((order) => order.customerName).join(', ')}
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {selectedItem.kind === 'plan' ? (
                <Button onClick={() => onOpenManage(selectedItem.orders[0]?.id, 'planning')}>
                  <CalendarDays className="h-4 w-4" /> ไปที่จัดการงาน
                </Button>
              ) : (
                <Button onClick={() => onOpenTracking(selectedItem.orders[0]?.id)}>
                  <Route className="h-4 w-4" /> ไปที่ติดตามการจัดส่ง
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
