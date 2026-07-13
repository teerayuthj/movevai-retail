import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  canReviseDeliveryProof,
  deliveryProofRevisionLimits,
  getDeliveryProofRevisionCount,
} from '@/state/retail/delivery';
import { paymentLabel, type Order } from '@/data/orderTypes';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Image,
  IdCard,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Navigation,
  Package,
  Phone,
  PenLine,
  Users,
} from 'lucide-react';
import { formatOverdueDuration, formatPlanningDate, getTodayDateKey } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import {
  formatInTransitStartTime,
  getMessengerAppointmentCountdown,
  getMessengerJobOverdue,
  getMessengerJobTiming,
} from '../messengerSchedule';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { navigationUrl } from '../geocode';
import type { AssignedOrderOverdue } from '@/lib/deliveryPlanning';
import type { MessengerOrderRole } from '@/lib/messengerJobs';

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

  const plannedTime = order.deliveryPlan?.plannedTime;
  // สถานะเวลานัด (สี + บรรทัดสรุป) — รวม เลย/ใกล้ถึง/เหลือ ไว้ในกล่องนัดส่งกล่องเดียว
  const apptStatus: { tone: 'info' | 'warning' | 'danger'; label: string } | null = overdue
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
        : null;
  const apptTone = apptStatus?.tone ?? 'info';
  const apptToneText =
    apptTone === 'danger'
      ? 'text-destructive'
      : apptTone === 'warning'
        ? 'text-warning'
        : 'text-info';
  const apptToneSurface =
    apptTone === 'danger'
      ? 'border-destructive/30 bg-destructive/10'
      : apptTone === 'warning'
        ? 'border-warning/30 bg-warning/10'
        : 'border-info/30 bg-info/10';

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.orderNo}</span>
        <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
          <Package className="h-3 w-3" /> พัสดุ
        </Badge>
      </div>
      <div className="mt-1 text-sm font-semibold">{order.customer.name}</div>

      {isCoDriver && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-[12px] text-info">
          <Users className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            คุณร่วมส่งงานนี้ — นำโดย{' '}
            <span className="font-semibold">
              {order.assignedDriverName ?? order.assignedDriverId}
            </span>{' '}
            (คนขับหลักเป็นคนเริ่มงานและปิดงาน)
          </span>
        </div>
      )}

      {order.deliveryPlan?.plannedDate && (
        <div
          className={cn(
            'mt-2 flex items-center gap-2.5 rounded-xl border px-3 py-2',
            apptToneSurface,
          )}
        >
          <CalendarClock className={cn('h-5 w-5 shrink-0', apptToneText)} />
          <div className="min-w-0 flex-1">
            <div
              className={cn(
                'text-[10px] font-medium uppercase tracking-normal opacity-80',
                apptToneText,
              )}
            >
              นัดส่ง
            </div>
            <div className={cn('text-[13px] font-semibold leading-tight', apptToneText)}>
              {formatPlanningDate(order.deliveryPlan.plannedDate)}
            </div>
            {apptStatus && (
              <div className={cn('mt-0.5 text-[11px] font-medium', apptToneText)}>
                {apptStatus.label}
              </div>
            )}
          </div>
          <div className={cn('shrink-0 text-right leading-none', apptToneText)}>
            {plannedTime ? (
              <>
                <span className="text-xl font-semibold">{plannedTime}</span>
                <span className="ml-0.5 text-[11px] font-medium">น.</span>
              </>
            ) : (
              <span className="text-xs font-medium">ไม่ระบุเวลา</span>
            )}
          </div>
        </div>
      )}

      {startedAtLabel && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3" />
          เริ่มส่ง {startedAtLabel} น.
        </div>
      )}

      {order.status === 'assigned' && order.deliveryRoute?.requiresAcceptance && (
        <div
          className={cn(
            'mt-2 flex items-center gap-2.5 rounded-xl border px-3 py-2',
            deadlineOverdue
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : awaitingAcceptance
                ? 'border-warning/30 bg-warning/10 text-warning'
                : 'border-info/30 bg-info/10 text-info',
          )}
        >
          <Clock3 className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold">
              {awaitingAcceptance ? 'ต้องรับงานภายใน' : 'รับงานแล้ว · ต้องเริ่มภายใน'}
            </div>
            <div className="text-[11px] opacity-90">
              {deadlineMinutes == null
                ? awaitingAcceptance
                  ? `${order.deliveryRoute.acceptWithinMinutes ?? 15} นาทีหลังมอบหมาย`
                  : `${order.deliveryRoute.startWithinMinutes ?? 10} นาทีหลังรับงาน`
                : deadlineOverdue
                  ? `เกินกำหนด ${deadlineMinutes} นาที`
                  : `เหลือ ${deadlineMinutes} นาที`}
            </div>
          </div>
          {order.deliveryRoute.acceptedAt && <Badge variant="info">รับแล้ว</Badge>}
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{order.customer.address}</span>
        </div>
        {order.note && (
          <div>
            <div className="flex items-start gap-1.5">
              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <div>
                <div className="text-[10px] font-medium uppercase tracking-normal text-warning/90">
                  หมายเหตุ
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/80">
                  {order.note}
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <a href={`tel:${order.customer.phone}`} className="flex items-center gap-1.5 text-info">
            <Phone className="h-3.5 w-3.5" />
            <span>{order.customer.phone}</span>
          </a>
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
          {!isPendingReview && (
            <a
              href={navigationUrl(order.customer.address, order.customer.geo)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 font-medium text-info"
            >
              <Navigation className="h-3.5 w-3.5" />
              นำทาง
            </a>
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

      <div className="mt-3 flex items-center justify-end border-t border-border/50 pt-3">
        {isCoDriver && (order.status === 'assigned' || order.status === 'in_transit') && (
          <Badge variant="muted" className="gap-1">
            <Users className="h-3 w-3" />
            {order.status === 'assigned' ? 'รอคนขับหลักเริ่มงาน' : 'คนขับหลักกำลังส่ง'}
          </Badge>
        )}
        {order.status === 'assigned' &&
          !isCoDriver &&
          (awaitingAcceptance ? (
            <Button
              size="sm"
              className="rounded-full px-4"
              onClick={onAccept}
              disabled={isFutureJob || accepting}
            >
              <CheckCircle2 className="h-4 w-4" />
              {accepting
                ? 'กำลังรับงาน...'
                : order.deliveryRoute?.startPolicy === 'accept_starts'
                  ? 'รับงานและเริ่มทันที'
                  : 'รับงาน'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="rounded-full px-4"
              onClick={onStart}
              disabled={isFutureJob || starting}
            >
              <Navigation className="h-4 w-4" />
              {isFutureJob
                ? 'ยังไม่ถึงวันส่ง'
                : starting
                  ? 'กำลังเริ่มส่ง...'
                  : isOverdue
                    ? 'เริ่มส่งตอนนี้'
                    : isUrgent
                      ? 'เริ่มส่งทันที'
                      : 'เริ่มส่ง'}
            </Button>
          ))}
        {order.status === 'in_transit' && !isCoDriver && (
          <Button size="sm" className="rounded-full px-4" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" />
            ยืนยันส่งมอบ
          </Button>
        )}
        {order.status === 'pending_confirmation' && (
          <div className="flex w-full items-center justify-between gap-2">
            <Badge variant="warning" className="gap-1">
              <ClipboardCheck className="h-3 w-3" />
              รอตรวจสอบ
            </Badge>
            <div className="flex items-center gap-1.5">
              {onViewMap && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={onViewMap}>
                  <MapIcon className="h-3.5 w-3.5" />
                  แผนที่
                </Button>
              )}
              {!isCoDriver && (
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
