import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isHighValueOrder } from '@/lib/deliveryExecution';
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
  Navigation,
  Package,
  Phone,
  ShieldCheck,
  PenLine,
} from 'lucide-react';
import { formatOverdueDuration, formatPlanningDate, getTodayDateKey } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { getRiderJobOverdueMinutes, getRiderJobTiming } from '../riderSchedule';
import { navigationUrl } from '../geocode';

export function JobCard({
  order,
  nowMs = Date.now(),
  onStart,
  onClose,
  onViewMap,
}: {
  order: Order;
  nowMs?: number;
  onStart: () => void;
  onClose: () => void;
  /** เปิดแผนที่โฟกัสปลายทางของงานนี้โดยเฉพาะ (แยกจากภาพรวมทั้ง Route) */
  onViewMap?: () => void;
}) {
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';
  const isUrgent = order.deliveryRoute?.dispatchMode === 'urgent';
  const isFutureJob =
    !!order.deliveryPlan?.plannedDate && order.deliveryPlan.plannedDate > getTodayDateKey();
  const overdueMinutes = getRiderJobOverdueMinutes(order, nowMs);
  const isOverdue = overdueMinutes != null;
  const timing = getRiderJobTiming(order, nowMs);
  const isPendingReview = order.status === 'pending_confirmation';

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-4',
        timing && !isOverdue && 'border-warning/50 border-l-4 border-l-warning bg-warning/5',
        isOverdue && 'border-destructive/50 border-l-4 border-l-destructive bg-destructive/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.code}</span>
        <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
          <Package className="h-3 w-3" /> พัสดุ
        </Badge>
      </div>
      {isUrgent && (
        <Badge variant="destructive" className="mt-2">
          งานด่วน · กรุณารับภายใน 5 นาที
        </Badge>
      )}
      {isOverdue && (
        <Badge
          variant="outline"
          className="mt-2 border-destructive/30 bg-destructive/10 text-destructive"
        >
          <Clock3 className="h-3 w-3" />
          {formatOverdueDuration(overdueMinutes)}
        </Badge>
      )}
      {timing && (
        <Badge variant="outline" className="mt-2 border-warning/30 bg-warning/10 text-warning">
          <Clock3 className="h-3 w-3" />
          {timing.phase === 'upcoming'
            ? `อีก ${timing.minutes} นาทีถึงเวลานัดส่ง`
            : 'ถึงเวลานัดส่งแล้ว · กรุณารับงานทันที'}
        </Badge>
      )}
      <div className="mt-1 text-sm font-semibold">{order.customer.name}</div>

      {order.deliveryRoute && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {order.deliveryRoute.code} · จุดที่ {order.deliveryRoute.sequence}
          </Badge>
          {order.deliveryPlan?.plannedDate && (
            <Badge
              variant={isOverdue ? 'destructive' : isFutureJob || timing ? 'warning' : 'success'}
              className="h-5 px-1.5 text-[10px]"
            >
              {formatPlanningDate(order.deliveryPlan.plannedDate)} ·{' '}
              {order.deliveryPlan.plannedTime
                ? `${order.deliveryPlan.plannedTime} น.`
                : 'ไม่ระบุเวลา'}
            </Badge>
          )}
        </div>
      )}

      <div className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{order.customer.address}</span>
        </div>
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
        {isHighValueOrder(order) && (
          <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <ShieldCheck className="h-2.5 w-2.5" />
            ของมีค่า
          </Badge>
        )}
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
        </div>
      )}

      <div className="mt-3 flex items-center justify-end border-t pt-3">
        {order.status === 'assigned' && (
          <Button
            size="sm"
            variant={isUrgent || isOverdue ? 'destructive' : 'default'}
            onClick={onStart}
            disabled={isFutureJob}
          >
            <Navigation className="h-4 w-4" />
            {isFutureJob ? 'ยังไม่ถึงวันส่ง' : isUrgent || isOverdue ? 'รับงานด่วน' : 'รับงาน'}
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
              <Button size="sm" variant="outline" onClick={onClose}>
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
