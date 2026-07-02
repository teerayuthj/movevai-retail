import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  canReviseDeliveryProof,
  deliveryProofRevisionLimits,
  getDeliveryProofRevisionCount,
} from '@/state/retail/delivery';
import { paymentLabel, type Order } from '@/data/mock';
import {
  Banknote,
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
} from 'lucide-react';
import { formatOverdueDuration, formatPlanningDate, getTodayDateKey } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import {
  formatInTransitStartTime,
  getMessengerAppointmentCountdown,
  getMessengerJobOverdueMinutes,
  getMessengerJobTiming,
} from '../messengerSchedule';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { navigationUrl } from '../geocode';

function formatMessengerDueLabel(minutes: number) {
  if (minutes < 1) return 'ถึงเวลารับงานแล้ว';
  return formatOverdueDuration(minutes).replace('เลยเวลานัดส่ง ', 'ถึงเวลารับงานแล้ว · ');
}

export function JobCard({
  order,
  nowMs = Date.now(),
  onStart,
  onClose,
  onViewMap,
  starting = false,
}: {
  order: Order;
  nowMs?: number;
  onStart: () => void;
  onClose: () => void;
  /** เปิดแผนที่โฟกัสปลายทางของงานนี้โดยเฉพาะ (แยกจากภาพรวมทั้ง Route) */
  onViewMap?: () => void;
  /** กำลังเริ่มงานนี้อยู่ (ระหว่างรอ backend) — disable ปุ่ม + แสดงสถานะ */
  starting?: boolean;
}) {
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';
  const isUrgent = order.deliveryRoute?.dispatchMode === 'urgent';
  const isFutureJob =
    !!order.deliveryPlan?.plannedDate && order.deliveryPlan.plannedDate > getTodayDateKey();
  const overdueMinutes = getMessengerJobOverdueMinutes(order, nowMs);
  const isOverdue = overdueMinutes != null;
  const timing = getMessengerJobTiming(order, nowMs);
  const isPendingReview = order.status === 'pending_confirmation';
  // งานที่กำลังส่ง: โชว์เวลาเริ่ม (นิ่ง) + เหลือ/เลยเวลานัด — ไม่โชว์นาฬิกาจับเวลา
  const startedAtLabel = formatInTransitStartTime(order);
  const appointmentCountdown = getMessengerAppointmentCountdown(order, nowMs);
  const canMessengerEditProof = !isPendingReview || canReviseDeliveryProof(order, 'messenger');
  const messengerRevisionCount = getDeliveryProofRevisionCount(order, 'messenger');
  const messengerRevisionLimit = deliveryProofRevisionLimits.messenger;

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        timing && !isOverdue && 'border-warning/50 border-l-4 border-l-warning',
        isOverdue && 'border-warning/50 border-l-4 border-l-warning',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.code}</span>
        <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
          <Package className="h-3 w-3" /> พัสดุ
        </Badge>
      </div>
      {(isUrgent || isOverdue || timing) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {isUrgent && order.status === 'assigned' && (
            <Badge variant="info">ส่งทันที · กรุณารับภายใน 5 นาที</Badge>
          )}
          {isOverdue && (
            <Badge
              variant="outline"
              className="border-destructive/30 bg-destructive/10 text-destructive"
            >
              <Clock3 className="h-3 w-3" />
              {formatMessengerDueLabel(overdueMinutes)}
            </Badge>
          )}
          {timing && (
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
              <Clock3 className="h-3 w-3" />
              {timing.phase === 'upcoming'
                ? `อีก ${timing.minutes} นาทีถึงเวลานัดส่ง`
                : 'ถึงเวลานัดส่งแล้ว · กรุณารับงานทันที'}
            </Badge>
          )}
        </div>
      )}
      <div className="mt-1 text-sm font-semibold">{order.customer.name}</div>

      {order.deliveryRoute && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {order.deliveryRoute.code} · จุดที่ {order.deliveryRoute.sequence}
          </Badge>
          {order.deliveryPlan?.plannedDate && (
            <span className="inline-flex h-5 items-center px-1 text-[10px] font-medium text-muted-foreground">
              {formatPlanningDate(order.deliveryPlan.plannedDate)} ·{' '}
              {order.deliveryPlan.plannedTime
                ? `${order.deliveryPlan.plannedTime} น.`
                : 'ไม่ระบุเวลา'}
            </span>
          )}
        </div>
      )}

      {(startedAtLabel || appointmentCountdown) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          {startedAtLabel && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock3 className="h-3 w-3" />
              เริ่มส่ง {startedAtLabel} น.
            </span>
          )}
          {appointmentCountdown && (
            <span
              className={cn(
                'inline-flex items-center gap-1 font-medium',
                appointmentCountdown.phase === 'before' ? 'text-info' : 'text-warning',
              )}
            >
              {appointmentCountdown.phase === 'before'
                ? `อีก ${formatElapsedDuration(appointmentCountdown.minutes)} ถึงเวลานัด`
                : `เลยเวลานัด ${formatElapsedDuration(appointmentCountdown.minutes)}`}
            </span>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{order.customer.address}</span>
        </div>
        {order.note && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
            <div className="flex items-start gap-1.5">
              <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div className="text-[10px] font-medium uppercase tracking-normal opacity-80">
                  หมายเหตุ
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed">
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
        <div className="mt-3 rounded-lg border border-warning/25 bg-warning/5 p-3">
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
            {order.proofOfDelivery.photos?.[0] && (
              <img
                src={order.proofOfDelivery.photos[0]}
                alt="รูปหลักฐานการส่งมอบ"
                className="aspect-4/3 w-full rounded-md border object-cover"
              />
            )}
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
              'mt-2 rounded-md border px-2 py-1.5 text-[10px] font-medium',
              canMessengerEditProof
                ? 'border-info/30 bg-info/10 text-info'
                : 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
          >
            แก้ไข: {messengerRevisionCount}/{messengerRevisionLimit}
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-end border-t pt-3">
        {order.status === 'assigned' && (
          <Button size="sm" variant="default" onClick={onStart} disabled={isFutureJob || starting}>
            <Navigation className="h-4 w-4" />
            {isFutureJob
              ? 'ยังไม่ถึงวันส่ง'
              : starting
                ? 'กำลังเริ่ม...'
                : isOverdue
                  ? 'รับงานตอนนี้'
                  : isUrgent
                    ? 'รับทันที'
                    : 'รับงาน'}
          </Button>
        )}
        {order.status === 'in_transit' && (
          <Button size="sm" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" />
            ปิดงาน
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
                <Button size="sm" variant="outline" onClick={onViewMap}>
                  <MapIcon className="h-3.5 w-3.5" />
                  แผนที่
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!canMessengerEditProof}
                title={
                  canMessengerEditProof ? undefined : 'messenger แก้ไขหลักฐานได้ครบ 1 ครั้งแล้ว'
                }
                onClick={onClose}
              >
                <PenLine className="h-3.5 w-3.5" />
                แก้ไขหลักฐาน
              </Button>
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
