import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  canReviseDeliveryProof,
  deliveryProofRevisionLimits,
  getDeliveryProofRevisionCount,
} from '@/state/retail/delivery';
import { paymentLabel, type Order } from '@/data/orderTypes';
import {
  ArrowDown,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Image,
  IdCard,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Navigation,
  Package,
  PackageOpen,
  Phone,
  PenLine,
  Users,
} from 'lucide-react';
import { formatOverdueDuration, formatPlanningDate, getTodayDateKey } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import {
  canMessengerStartJob,
  formatInTransitStartTime,
  getMessengerAppointmentCountdown,
  getMessengerJobAcceptanceOpensAt,
  getMessengerJobOverdue,
  getMessengerJobTiming,
  SCHEDULED_DELIVERY_ACCEPTANCE_LEAD_MINUTES,
} from '../messengerSchedule';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { navigationUrl } from '../geocode';
import type { AssignedOrderOverdue } from '@/lib/deliveryPlanning';
import type { MessengerOrderRole } from '@/lib/messengerJobs';
import { dispatchJobTypeLabel, getDispatchJobType } from '@/features/dispatch/types';

type RoutePairStop = {
  id: string;
  kind: 'pickup' | 'dropoff';
  name: string;
  address?: string;
  contact?: string;
  phone?: string;
  isCurrent: boolean;
};

function cleanStopName(name: string) {
  return name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim();
}

function hasUsablePhone(phone?: string) {
  return !!phone?.trim() && phone.trim() !== '-';
}

function buildRoutePair(order: Order, relatedOrders: Order[]) {
  const dispatch = order.metadataJson?.dispatch;
  const currentLeg = dispatch?.routeLeg ?? 'dropoff';
  const currentName = cleanStopName(order.customer.name);
  const relatedStop = (stopId?: string) => {
    if (!stopId) return undefined;
    return relatedOrders.find((candidate) => {
      const candidateDispatch = candidate.metadataJson?.dispatch;
      const sameRoute =
        (!!order.deliveryRoute?.id && candidate.deliveryRoute?.id === order.deliveryRoute.id) ||
        (!!dispatch?.routeTemplateRunId &&
          candidateDispatch?.routeTemplateRunId === dispatch.routeTemplateRunId) ||
        (!!dispatch?.adHocRouteRunId &&
          candidateDispatch?.adHocRouteRunId === dispatch.adHocRouteRunId) ||
        (!!dispatch?.routeRunKey && candidateDispatch?.routeRunKey === dispatch.routeRunKey);
      return sameRoute && candidateDispatch?.stopId === stopId;
    });
  };
  const currentStop: RoutePairStop = {
    id: dispatch?.stopId ?? order.id,
    kind: currentLeg,
    name: currentName,
    address: order.customer.address,
    contact: dispatch?.contactName,
    phone: order.customer.phone,
    isCurrent: true,
  };

  const pickupStops: RoutePairStop[] =
    currentLeg === 'pickup'
      ? [currentStop]
      : dispatch?.pickupFrom?.length
        ? dispatch.pickupFrom.map((pickup, index) => {
            const related = relatedStop(pickup.stopId);
            return {
              id: pickup.stopId ?? `pickup-${index}`,
              kind: 'pickup' as const,
              name: pickup.name,
              address: pickup.address ?? related?.customer.address,
              contact: related?.metadataJson?.dispatch?.contactName,
              phone: related?.customer.phone,
              isCurrent: false,
            };
          })
        : dispatch?.pickup
          ? [
              {
                id: 'pickup',
                kind: 'pickup' as const,
                name: dispatch.pickup.name,
                address: dispatch.pickup.address,
                phone: dispatch.pickup.phone,
                isCurrent: false,
              },
            ]
          : [];

  const dropoffStop: RoutePairStop | null =
    currentLeg === 'dropoff'
      ? currentStop
      : dispatch?.deliverTo?.name
        ? (() => {
            const related = relatedStop(dispatch.deliverTo.stopId);
            return {
              id: dispatch.deliverTo.stopId ?? 'dropoff',
              kind: 'dropoff' as const,
              name: dispatch.deliverTo.name,
              address: related?.customer.address,
              contact: related?.metadataJson?.dispatch?.contactName,
              phone: related?.customer.phone,
              isCurrent: false,
            };
          })()
        : null;

  const routeTitle = dispatch?.messengerTitle?.trim() ?? '';
  const showRouteTitle = routeTitle.length > 0;
  const positionLabel =
    typeof dispatch?.stopIndex === 'number' && dispatch.stopCount
      ? `${dispatch.stopIndex + 1}/${dispatch.stopCount} จุด`
      : null;

  return {
    currentLeg,
    currentStop,
    pickupStops,
    dropoffStop,
    routeTitle,
    showRouteTitle,
    positionLabel,
    hasPair: pickupStops.length > 0 && dropoffStop != null,
  };
}

