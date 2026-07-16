import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MapPinned,
  Navigation,
  RefreshCw,
  Route,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { formatTHB } from '@/data/orderTypes';
import type { DriverActivityItem, DriverStats, DriverStatsPeriodDays } from '@/lib/retailApi';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatKm } from '../utils/driverInfo';

type DriverAuditPanelProps = {
  stats: DriverStats | null;
  loading: boolean;
  days: DriverStatsPeriodDays;
  onDaysChange: (days: DriverStatsPeriodDays) => void;
  onRefresh: () => void;
  onOpenTrackingHistory?: () => void;
};

const platformLabel: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPeriodDate(value: string) {
  return new Date(value).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function activityPresentation(item: DriverActivityItem): {
  title: string;
  detail: string;
  badge: string;
  variant: BadgeProps['variant'];
  icon: typeof Route;
} {
  const stops = `${item.deliveredStops}/${item.stopTotal} จุด`;
  switch (item.type) {
    case 'route_assigned':
      return {
        title: 'ได้รับมอบหมายเที่ยว',
        detail: `${item.stopTotal} จุดงาน`,
        badge: 'มอบหมาย',
        variant: 'info',
        icon: CalendarClock,
      };
    case 'route_accepted':
      return item.lateMinutes && item.lateMinutes > 0
        ? {
            title: 'กดรับเที่ยวช้า',
            detail: `หลังมอบหมาย ${formatElapsedDuration(item.responseMinutes ?? 0)} · ช้า ${formatElapsedDuration(item.lateMinutes)}`,
            badge: 'รับช้า',
            variant: 'destructive',
            icon: Clock3,
          }
        : {
            title: 'กดรับเที่ยวตรงเวลา',
            detail: `หลังมอบหมาย ${formatElapsedDuration(item.responseMinutes ?? 0)}`,
            badge: 'ตรงเวลา',
            variant: 'success',
            icon: CheckCircle2,
          };
    case 'acceptance_overdue':
      return {
        title: 'เลยกำหนดรับเที่ยว',
        detail: 'ยังไม่กดยืนยันรับงาน',
        badge: 'ต้องติดตาม',
        variant: 'warning',
        icon: AlertTriangle,
      };
    case 'tracking_summary':
      return {
        title: 'บันทึก GPS ของเที่ยว',
        detail: `${item.sessionCount ?? 0} session · ${item.pointCount ?? 0} จุด GPS · ${formatKm(item.distanceMeters ?? 0)}${(item.offRouteCount ?? 0) > 0 ? ` · หลุดเส้นทาง ${item.offRouteCount} ครั้ง` : ''}`,
        badge: (item.sessionCount ?? 0) > 1 ? 'หลาย session' : 'GPS',
        variant: (item.sessionCount ?? 0) > 1 ? 'warning' : 'muted',
        icon: Navigation,
      };
    case 'route_completed':
      return {
        title: 'จบเที่ยว',
        detail: `ส่งสำเร็จ ${stops}`,
        badge: 'จบแล้ว',
        variant: 'success',
        icon: CheckCircle2,
      };
    case 'route_cancelled':
      return {
        title: 'เที่ยวถูกยกเลิก',
        detail: item.cancelReason ? `เหตุผล: ${item.cancelReason}` : 'ไม่นับเป็นงานรับช้า',
        badge: 'ยกเลิก',
        variant: 'muted',
        icon: XCircle,
      };
  }
}

function PeriodSelect({
  days,
  onChange,
}: {
  days: DriverStatsPeriodDays;
  onChange: (days: DriverStatsPeriodDays) => void;
}) {
  return (
    <Select
      aria-label="ช่วงเวลาข้อมูลคนขับ"
      value={days}
      containerClassName="w-32"
      onChange={(event) => onChange(Number(event.target.value) as DriverStatsPeriodDays)}
    >
      <option value={7}>7 วัน</option>
      <option value={30}>30 วัน</option>
      <option value={90}>90 วัน</option>
    </Select>
  );
}

export function DriverAuditPanel({
  stats,
  loading,
  days,
  onDaysChange,
  onRefresh,
  onOpenTrackingHistory,
}: DriverAuditPanelProps) {
  const [visibleActivityCount, setVisibleActivityCount] = useState(25);
  const [visibleCompletedCount, setVisibleCompletedCount] = useState(10);
  const [expandedCompletedId, setExpandedCompletedId] = useState<string | null>(null);
  const completedActivities =
    stats?.activities.filter((item) => item.type === 'route_completed') ?? [];

  useEffect(() => {
    setVisibleActivityCount(25);
    setVisibleCompletedCount(10);
    setExpandedCompletedId(null);
  }, [days, stats?.driver.id]);

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Activity className="h-4 w-4" />
            การทำงานของ Messenger
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ดูสถานะปัจจุบัน ผลงาน และเหตุการณ์ย้อนหลังโดยไม่ดึงข้อมูลตลอดอายุระบบ
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRefresh}
          disabled={loading}
          aria-label="รีเฟรชข้อมูลคนขับ"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {loading || !stats ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลดข้อมูลย้อนหลัง {days} วัน
        </div>
      ) : (
        <Tabs defaultValue="activity">
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger value="today">วันนี้</TabsTrigger>
            <TabsTrigger value="performance">ผลงาน</TabsTrigger>
            <TabsTrigger value="completed">
              เที่ยวสำเร็จ
              {stats.totals.completedRoutes > 0 ? ` (${stats.totals.completedRoutes})` : ''}
            </TabsTrigger>
            <TabsTrigger value="activity">กิจกรรมย้อนหลัง</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <Smartphone className="h-4 w-4" /> สถานะ Messenger
                    </div>
                    {stats.presence ? (
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div>ล่าสุด {formatDateTime(stats.presence.lastHeartbeatAt)}</div>
                        <div>
                          {platformLabel[stats.presence.platform] ?? stats.presence.platform} ·{' '}
                          {stats.presence.appState === 'foreground'
                            ? 'เปิดใช้งานอยู่'
                            : 'อยู่เบื้องหลัง'}
                        </div>
                        <div>
                          GPS{' '}
                          {stats.presence.locationAccuracy == null
                            ? 'ยังไม่มีค่าความแม่นยำ'
                            : `แม่นยำประมาณ ${Math.round(stats.presence.locationAccuracy)} ม.`}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        ยังไม่พบการเชื่อมต่อจาก Messenger
                      </p>
                    )}
                  </div>
                  <Badge variant={stats.presence?.isOnline ? 'success' : 'muted'}>
                    {stats.presence?.isOnline ? 'ออนไลน์' : 'ออฟไลน์'}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4" /> ต้องจัดการตอนนี้
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {stats.acceptance.overdueUnacceptedRoutes > 0
                        ? `มี ${stats.acceptance.overdueUnacceptedRoutes} เที่ยวที่ยังไม่รับเกินกำหนด`
                        : 'ไม่มีเที่ยวค้างรับเกินกำหนด'}
                    </p>
                  </div>
                  <Badge
                    variant={stats.acceptance.overdueUnacceptedRoutes > 0 ? 'warning' : 'success'}
                  >
                    {stats.acceptance.overdueUnacceptedRoutes > 0
                      ? `${stats.acceptance.overdueUnacceptedRoutes} รายการ`
                      : 'ปกติ'}
                  </Badge>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-medium">ผลงานในช่วง {stats.period.days} วัน</h4>
                <p className="text-xs text-muted-foreground">
                  {formatPeriodDate(stats.period.from)} – {formatPeriodDate(stats.period.to)}
                </p>
              </div>
              <PeriodSelect days={days} onChange={onDaysChange} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: 'รับเที่ยวตรงเวลา',
                  value:
                    stats.acceptance.onTimeRatePercent == null
                      ? '—'
                      : `${stats.acceptance.onTimeRatePercent}%`,
                  hint: `${stats.acceptance.onTimeRoutes} เที่ยวตรงเวลา`,
                },
                {
                  label: 'จุดงานสำเร็จ',
                  value: stats.totals.completedOrders,
                  hint: `จบ ${stats.totals.completedRoutes} เที่ยว`,
                },
                {
                  label: 'ระยะทาง GPS',
                  value: formatKm(stats.totals.distanceMeters),
                  hint: `${stats.totals.trackingSessions} session`,
                },
                {
                  label: 'หลุดเส้นทาง',
                  value: stats.totals.offRouteCount,
                  hint: 'เหตุที่ระบบตรวจพบ',
                },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{item.value}</div>
                  <div className="text-[11px] text-muted-foreground">{item.hint}</div>
                </div>
              ))}
            </div>

            <section className="rounded-lg border bg-muted/10 p-3">
              <h4 className="text-sm font-medium">การตอบรับเที่ยว</h4>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  { label: 'ตรงเวลา', value: stats.acceptance.onTimeRoutes },
                  { label: 'รับช้า', value: stats.acceptance.lateRoutes },
                  {
                    label: 'ยังไม่รับเกินกำหนด',
                    value: stats.acceptance.overdueUnacceptedRoutes,
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-md bg-background p-2.5">
                    <div className="text-[11px] text-muted-foreground">{item.label}</div>
                    <div className="text-base font-semibold tabular-nums">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 divide-y rounded-md border bg-background">
                {stats.recentAcceptances.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">
                    ไม่มีเที่ยวที่ต้องกดยืนยันในช่วงนี้
                  </p>
                ) : (
                  stats.recentAcceptances.map((item) => (
                    <div
                      key={item.routeId}
                      className="flex flex-col gap-2 p-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-mono font-medium">{item.routeCode}</div>
                        <div className="text-muted-foreground">
                          มอบหมาย {formatDateTime(item.publishedAt)} · กำหนด{' '}
                          {formatDateTime(item.acceptBy)}
                        </div>
                      </div>
                      <Badge
                        variant={
                          item.state === 'on_time'
                            ? 'success'
                            : item.state === 'late'
                              ? 'destructive'
                              : item.state === 'overdue_unaccepted'
                                ? 'warning'
                                : 'muted'
                        }
                      >
                        {item.state === 'on_time'
                          ? 'ตรงเวลา'
                          : item.state === 'late'
                            ? `รับช้า ${formatElapsedDuration(item.lateMinutes)}`
                            : item.state === 'overdue_unaccepted'
                              ? 'ยังไม่รับเกินกำหนด'
                              : 'รอรับ'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="completed" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-medium">
                  เที่ยวที่จบสำเร็จในช่วง {stats.period.days} วัน
                </h4>
                <p className="text-xs text-muted-foreground">
                  {stats.totals.completedOrders} จุดงาน จาก {stats.totals.completedRoutes} เที่ยว
                </p>
              </div>
              <PeriodSelect days={days} onChange={onDaysChange} />
            </div>

            {completedActivities.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                ไม่มีเที่ยวที่จบสำเร็จในช่วง {stats.period.days} วัน
              </div>
            ) : (
              <div className="divide-y rounded-lg border bg-background">
                {completedActivities.slice(0, visibleCompletedCount).map((item) => {
                  const expanded = expandedCompletedId === item.id;
                  const stops = item.completedStops ?? [];
                  return (
                    <article key={item.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-2 p-3 text-left text-sm transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                        onClick={() => setExpandedCompletedId(expanded ? null : item.id)}
                        aria-expanded={expanded}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-mono font-medium">{item.routeCode}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            จบเมื่อ {formatDateTime(item.at)} · สำเร็จ {item.deliveredStops}/
                            {item.stopTotal} จุด
                            {item.failedStops > 0 ? ` · ไม่สำเร็จ ${item.failedStops} จุด` : ''}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="success">
                            <CheckCircle2 className="h-3.5 w-3.5" /> จบแล้ว
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {expanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                          </span>
                          {expanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t bg-muted/10 px-3 py-3">
                          {stops.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              ยังไม่มีรายละเอียดจุดงานจาก backend กรุณารีเฟรชหลังอัปเดต API
                            </p>
                          ) : (
                            <ol className="space-y-2">
                              {stops.map((stop) => (
                                <li
                                  key={stop.id}
                                  className="grid gap-2 rounded-md border bg-background p-3 text-xs sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted font-semibold tabular-nums">
                                      {stop.sequence}
                                    </span>
                                    <Badge
                                      variant={stop.routeLeg === 'pickup' ? 'info' : 'success'}
                                    >
                                      {stop.routeLeg === 'pickup' ? 'รับ' : 'ส่ง'}
                                    </Badge>
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span className="font-mono font-medium">{stop.orderNo}</span>
                                      <span className="font-medium">{stop.customerName}</span>
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      {stop.customerAddress}
                                    </div>
                                    <div className="mt-1 text-muted-foreground">
                                      {stop.customerPhone} · เสร็จเมื่อ{' '}
                                      {formatDateTime(stop.completedAt)}
                                    </div>
                                  </div>
                                  <div className="flex items-start justify-between gap-2 sm:flex-col sm:items-end">
                                    <Badge
                                      variant={
                                        stop.status === 'delivered' ? 'success' : 'destructive'
                                      }
                                    >
                                      {stop.status === 'delivered' ? 'สำเร็จ' : 'ไม่สำเร็จ'}
                                    </Badge>
                                    <span className="font-medium tabular-nums">
                                      {formatTHB(stop.totalValue)}
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {visibleCompletedCount < completedActivities.length && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setVisibleCompletedCount((current) => current + 10)}
              >
                แสดงเพิ่มอีก 10 เที่ยว
              </Button>
            )}

            {completedActivities.length < stats.totals.completedRoutes && (
              <p className="text-[11px] text-muted-foreground">
                รายการด้านบนเป็นประวัติล่าสุดที่ backend ส่งกลับมา ส่วนยอดรวมทั้งหมดในช่วงนี้คือ{' '}
                {stats.totals.completedRoutes} เที่ยว
              </p>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-medium">กิจกรรมย้อนหลัง {stats.period.days} วัน</h4>
                <p className="text-xs text-muted-foreground">
                  รวมเป็นระดับเที่ยว ไม่แสดง GPS session ซ้ำเป็นคนละเที่ยว
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <PeriodSelect days={days} onChange={onDaysChange} />
                {onOpenTrackingHistory && (
                  <Button size="sm" variant="outline" onClick={onOpenTrackingHistory}>
                    <MapPinned className="h-4 w-4" /> ดูแผนที่
                  </Button>
                )}
              </div>
            </div>

            {stats.activities.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                ไม่มีกิจกรรมในช่วง {stats.period.days} วัน
              </div>
            ) : (
              <div className="relative space-y-0 before:absolute before:bottom-5 before:left-[75px] before:top-5 before:w-px before:bg-border">
                {stats.activities.slice(0, visibleActivityCount).map((item) => {
                  const presentation = activityPresentation(item);
                  const Icon = presentation.icon;
                  return (
                    <div
                      key={item.id}
                      className="relative grid grid-cols-[64px_22px_minmax(0,1fr)] gap-2 pb-4 text-sm"
                    >
                      <div className="pt-1 text-right text-[11px] text-muted-foreground">
                        {new Date(item.at).toLocaleDateString('th-TH', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        <br />
                        {new Date(item.at).toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <span className="relative z-10 mt-1 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="font-medium">{presentation.title}</div>
                            <div className="font-mono text-xs">{item.routeCode}</div>
                          </div>
                          <Badge variant={presentation.variant}>{presentation.badge}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {presentation.detail}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {visibleActivityCount < stats.activities.length && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setVisibleActivityCount((current) => current + 25)}
              >
                แสดงเพิ่มอีก 25 รายการ
              </Button>
            )}

            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Route className="h-3.5 w-3.5" />
              Backend จำกัดข้อมูลไว้ที่ {stats.period.days} วัน, สูงสุด {stats.period.routeLimit}{' '}
              เที่ยว และ {stats.period.activityLimit} เหตุการณ์
            </div>
          </TabsContent>
        </Tabs>
      )}
    </section>
  );
}
