import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { planningCancelReasonLabel, statusLabel } from '@/data/orderTypes';
import {
  formatOverdueDuration,
  formatPlanningDate,
  getPlanningDateTimeMs,
  SCHEDULED_DELIVERY_GRACE_MINUTES,
} from '@/lib/deliveryPlanning';
import type { PlanningRoute } from '@/lib/retailApi';
import { cn } from '@/lib/utils';
import { formatRouteDistance } from '@/lib/routeDistance';
import { BellRing, Ban, Clock, Info, RefreshCw, Route, UserCog } from 'lucide-react';

const ACTIVE_ORDER_STATUSES = new Set(['in_transit', 'pending_confirmation', 'returning']);
const CLOSED_ORDER_STATUSES = new Set(['delivered', 'failed', 'cancelled', 'returned']);

function formatPulledBackAt(value?: string) {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

function formatScheduledPush(route: PlanningRoute) {
  if (!route.plannedTime) return null;
  if (route.reminderPushStatus === 'succeeded') return `เตือนเวลา ${route.plannedTime} น. แล้ว`;
  if (route.reminderPushStatus === 'failed') return `เตือนเวลา ${route.plannedTime} น. ไม่สำเร็จ`;
  return `รอเตือนเมื่อถึงเวลา ${route.plannedTime} น.`;
}

function getRouteOverdueMinutes(route: PlanningRoute, nowMs: number) {
  if (route.status === 'cancelled' || route.status === 'completed' || !route.plannedTime)
    return null;

  const scheduledAt =
    getPlanningDateTimeMs(route.plannedDate, route.plannedTime) ??
    (route.scheduledFor ? new Date(route.scheduledFor).getTime() : null);
  if (scheduledAt == null) return null;
  const overdueAt = scheduledAt + SCHEDULED_DELIVERY_GRACE_MINUTES * 60_000;
  if (Number.isNaN(scheduledAt) || nowMs < overdueAt) return null;
  return Math.floor((nowMs - scheduledAt) / 60_000);
}

function canEditPublishedRoute(route: PlanningRoute) {
  return (
    route.status === 'published' &&
    route.stops.length > 0 &&
    route.stops.every((stop) => stop.order.status === 'assigned')
  );
}

function getRouteStatusBadge(route: PlanningRoute) {
  if (route.status === 'cancelled') return null;
  if (route.status === 'completed') return { variant: 'success' as const, label: 'ส่งครบแล้ว' };
  if (route.stops.some((stop) => stop.order.status === 'pending_confirmation')) {
    return { variant: 'warning' as const, label: 'รอตรวจสอบ' };
  }
  if (route.stops.some((stop) => ACTIVE_ORDER_STATUSES.has(stop.order.status))) {
    return { variant: 'info' as const, label: 'เริ่มจัดส่งแล้ว' };
  }
  if (
    route.stops.length > 0 &&
    route.stops.every((stop) => CLOSED_ORDER_STATUSES.has(stop.order.status))
  ) {
    return { variant: 'muted' as const, label: 'ปิดงานแล้ว' };
  }
  return { variant: 'secondary' as const, label: 'รอคนขับรับ' };
}

export function PublishedRoutesCard({
  routes,
  onRetry,
  onCancel,
  onReassign,
  onViewRoute,
  selectedRouteId,
}: {
  routes: PlanningRoute[];
  onRetry: (routeId: string) => void;
  onCancel: (route: PlanningRoute) => void;
  onReassign: (route: PlanningRoute) => void;
  onViewRoute: (route: PlanningRoute) => void;
  selectedRouteId?: string | null;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Routes ที่ Publish แล้ว</CardTitle>
        <CardDescription>
          ดูสถานะของวันที่เลือก เปลี่ยนคนขับหรือดึงกลับได้เฉพาะรอบที่ยังรอคนขับรับ —
          รอบที่เริ่มจัดส่งแล้วให้จัดการต่อที่หน้าติดตามการจัดส่ง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {routes.map((route) => {
          const cancelled = route.status === 'cancelled';
          const editable = canEditPublishedRoute(route);
          const statusBadge = getRouteStatusBadge(route);
          const overdueMinutes = getRouteOverdueMinutes(route, nowMs);
          return (
            <div
              key={route.id}
              className={cn(
                'rounded-xl border p-3 text-xs',
                selectedRouteId === route.id && 'border-primary bg-primary/5',
                cancelled && 'border-dashed bg-muted/30 opacity-80',
                overdueMinutes != null &&
                  'border-destructive/50 border-l-4 border-l-destructive bg-destructive/5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 font-medium">
                  <Route className="h-4 w-4 shrink-0" />
                  <span className="truncate">{route.code}</span>
                </div>
                {cancelled ? (
                  <Badge variant="muted">
                    <Ban className="h-3 w-3" /> ดึงกลับแล้ว
                  </Badge>
                ) : route.pushStatus === 'failed' ? (
                  <Badge variant="warning">
                    <BellRing className="h-3 w-3" /> แจ้งงานไม่สำเร็จ
                  </Badge>
                ) : statusBadge ? (
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                ) : null}
              </div>
              <div className="mt-2 text-muted-foreground">
                {route.driver.name}
                {!cancelled && ` · ${route.stops.length} จุดส่ง`}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                นัดส่ง {formatPlanningDate(route.plannedDate)} ·{' '}
                {route.plannedTime ? `${route.plannedTime} น.` : 'ไม่ระบุเวลา'}
              </div>
              {route.plannedDistanceMeters != null && route.plannedDistanceMeters > 0 && (
                <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                  <Route className="h-3 w-3 shrink-0" />
                  ระยะตามถนนประมาณ {formatRouteDistance(route.plannedDistanceMeters)}
                </div>
              )}
              {route.plannedDistanceMeters != null && route.plannedDistanceMeters > 0 && (
                <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  คำนวณจากเส้นทางถนน ไม่รวมสภาพจราจร
                </div>
              )}
              {overdueMinutes != null && (
                <Badge variant="destructive" className="mt-2">
                  <Clock className="h-3 w-3" />
                  {formatOverdueDuration(overdueMinutes)}
                </Badge>
              )}
              {cancelled ? (
                <>
                  {formatPulledBackAt(route.cancelledAt) && (
                    <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      ดึงกลับเข้า Planning เมื่อ {formatPulledBackAt(route.cancelledAt)}
                    </div>
                  )}
                  <div className="mt-1 text-muted-foreground">
                    เหตุผล:{' '}
                    {route.cancelReason ? planningCancelReasonLabel[route.cancelReason] : 'ไม่ระบุ'}
                    {route.cancelNote ? ` · ${route.cancelNote}` : ''}
                  </div>
                </>
              ) : (
                formatScheduledPush(route) && (
                  <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    {formatScheduledPush(route)}
                  </div>
                )
              )}
              {!cancelled && route.pushError && (
                <div className="mt-2 text-destructive">{route.pushError}</div>
              )}
              {!cancelled && route.reminderPushError && (
                <div className="mt-2 text-destructive">{route.reminderPushError}</div>
              )}
              {route.status !== 'cancelled' && route.status !== 'completed' && !editable && (
                <div className="mt-2 rounded-lg border border-info/25 bg-info/5 px-3 py-2 text-[11px] text-muted-foreground">
                  Route นี้เริ่มเข้าขั้นตอนจัดส่งแล้ว ให้จัดการต่อที่หน้าติดตามการจัดส่ง
                  {route.stops[0]?.order.status
                    ? ` · สถานะล่าสุด: ${statusLabel[route.stops[0].order.status]}`
                    : ''}
                </div>
              )}
              {route.status !== 'cancelled' && route.status !== 'completed' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {route.plannedGeometryJson && route.plannedGeometryJson.length > 1 && (
                    <Button size="sm" variant="outline" onClick={() => onViewRoute(route)}>
                      <Route className="h-3.5 w-3.5" /> ดูเส้นทาง
                    </Button>
                  )}
                  {(route.pushStatus === 'failed' || route.reminderPushStatus === 'failed') && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(route.id)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Push
                    </Button>
                  )}
                  {editable && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => onReassign(route)}>
                        <UserCog className="h-3.5 w-3.5" /> เปลี่ยนคนขับ
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive/5"
                        onClick={() => onCancel(route)}
                      >
                        <Ban className="h-3.5 w-3.5" /> ดึงกลับเข้า Planning
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {routes.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            ยังไม่มี Route ที่ Publish ในวันนี้
          </div>
        )}
      </CardContent>
    </Card>
  );
}
