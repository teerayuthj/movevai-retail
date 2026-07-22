import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import {
  type FailReason,
  type Order,
  failReasonLabel,
  formatTHB,
  paymentLabel,
  statusLabel,
} from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import { formatOverdueDuration, formatPlanningDateTime } from '@/lib/deliveryPlanning';
import { formatElapsedDuration, getInTransitElapsedTone } from '@/lib/deliveryExecution';
import { formatRouteDistance } from '@/lib/routeDistance';
import { shortRouteCode } from '@/lib/routeCode';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Coins,
  IdCard,
  MapPin,
  Phone,
  Route,
} from 'lucide-react';

type TrackingCardProps = {
  order: Order;
  selected: boolean;
  onSelect: () => void;
  /** ปุ่ม action ตามสถานะ — render เฉพาะงานที่ยัง actionable */
  actions?: ReactNode;
  overdueMinutes?: number | null;
  /** นาทีที่กำลังส่งอยู่ (นับจาก rider เริ่มงาน) — null/undefined = ไม่แสดง */
  inTransitMinutes?: number | null;
  /** เพิ่งกด action — โชว์การ์ดสีเทาค้างไว้ก่อนหายไป */
  settling?: boolean;
  /** ข้อความสรุป action ที่เพิ่งทำ เช่น "ปิดงานแล้ว" */
  settledLabel?: string;
  /** เวลาปัจจุบันจากหน้าหลัก เพื่อให้อายุงานทั้งรายการอ้างอิงเวลาเดียวกัน */
  nowMs?: number;
};

const REVIEW_ATTENTION_MINUTES = 24 * 60;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getElapsedMinutes(value: string, nowMs: number) {
  const startedAt = new Date(value).getTime();
  if (Number.isNaN(startedAt)) return null;
  return Math.max(0, Math.floor((nowMs - startedAt) / 60_000));
}

