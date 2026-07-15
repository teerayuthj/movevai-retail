import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MessengerOrderRole } from '@/lib/messengerJobs';
import { cn } from '@/lib/utils';
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Map as MapIcon,
  Navigation,
  Play,
  Route,
  Users,
} from 'lucide-react';
import { formatPlanningDate, getTodayDateKey } from '@/lib/deliveryPlanning';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { shortRouteCode } from '@/lib/routeCode';
import { getMessengerJobOverdue, getMessengerJobTiming } from '../messengerSchedule';
import {
  cleanMessengerStopName,
  messengerTripCurrentOrder,
  messengerTripProgress,
  messengerTripShortTitle,
  type MessengerTrip,
} from '../messengerTrips';

type TripStatusChip = { tone: 'info' | 'warning' | 'danger'; label: string };

const chipToneClass: Record<TripStatusChip['tone'], string> = {
  info: 'border-info/30 bg-info/10 text-info',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function MessengerTripCard({
  trip,
  role = 'main',
  nowMs = Date.now(),
  accepting = false,
  starting = false,
  onAccept,
  onStart,
  onViewMap,
}: {
  trip: MessengerTrip;
  role?: MessengerOrderRole;
  nowMs?: number;
  accepting?: boolean;
  starting?: boolean;
  onAccept: () => void;
  onStart: () => void;
  onViewMap?: () => void;
}) {
  const first = trip.orders[0];
  const current = messengerTripCurrentOrder(trip);
  const progress = messengerTripProgress(trip);
  const route = first.deliveryRoute;
  const awaitingAcceptance =
    first.status === 'assigned' && route?.requiresAcceptance === true && !route.acceptedAt;
  const isFuture =
    !!first.deliveryPlan?.plannedDate && first.deliveryPlan.plannedDate > getTodayDateKey();
  const isCoDriver = role === 'co';
  const routeNote = first.metadataJson?.dispatch?.routeNote?.trim();

  // เหลือกำหนด: ช่วงรอรับใช้ acceptBy, รับแล้วใช้ startBy — ถ้าไม่มี SLA ค่อยนับถึงเวลานัด
  const deadlineIso = awaitingAcceptance ? route?.acceptBy : route?.startBy;
  const deadlineMs = deadlineIso ? new Date(deadlineIso).getTime() : Number.NaN;
  const deadlineMinutes = Number.isNaN(deadlineMs)
    ? null
    : Math.max(0, Math.ceil(Math.abs(deadlineMs - nowMs) / 60_000));
  const deadlineOverdue = !Number.isNaN(deadlineMs) && deadlineMs < nowMs;
  const overdue = getMessengerJobOverdue(first, nowMs);
  const timing = getMessengerJobTiming(first, nowMs);

  const workflowChip: TripStatusChip | null =
    first.status === 'assigned' && route?.requiresAcceptance
      ? {
          tone: deadlineOverdue ? 'danger' : awaitingAcceptance ? 'warning' : 'info',
          label:
            deadlineMinutes == null
              ? awaitingAcceptance
                ? `ต้องกดรับภายใน ${route.acceptWithinMinutes ?? 15} นาทีหลังมอบหมาย`
                : `ต้องเริ่มเที่ยวภายใน ${route.startWithinMinutes ?? 10} นาทีหลังรับ`
              : deadlineOverdue
                ? awaitingAcceptance
                  ? `เลยเวลารับเที่ยว ${formatElapsedDuration(deadlineMinutes)}`
                  : `เลยเวลาเริ่มเที่ยว ${formatElapsedDuration(deadlineMinutes)}`
                : awaitingAcceptance
                  ? `ต้องกดรับใน ${formatElapsedDuration(deadlineMinutes)}`
                  : `เหลือ ${formatElapsedDuration(deadlineMinutes)} เพื่อเริ่มเที่ยว`,
        }
      : null;
  const statusChip: TripStatusChip | null =
    workflowChip ??
    (overdue
      ? {
          tone: 'danger',
          label:
            overdue.basis === 'urgent_accept'
              ? `งานด่วน · เลยเวลาออกตัว ${formatElapsedDuration(overdue.minutes)}`
              : `เลยเวลานัด ${formatElapsedDuration(overdue.minutes)}`,
        }
      : timing
        ? {
            tone: timing.phase === 'scheduled' ? 'info' : 'warning',
            label:
              timing.phase === 'scheduled'
                ? `อีก ${formatElapsedDuration(timing.minutes)} ถึงเวลานัด`
                : timing.phase === 'upcoming'
                  ? `ใกล้ถึงเวลานัด · อีก ${timing.minutes} นาที`
                  : `ถึงเวลานัดแล้ว · อีก ${timing.minutes} นาทีก่อนเลยเวลา`,
          }
        : null);

  return (
    <article className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
      <div className="border-b border-border/50 bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <Route className="h-3.5 w-3.5" /> เที่ยววิ่ง
              {trip.routeCode && (
                <span className="font-mono" title={trip.routeCode}>
                  · รอบ {shortRouteCode(trip.routeCode)}
                </span>
              )}
            </div>
            <h2 className="mt-1 truncate text-base font-semibold">
              {messengerTripShortTitle(trip)}
            </h2>
          </div>
          <Badge variant="outline" className="shrink-0">
            {progress.completed}/{progress.total} จุด
          </Badge>
        </div>

        {(statusChip || first.deliveryPlan?.plannedDate) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {statusChip && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                  chipToneClass[statusChip.tone],
                )}
              >
                <AlarmClock className="h-3.5 w-3.5" /> {statusChip.label}
              </span>
            )}
            {first.deliveryPlan?.plannedDate && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                นัด {formatPlanningDate(first.deliveryPlan.plannedDate)}
                {first.deliveryPlan.plannedTime && ` · ${first.deliveryPlan.plannedTime} น.`}
              </span>
            )}
          </div>
        )}
      </div>

      {isCoDriver && (
        <div className="flex items-start gap-2 border-b border-info/20 bg-info/5 px-4 py-2.5 text-[12px] text-info">
          <Users className="mt-0.5 h-4 w-4 shrink-0" />
          คุณร่วมเที่ยวนี้ — คนขับหลักเป็นผู้รับและเริ่มเที่ยว
        </div>
      )}

      <section className="px-4 py-3" aria-label="ลำดับวิ่งจริง">
        <div className="text-[11px] font-medium text-muted-foreground">
          ลำดับวิ่งจริง <span aria-hidden="true">·</span>{' '}
          <span className="font-semibold text-foreground">{trip.orders.length}</span> จุด
        </div>
        <ol className="mt-3">
          {trip.orders.map((order, index) => {
            const kind = order.metadataJson?.dispatch?.routeLeg ?? 'dropoff';
            const dispatch = order.metadataJson?.dispatch;
            const isRouteBuilderStop =
              dispatch?.createdVia === 'route_template' ||
              dispatch?.createdVia === 'ad_hoc_route' ||
              Boolean(
                dispatch?.routeRunKey || dispatch?.adHocRouteRunId || dispatch?.routeTemplateRunId,
              );
            const isCurrent = order.id === current.id;
            const done = ['pending_confirmation', 'delivered'].includes(order.status);
            const isLast = index === trip.orders.length - 1;
            return (
              <li
                key={order.id}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-2.5"
              >
                <div className="flex h-full flex-col items-center">
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      done
                        ? 'bg-success/15 text-success'
                        : kind === 'pickup'
                          ? 'bg-info text-white'
                          : 'bg-success text-white',
                    )}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  {!isLast && <span className="my-1 w-0.5 flex-1 rounded-full bg-border" />}
                </div>
                <div className={cn('min-w-0', !isLast && 'pb-5')}>
                  <div className="flex min-w-0 items-baseline gap-1 text-[13px] font-semibold leading-snug">
                    <span className={kind === 'pickup' ? 'text-info' : 'text-success'}>
                      {kind === 'pickup' ? 'รับ' : 'ส่ง'}
                    </span>
                    <span className="text-muted-foreground" aria-hidden="true">
                      ·
                    </span>
                    <span className="min-w-0 break-words">
                      {cleanMessengerStopName(order.customer.name)}
                    </span>
                  </div>
                  <div className="break-words text-[11px] leading-relaxed text-muted-foreground">
                    {order.customer.address}
                  </div>
                  {/* จุดจาก Route Builder เป็น stop ของเที่ยว ไม่ใช่เลขออเดอร์ที่คนขับต้องตีความ */}
                  {!isRouteBuilderStop && order.orderNo && (
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
                      {order.orderNo}
                    </div>
                  )}
                </div>
                <Badge variant={isCurrent ? 'default' : 'muted'} className="shrink-0 text-[10px]">
                  {done ? 'เสร็จแล้ว' : isCurrent ? 'จุดแรก' : 'ถัดไป'}
                </Badge>
              </li>
            );
          })}
        </ol>
      </section>

      {routeNote && (
        <div className="border-t border-warning/20 bg-warning/5 px-4 py-2.5 text-[11px] text-warning">
          หมายเหตุ: {routeNote}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-border/50 p-4">
        {onViewMap && (
          <Button variant="outline" onClick={onViewMap}>
            <MapIcon className="h-4 w-4" /> ดูทั้งเที่ยว
          </Button>
        )}
        {!isCoDriver && awaitingAcceptance ? (
          <Button
            className={cn(!onViewMap && 'col-span-2')}
            disabled={accepting}
            onClick={onAccept}
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
            รับเที่ยวนี้
          </Button>
        ) : !isCoDriver ? (
          <Button
            className={cn(!onViewMap && 'col-span-2')}
            disabled={starting || isFuture}
            onClick={onStart}
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isFuture ? 'ยังไม่ถึงวันออกเที่ยว' : `เริ่มเที่ยว ${trip.orders.length} จุด`}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
