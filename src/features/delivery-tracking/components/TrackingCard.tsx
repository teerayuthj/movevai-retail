import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  type FailReason,
  type Order,
  failReasonLabel,
  formatTHB,
  paymentLabel,
  statusLabel,
} from '@/data/mock';
import { cn } from '@/lib/utils';
import { formatOverdueDuration, formatPlanningDateTime } from '@/lib/deliveryPlanning';
import { ArrowUpRight, CheckCircle2, Clock3, Coins, IdCard, MapPin, Phone } from 'lucide-react';

type TrackingCardProps = {
  order: Order;
  selected: boolean;
  onSelect: () => void;
  /** ปุ่ม action ตามสถานะ — render เฉพาะงานที่ยัง actionable */
  actions?: ReactNode;
  overdueMinutes?: number | null;
};

/** การ์ดในรายการ: สรุป + หลักฐานย่อ + ปุ่ม action ในตัว */
export function TrackingCard({
  order,
  selected,
  onSelect,
  actions,
  overdueMinutes,
}: TrackingCardProps) {
  const pod = order.proofOfDelivery;
  const isUrgent = order.deliveryRoute?.dispatchMode === 'urgent';
  const tone =
    overdueMinutes != null
      ? 'border-l-destructive'
      : order.status === 'in_transit'
        ? 'border-l-info'
        : order.status === 'pending_confirmation' || order.status === 'returning'
          ? 'border-l-warning'
          : 'border-l-muted-foreground/30';
  const isActionable =
    overdueMinutes != null ||
    (order.status === 'assigned' && !!order.deliveryRoute) ||
    order.status === 'in_transit' ||
    order.status === 'pending_confirmation' ||
    order.status === 'returning';

  return (
    <div
      className={cn(
        'rounded-lg border border-l-[3px] bg-card transition-colors',
        tone,
        overdueMinutes != null && 'border-destructive/40 bg-destructive/5',
        selected && 'ring-1 ring-primary',
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full p-4 pb-3 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.code}</span>
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
              <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                งานด่วน
              </Badge>
            )}
            {overdueMinutes != null && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                <Clock3 className="h-3 w-3" /> {formatOverdueDuration(overdueMinutes)}
              </Badge>
            )}
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-1.5 text-sm font-medium">{order.customer.name}</div>
        {overdueMinutes != null && order.deliveryPlan && (
          <div className="mt-1 text-[11px] font-medium text-destructive">
            {order.deliveryRoute?.code ?? 'Route'} · นัดส่ง{' '}
            {formatPlanningDateTime(order.deliveryPlan.plannedDate, order.deliveryPlan.plannedTime)}
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
              หลักฐานครบจาก rider
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

      {isActionable && actions && <div className="px-4 pb-4">{actions}</div>}
    </div>
  );
}