/** การ์ดในรายการ: สรุป + หลักฐานย่อ + ปุ่ม action ในตัว */
export function TrackingCard({
  order,
  selected,
  onSelect,
  actions,
  overdueMinutes,
  inTransitMinutes,
  settling = false,
  settledLabel,
  nowMs = Date.now(),
}: TrackingCardProps) {
  const pod = order.proofOfDelivery;
  const isUrgent = order.deliveryRoute?.dispatchMode === 'urgent';
  const isPlannedPreview =
    order.deliveryPlan?.releaseState === 'planned' && Boolean(order.deliveryPlan.plannedDriverId);
  const tone =
    overdueMinutes != null
      ? 'border-l-destructive'
      : order.status === 'in_transit'
        ? 'border-l-info'
        : order.status === 'pending_confirmation' || order.status === 'returning'
          ? 'border-l-warning'
          : 'border-l-muted-foreground/30';
  const isActionable =
    isPlannedPreview ||
    overdueMinutes != null ||
    (order.status === 'assigned' && !!order.deliveryRoute) ||
    order.status === 'in_transit' ||
    order.status === 'pending_confirmation' ||
    order.status === 'returning';
  const proofCapturedAt = pod?.capturedAt;
  const reviewMinutes =
    order.status === 'pending_confirmation' && proofCapturedAt
      ? getElapsedMinutes(proofCapturedAt, nowMs)
      : null;
  const reviewNeedsAttention = reviewMinutes != null && reviewMinutes >= REVIEW_ATTENTION_MINUTES;

  return (
    <div
      className={cn(
        'rounded-lg border border-l-[3px] bg-card transition-all duration-500',
        tone,
        overdueMinutes != null && 'border-destructive/40 bg-destructive/5',
        selected && 'ring-1 ring-primary',
        // เพิ่งกด action — กลายเป็นการ์ดสีเทาจางลง รอหายไป
        settling &&
          'pointer-events-none border-l-muted-foreground/40 bg-muted/40 opacity-60 grayscale',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={settling}
        className="block w-full p-4 pb-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.orderNo}</span>
            <CopyOrderNoButton orderNo={order.orderNo} />
            <Badge
              variant={
                order.status === 'in_transit'
                  ? 'info'
                  : order.status === 'pending_confirmation' || order.status === 'returning'
                    ? 'warning'
                    : 'muted'
              }
              className="h-5 px-1.5 text-[10px]"
            >
              {statusLabel[order.status]}
            </Badge>
            {order.requiresIdCheck && (
              <Badge
                variant="warning"
                className="h-5 gap-0.5 border-destructive/30 bg-destructive/10 px-1.5 text-[10px] text-destructive"
              >
                <IdCard className="h-2.5 w-2.5" />
                ตรวจบัตร
              </Badge>
            )}
            {order.payment === 'cod' && (
              <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                COD
              </Badge>
            )}
            {isUrgent && (
              <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                ส่งทันที
              </Badge>
            )}
            {isPlannedPreview && (
              <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                แผนล่วงหน้า
              </Badge>
            )}
            {overdueMinutes != null && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                <Clock3 className="h-3 w-3" /> {formatOverdueDuration(overdueMinutes)}
              </Badge>
            )}
            {inTransitMinutes != null && (
              <Badge
                variant={
                  getInTransitElapsedTone(inTransitMinutes) === 'critical'
                    ? 'destructive'
                    : getInTransitElapsedTone(inTransitMinutes) === 'slow'
                      ? 'warning'
                      : 'info'
                }
                className="h-5 gap-0.5 px-1.5 text-[10px]"
              >
                <Clock3 className="h-3 w-3" />
                ส่งมาแล้ว {formatElapsedDuration(inTransitMinutes)}
              </Badge>
            )}
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-1.5 text-sm font-medium">{order.customer.name}</div>
        {(order.status === 'assigned' || isPlannedPreview) && order.deliveryPlan && (
          <div
            className={cn(
              'mt-1 text-[11px] font-medium',
              overdueMinutes != null ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {order.deliveryRoute ? shortRouteCode(order.deliveryRoute.code) : 'Route'} · นัดส่ง{' '}
            {formatPlanningDateTime(order.deliveryPlan.plannedDate, order.deliveryPlan.plannedTime)}
          </div>
        )}
        {order.status === 'in_transit' && order.inTransitAt && (
          <div className="mt-1 text-[11px] font-medium text-info">
            เริ่มจัดส่ง {formatDateTime(order.inTransitAt)}
          </div>
        )}
        {order.status === 'pending_confirmation' && proofCapturedAt && reviewMinutes != null && (
          <div
            className={cn(
              'mt-1 text-[11px] font-medium',
              reviewNeedsAttention ? 'text-destructive' : 'text-warning',
            )}
          >
            ส่งหลักฐาน {formatDateTime(proofCapturedAt)} · รอยืนยัน{' '}
            {formatElapsedDuration(reviewMinutes)}
            {reviewNeedsAttention && ' — ควรตรวจสอบ'}
          </div>
        )}
        <div className="mt-1 space-y-1 text-[11px] text-muted-foreground">
          <div className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{order.customer.address}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" />
            <span>{order.customer.phone}</span>
          </div>
          {order.deliveryRoute?.plannedDistanceMeters != null &&
            order.deliveryRoute.plannedDistanceMeters > 0 && (
              <div className="flex items-center gap-1.5">
                <Route className="h-3 w-3" />
                <span>
                  ระยะตามถนนประมาณ {formatRouteDistance(order.deliveryRoute.plannedDistanceMeters)}{' '}
                  · ไม่รวม traffic
                </span>
              </div>
            )}
        </div>

        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3 text-warning" />
            {paymentLabel[order.payment]}
          </div>
          <span className="text-sm font-semibold tabular-nums text-warning">
            {formatTHB(order.totalValue)}
          </span>
        </div>

        {pod && (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-success">
            <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5">
              <CheckCircle2 className="h-2.5 w-2.5" />
              หลักฐานครบจาก messenger
            </span>
          </div>
        )}
        {order.resolution?.reason && order.status === 'returning' && (
          <div className="mt-2 text-[11px] text-destructive">
            เหตุ:{' '}
            {failReasonLabel[order.resolution.reason as FailReason] ?? order.resolution.reason}
          </div>
        )}
      </button>

      {settling ? (
        <div className="flex items-center justify-center gap-1.5 px-4 pb-4 text-[11px] font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {settledLabel ?? 'ดำเนินการแล้ว'}
        </div>
      ) : (
        isActionable && actions && <div className="px-4 pb-4">{actions}</div>
      )}
    </div>
  );
}
