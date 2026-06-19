import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { planningCancelReasonLabel } from '@/data/mock';
import type { PlanningRoute } from '@/lib/retailApi';
import { BellRing, Ban, Clock, RefreshCw, Route, UserCog } from 'lucide-react';

function formatScheduledPush(route: PlanningRoute) {
  if (!route.plannedTime) return null;
  if (route.reminderPushStatus === 'succeeded') return `เตือนเวลา ${route.plannedTime} น. แล้ว`;
  if (route.reminderPushStatus === 'failed') return `เตือนเวลา ${route.plannedTime} น. ไม่สำเร็จ`;
  return `รอเตือนเมื่อถึงเวลา ${route.plannedTime} น.`;
}

function canCancelRoute(route: PlanningRoute) {
  return (
    route.status !== 'cancelled' &&
    route.status !== 'completed' &&
    route.stops.every((stop) => stop.status === 'planned' || stop.status === 'assigned')
  );
}

// ระหว่างทางย้ายเฉพาะจุดที่ยัง assigned ได้ ส่วนจุดที่เริ่มส่งแล้วคงอยู่กับคนขับเดิม
function canReassignRoute(route: PlanningRoute) {
  return (
    route.status !== 'cancelled' &&
    route.status !== 'completed' &&
    route.stops.some((stop) => stop.status === 'planned' || stop.status === 'assigned')
  );
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
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Routes ที่ Publish แล้ว</CardTitle>
        <CardDescription>สถานะงานและ Push notification ของวันที่เลือก</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {routes.map((route) => {
          const cancelled = route.status === 'cancelled';
          return (
            <div
              key={route.id}
              className={
                cancelled
                  ? 'rounded-xl border border-dashed bg-muted/30 p-3 text-xs opacity-80'
                  : 'rounded-xl border p-3 text-xs'
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 font-medium">
                  <Route className="h-4 w-4 shrink-0" />
                  <span className="truncate">{route.code}</span>
                </div>
                {cancelled ? (
                  <Badge variant="muted">
                    <Ban className="h-3 w-3" /> ยกเลิกแล้ว
                  </Badge>
                ) : route.pushStatus !== 'succeeded' ? (
                  <Badge variant={route.pushStatus === 'failed' ? 'warning' : 'secondary'}>
                    <BellRing className="h-3 w-3" /> แจ้งงาน {route.pushStatus}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 text-muted-foreground">
                {route.driver.name} · {route.stops.length} จุดส่ง
              </div>
              {cancelled ? (
                <div className="mt-1 text-muted-foreground">
                  เหตุผล:{' '}
                  {route.cancelReason ? planningCancelReasonLabel[route.cancelReason] : 'ไม่ระบุ'}
                  {route.cancelNote ? ` · ${route.cancelNote}` : ''}
                </div>
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
              {!cancelled && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(route.pushStatus === 'failed' || route.reminderPushStatus === 'failed') && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(route.id)}>
                      <RefreshCw className="h-3.5 w-3.5" /> Retry Push
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canReassignRoute(route)}
                    onClick={() => onReassign(route)}
                  >
                    <UserCog className="h-3.5 w-3.5" /> เปลี่ยนคนขับ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/5"
                    disabled={!canCancelRoute(route)}
                    onClick={() => onCancel(route)}
                  >
                    <Ban className="h-3.5 w-3.5" /> ยกเลิก Route
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
