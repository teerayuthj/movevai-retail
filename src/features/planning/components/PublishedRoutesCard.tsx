import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { planningCancelReasonLabel } from '@/data/mock';
import {
  formatOverdueDuration,
  formatPlanningDate,
  SCHEDULED_DELIVERY_GRACE_MINUTES,
} from '@/lib/deliveryPlanning';
import type { PlanningRoute } from '@/lib/retailApi';
import { cn } from '@/lib/utils';
import { BellRing, Ban, Clock, RefreshCw, Route, UserCog } from 'lucide-react';

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

  const scheduledAt = route.scheduledFor
    ? new Date(route.scheduledFor).getTime()
    : new Date(`${route.plannedDate}T${route.plannedTime}:00+07:00`).getTime();
  const overdueAt = scheduledAt + SCHEDULED_DELIVERY_GRACE_MINUTES * 60_000;
  if (Number.isNaN(scheduledAt) || nowMs < overdueAt) return null;
  return Math.floor((nowMs - scheduledAt) / 60_000);
}

export function PublishedRoutesCard({
  routes,
  onRetry,
  onCancel,
  onReassign,
}: {
  routes: PlanningRoute[];
  onRetry: (routeId: string) => void;
  onCancel: (route: PlanningRoute) => void;
  onReassign: (route: PlanningRoute) => void;
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
          ดูสถานะของวันที่เลือก ยกเลิก/ดึงกลับ หรือเปลี่ยนคนขับของรอบที่ปล่อยแล้ว —
          งานที่เลยกำหนดแล้วจัดการที่หน้าติดตามการจัดส่ง
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {routes.map((route) => {
          const cancelled = route.status === 'cancelled';
          const overdueMinutes = getRouteOverdueMinutes(route, nowMs);
          return (
            <div
              key={route.id}
              className={cn(
                'rounded-xl border p-3 text-xs',
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
                ) : null}
              </div>
              <div className="mt-2 text-muted-foreground">
                {route.driver.name}
                {!cancelled && ` · ${route.stops.length} จุดส่ง`}
              </div>
              <div className="mt-1 flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                นัดส่ง {formatPlanningDate(route.plannedDate)} ·{' '}
                {route.plannedTime ? `${route.plannedTime} น.` : 'ไม่ระบุเวลา'}
              </div>
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
              {route.status !== 'cancelled' && route.status !== 'completed' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(route.pushStatus === 'failed' || route.reminderPushStatus === 'failed') && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(route.id)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Push
                    </Button>
                  )}
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