// งานด่วนไม่มีเวลานัด → เส้นตายคือ SLA รับงาน (dispatch + 5 นาที) ต้องไม่พูดว่า "เวลานัด"
function formatMessengerDueLabel(overdue: AssignedOrderOverdue) {
  if (overdue.basis === 'urgent_accept') {
    return overdue.minutes < 1
      ? 'งานด่วน · ควรออกตัวได้แล้ว'
      : `งานด่วน · เลยเวลาออกตัว ${formatElapsedDuration(overdue.minutes)}`;
  }
  return formatOverdueDuration(overdue.minutes);
}

export function JobCard({
  order,
  nowMs = Date.now(),
  onStart,
  onAccept,
  onClose,
  onViewMap,
  starting = false,
  accepting = false,
  role = 'main',
  relatedOrders = [],
}: {
  order: Order;
  nowMs?: number;
  onStart: () => void;
  onAccept: () => void;
  onClose: () => void;
  /** เปิดแผนที่โฟกัสปลายทางของงานนี้โดยเฉพาะ (แยกจากภาพรวมทั้ง Route) */
  onViewMap?: () => void;
  /** กำลังเริ่มงานนี้อยู่ (ระหว่างรอ backend) — disable ปุ่ม + แสดงสถานะ */
  starting?: boolean;
  /** กำลังรับงานจาก backend */
  accepting?: boolean;
  /** บทบาทของ messenger คนนี้ — co (คนขับร่วม) ดูงานได้แต่เริ่ม/ปิดงานไม่ได้ */
  role?: MessengerOrderRole;
  /** งานอื่นในเที่ยวเดียวกัน ใช้เติมที่อยู่/ผู้ติดต่อของปลายทางในคู่รับ–ส่ง */
  relatedOrders?: Order[];
}) {
  const isCoDriver = role === 'co';
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';
  const isUrgent = order.deliveryRoute?.dispatchMode === 'urgent';
  const awaitingAcceptance =
    order.status === 'assigned' &&
    order.deliveryRoute?.requiresAcceptance === true &&
    !order.deliveryRoute.acceptedAt;
  const acceptanceDeadline = awaitingAcceptance
    ? order.deliveryRoute?.acceptBy
    : order.deliveryRoute?.startBy;
  const deadlineMs = acceptanceDeadline ? new Date(acceptanceDeadline).getTime() : Number.NaN;
  const deadlineMinutes = Number.isNaN(deadlineMs)
    ? null
    : Math.max(0, Math.ceil(Math.abs(deadlineMs - nowMs) / 60_000));
  const deadlineOverdue = !Number.isNaN(deadlineMs) && deadlineMs < nowMs;
  const isFutureJob =
    !!order.deliveryPlan?.plannedDate && order.deliveryPlan.plannedDate > getTodayDateKey();
  const acceptanceOpensAt = getMessengerJobAcceptanceOpensAt(order);
  const acceptanceNotOpen = acceptanceOpensAt != null && nowMs < acceptanceOpensAt;
  const startNotOpen = !canMessengerStartJob(order, nowMs);
  const overdue = getMessengerJobOverdue(order, nowMs);
  const isOverdue = overdue != null;
  const timing = getMessengerJobTiming(order, nowMs);
  const isPendingReview = order.status === 'pending_confirmation';
  // งานที่กำลังส่ง: โชว์เวลาเริ่ม (นิ่ง) + เหลือ/เลยเวลานัด — ไม่โชว์นาฬิกาจับเวลา
  const startedAtLabel = formatInTransitStartTime(order);
  const appointmentCountdown = getMessengerAppointmentCountdown(order, nowMs);
  const canMessengerEditProof = !isPendingReview || canReviseDeliveryProof(order, 'messenger');
  const messengerRevisionCount = getDeliveryProofRevisionCount(order, 'messenger');
  const messengerRevisionLimit = deliveryProofRevisionLimits.messenger;
  const routePair = buildRoutePair(order, relatedOrders);
  const isPickupStop = routePair.currentLeg === 'pickup';
  const jobType = getDispatchJobType(order);
  const JobTypeIcon = jobType === 'document' ? FileText : Package;
  const currentPhone = hasUsablePhone(routePair.currentStop.phone)
    ? routePair.currentStop.phone
    : undefined;
  const isGeneratedRouteNote = ['route_template', 'ad_hoc_route'].includes(
    order.metadataJson?.dispatch?.createdVia ?? '',
  );
  const routeNote = order.metadataJson?.dispatch?.routeNote?.trim();

  const plannedTime = order.deliveryPlan?.plannedTime;
  // แสดงสถานะเวลาเพียงชุดเดียวตาม action ปัจจุบัน เพื่อไม่ให้เวลานัดกับ SLA แข่งกันบน Card
  const workflowStatus: { tone: 'info' | 'warning' | 'danger'; label: string } | null =
    order.status === 'assigned' && order.deliveryRoute?.requiresAcceptance
      ? {
          tone: deadlineOverdue ? 'danger' : awaitingAcceptance ? 'warning' : 'info',
          label:
            deadlineMinutes == null
              ? awaitingAcceptance
                ? `ต้องรับงานภายใน ${order.deliveryRoute.acceptWithinMinutes ?? 15} นาทีหลังมอบหมาย`
                : `ต้องเริ่มงานภายใน ${order.deliveryRoute.startWithinMinutes ?? 10} นาทีหลังรับงาน`
              : deadlineOverdue
                ? awaitingAcceptance
                  ? `เลยเวลารับงาน ${deadlineMinutes} นาที`
                  : `เลยเวลาเริ่มงาน ${deadlineMinutes} นาที`
                : awaitingAcceptance
                  ? `เหลือ ${deadlineMinutes} นาทีเพื่อรับงาน`
                  : `เหลือ ${deadlineMinutes} นาทีเพื่อเริ่มงาน`,
        }
      : null;
  const apptStatus: { tone: 'info' | 'warning' | 'danger'; label: string } | null =
    workflowStatus ??
    (overdue
      ? { tone: 'danger', label: formatMessengerDueLabel(overdue) }
      : timing
        ? {
            tone: timing.phase === 'scheduled' ? 'info' : 'warning',
            label:
              timing.phase === 'scheduled'
                ? `เหลืออีก ${formatElapsedDuration(timing.minutes)} ถึงเวลานัด`
                : timing.phase === 'upcoming'
                  ? `ใกล้ถึงเวลานัด · อีก ${timing.minutes} นาที`
                  : `ถึงเวลานัดแล้ว · อีก ${timing.minutes} นาทีก่อนเลยเวลา`,
          }
        : appointmentCountdown
          ? {
              tone: appointmentCountdown.phase === 'after' ? 'warning' : 'info',
              label:
                appointmentCountdown.phase === 'before'
                  ? `อีก ${formatElapsedDuration(appointmentCountdown.minutes)} ถึงเวลานัด`
                  : `เลยเวลานัด ${formatElapsedDuration(appointmentCountdown.minutes)}`,
            }
          : null);
  const apptTone = apptStatus?.tone ?? 'info';
  const apptToneText =
    apptTone === 'danger'
      ? 'text-destructive'
      : apptTone === 'warning'
        ? 'text-warning'
        : 'text-info';

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.orderNo ?? order.code}</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
            <JobTypeIcon className="h-3 w-3" /> {dispatchJobTypeLabel[jobType]}
          </Badge>
          {routePair.positionLabel && (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
              {routePair.positionLabel}
            </Badge>
          )}
        </div>
      </div>

      {routePair.showRouteTitle && (
        <div className="mt-2 min-w-0 text-sm font-semibold leading-snug">
          {routePair.routeTitle}
        </div>
      )}

      {isCoDriver && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-[12px] text-info">
          <Users className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            คุณร่วมทำงานนี้ — นำโดย{' '}
            <span className="font-semibold">
              {order.assignedDriverName ?? order.assignedDriverId}
            </span>{' '}
            (คนขับหลักเป็นคนเริ่มและปิดงาน)
          </span>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
        {routePair.pickupStops.map((stop, index) => (
          <div
            key={stop.id}
            className={cn(
              'flex items-start gap-2.5 px-3 py-2.5',
              index > 0 && 'border-t border-border/50',
              stop.isCurrent && 'bg-info/5',
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                stop.isCurrent
                  ? 'border-info/30 bg-info/10 text-info'
                  : 'border-border bg-muted/50 text-muted-foreground',
              )}
            >
              <PackageOpen className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-medium text-info">
                  {routePair.pickupStops.length > 1
                    ? `จุดรับ ${index + 1}/${routePair.pickupStops.length}`
                    : 'จุดรับของ'}
                </div>
                <Badge
                  variant={stop.isCurrent ? 'info' : 'muted'}
                  className="h-5 shrink-0 px-1.5 text-[10px]"
                >
                  {stop.isCurrent ? 'จุดนี้' : 'ต้นทาง'}
                </Badge>
              </div>
              <div className="mt-0.5 text-[13px] font-semibold leading-snug">{stop.name}</div>
              {stop.address && (
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {stop.address}
                </div>
              )}
              {(stop.contact || hasUsablePhone(stop.phone)) && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {[stop.contact, hasUsablePhone(stop.phone) ? stop.phone : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {routePair.hasPair && (
          <div className="flex items-center gap-2 border-y border-border/50 bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground">
            <ArrowDown className="ml-1.5 h-3.5 w-3.5" />
            <span>
              {routePair.pickupStops.length > 1
                ? `รวมของจาก ${routePair.pickupStops.length} จุดไปส่ง`
                : 'นำของไปส่ง'}
            </span>
          </div>
        )}

        {routePair.dropoffStop && (
          <div
            className={cn(
              'flex items-start gap-2.5 px-3 py-2.5',
              !routePair.hasPair && routePair.pickupStops.length > 0 && 'border-t border-border/50',
              routePair.dropoffStop.isCurrent && 'bg-success/5',
            )}
          >
            <div
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                routePair.dropoffStop.isCurrent
                  ? 'border-success/30 bg-success/10 text-success'
                  : 'border-border bg-muted/50 text-muted-foreground',
              )}
            >
              <MapPin className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-medium text-success">จุดส่งของ</div>
                <Badge
                  variant={routePair.dropoffStop.isCurrent ? 'success' : 'muted'}
                  className="h-5 shrink-0 px-1.5 text-[10px]"
                >
                  {routePair.dropoffStop.isCurrent ? 'จุดนี้' : 'ปลายทาง'}
                </Badge>
              </div>
              <div className="mt-0.5 text-[13px] font-semibold leading-snug">
                {routePair.dropoffStop.name}
              </div>
              {routePair.dropoffStop.address && (
                <div className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {routePair.dropoffStop.address}
                </div>
              )}
              {(routePair.dropoffStop.contact || hasUsablePhone(routePair.dropoffStop.phone)) && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {[
                    routePair.dropoffStop.contact,
                    hasUsablePhone(routePair.dropoffStop.phone)
                      ? routePair.dropoffStop.phone
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          </div>
        )}

        {!routePair.hasPair && routePair.currentLeg === 'pickup' && (
          <div className="border-t border-warning/20 bg-warning/5 px-3 py-2 text-[11px] text-warning">
            ยังไม่พบข้อมูลจุดส่งปลายทาง
          </div>
        )}
      </div>

      {(order.deliveryPlan?.plannedDate || apptStatus) && (
        <div className="mt-2 flex items-start gap-2 border-b border-border/50 pb-2">
          {order.deliveryPlan?.plannedDate ? (
            <CalendarClock className={cn('mt-0.5 h-4 w-4 shrink-0', apptToneText)} />
          ) : (
            <Clock3 className={cn('mt-0.5 h-4 w-4 shrink-0', apptToneText)} />
          )}
          <div className="min-w-0 flex-1">
            {order.deliveryPlan?.plannedDate && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                <span className="font-medium">นัดหมาย</span>
                <span>{formatPlanningDate(order.deliveryPlan.plannedDate)}</span>
                <span className="font-semibold">
                  {plannedTime ? `${plannedTime} น.` : 'ไม่ระบุเวลา'}
                </span>
              </div>
            )}
            {apptStatus && (
              <div
                className={cn(
                  'text-[11px] font-medium',
                  order.deliveryPlan?.plannedDate && 'mt-0.5',
                  apptToneText,
                )}
              >
                {apptStatus.label}
              </div>
            )}
          </div>
        </div>
      )}

      {startedAtLabel && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          {isPickupStop ? 'เริ่มรับของ' : 'เริ่มส่ง'} {startedAtLabel} น.
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
        {(routeNote || (order.note && !isGeneratedRouteNote)) && (
          <div className="flex items-start gap-1.5">
            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <div>
              <div className="text-[10px] font-medium text-warning/90">หมายเหตุ</div>
              <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/80">
                {routeNote ?? order.note}
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {currentPhone && (
            <a href={`tel:${currentPhone}`} className="flex items-center gap-1.5 text-info">
              <Phone className="h-3.5 w-3.5" />
              <span>{currentPhone}</span>
            </a>
          )}
          {onViewMap && !isPendingReview && (
            <button
              type="button"
              onClick={onViewMap}
              className="flex items-center gap-1.5 font-medium text-info"
            >
              <MapIcon className="h-3.5 w-3.5" />
              ดูแผนที่
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {order.requiresIdCheck && (
          <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <IdCard className="h-2.5 w-2.5" />
            ตรวจบัตร
          </Badge>
        )}
        {isCod && (
          <Badge variant="muted" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <Banknote className="h-2.5 w-2.5" />
            {paymentLabel[order.payment]}
          </Badge>
        )}
      </div>

      {order.status === 'pending_confirmation' && order.proofOfDelivery && (
        <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold">หลักฐานที่ส่งล่าสุด</div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              {new Date(order.proofOfDelivery.capturedAt).toLocaleString('th-TH', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            {(order.proofOfDelivery.photos ?? []).map((src, index) => (
              <img
                key={index}
                src={src}
                alt={`รูปหลักฐานการส่งมอบ ${index + 1}`}
                className="aspect-4/3 w-full rounded-md border object-cover"
              />
            ))}
            {order.proofOfDelivery.signatureDataUrl && (
              <img
                src={order.proofOfDelivery.signatureDataUrl}
                alt="ลายเซ็นผู้รับ"
                className="aspect-4/3 w-full rounded-md border bg-white object-contain"
              />
            )}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Image className="h-3 w-3" />
              รูป {order.proofOfDelivery.photoCount}
            </span>
            {order.proofOfDelivery.signatureCaptured && (
              <span className="inline-flex items-center gap-1">
                <PenLine className="h-3 w-3" /> ลายเซ็นแล้ว
              </span>
            )}
            {order.proofOfDelivery.location?.label && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {order.proofOfDelivery.location.label}
              </span>
            )}
          </div>
          <div
            className={cn(
              'mt-2 rounded-md px-2 py-1.5 text-[10px] font-medium',
              canMessengerEditProof ? 'bg-info/10 text-info' : 'bg-destructive/10 text-destructive',
            )}
          >
            แก้ไข: {messengerRevisionCount}/{messengerRevisionLimit}
          </div>
        </div>
      )}

      <div
        className={cn(
          'mt-3 flex items-center border-t border-border/50 pt-3',
          order.status === 'assigned' && !isCoDriver && awaitingAcceptance
            ? 'gap-2'
            : 'justify-end',
        )}
      >
        {isCoDriver && (order.status === 'assigned' || order.status === 'in_transit') && (
          <Badge variant="muted" className="gap-1">
            <Users className="h-3 w-3" />
            {order.status === 'assigned'
              ? 'รอคนขับหลักเริ่มงาน'
              : isPickupStop
                ? 'คนขับหลักกำลังรับของ'
                : 'คนขับหลักกำลังส่ง'}
          </Badge>
        )}
        {order.status === 'assigned' &&
          !isCoDriver &&
          (awaitingAcceptance ? (
            <>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="min-w-0 flex-1 rounded-full border-info/30 px-3 text-info"
              >
                <a
                  href={navigationUrl(order.customer.address, order.customer.geo)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Navigation className="h-4 w-4" />
                  นำทาง
                </a>
              </Button>
              <Button
                size="sm"
                className="min-w-0 flex-1 rounded-full px-3"
                onClick={onAccept}
                disabled={isFutureJob || acceptanceNotOpen || accepting}
              >
                <CheckCircle2 className="h-4 w-4" />
                {accepting
                  ? 'กำลังรับงาน...'
                  : acceptanceNotOpen
                    ? `รับได้ก่อนเวลาออก ${SCHEDULED_DELIVERY_ACCEPTANCE_LEAD_MINUTES} นาที`
                    : order.deliveryRoute?.startPolicy === 'accept_starts'
                      ? 'รับงานและเริ่มทันที'
                      : 'รับงาน'}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="rounded-full px-4"
              onClick={onStart}
              disabled={isFutureJob || startNotOpen || starting}
            >
              <Navigation className="h-4 w-4" />
              {isFutureJob
                ? 'ยังไม่ถึงวันนัด'
                : startNotOpen
                  ? `เริ่มได้เวลา ${plannedTime ?? ''} น.`
                  : starting
                    ? isPickupStop
                      ? 'กำลังเริ่มรับของ...'
                      : 'กำลังเริ่มส่ง...'
                    : isOverdue
                      ? isPickupStop
                        ? 'เริ่มรับของตอนนี้'
                        : 'เริ่มส่งตอนนี้'
                      : isUrgent
                        ? isPickupStop
                          ? 'เริ่มรับของทันที'
                          : 'เริ่มส่งทันที'
                        : isPickupStop
                          ? 'เริ่มรับของ'
                          : 'เริ่มส่ง'}
            </Button>
          ))}
        {order.status === 'in_transit' && !isCoDriver && (
          <Button size="sm" className="rounded-full px-4" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" />
            {isPickupStop ? 'ยืนยันรับของ' : 'ยืนยันส่งมอบ'}
          </Button>
        )}
        {order.status === 'pending_confirmation' && (
          <div className="flex w-full items-center justify-between gap-2">
            <Badge variant={isPickupStop ? 'success' : 'warning'} className="gap-1">
              {isPickupStop ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <ClipboardCheck className="h-3 w-3" />
              )}
              {isPickupStop ? 'รับของแล้ว' : 'รอตรวจสอบ'}
            </Badge>
            <div className="flex items-center gap-1.5">
              {onViewMap && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={onViewMap}>
                  <MapIcon className="h-3.5 w-3.5" />
                  แผนที่
                </Button>
              )}
              {!isCoDriver && !isPickupStop && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={!canMessengerEditProof}
                  title={
                    canMessengerEditProof ? undefined : 'messenger แก้ไขหลักฐานได้ครบ 1 ครั้งแล้ว'
                  }
                  onClick={onClose}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  แก้ไขหลักฐาน
                </Button>
              )}
            </div>
          </div>
        )}
        {order.status === 'delivered' && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            ส่งสำเร็จ
          </Badge>
        )}
      </div>
    </div>
  );
}
