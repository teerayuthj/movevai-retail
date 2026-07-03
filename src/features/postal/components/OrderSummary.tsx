import { Badge } from '@/components/ui/badge';
import {
  type CancelReason,
  type FailReason,
  type Order,
  cancelReasonLabel,
  failNextActionLabel,
  failReasonLabel,
  formatTHB,
  paymentLabel,
} from '@/data/orderTypes';
import { Coins, IdCard, ShieldCheck } from 'lucide-react';

export function OrderSummary({ order }: { order: Order }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground">Order</div>
      <div className="mt-1 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-medium">{order.code}</span>
          <Badge variant="muted">{order.items.length} รายการ</Badge>
        </div>
        <div className="mt-1 text-sm">{order.customer.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{order.customer.address}</div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
          <span className="text-sm font-semibold tabular-nums text-warning">
            {formatTHB(order.totalValue)}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="muted" className="gap-1 text-[10px]">
            <Coins className="h-2.5 w-2.5" />
            {paymentLabel[order.payment]}
          </Badge>
          {order.requiresIdCheck && (
            <Badge variant="warning" className="gap-1 text-[10px]">
              <IdCard className="h-2.5 w-2.5" />
              ตรวจบัตร
            </Badge>
          )}
          {order.insured && (
            <Badge variant="muted" className="gap-1 text-[10px]">
              <ShieldCheck className="h-2.5 w-2.5" />
              ประกันขนส่ง
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export function ResolutionInfoBlock({ order }: { order: Order }) {
  const r = order.resolution;
  if (!r) return null;
  const reasonText = r.reason
    ? (failReasonLabel[r.reason as FailReason] ?? cancelReasonLabel[r.reason as CancelReason])
    : undefined;
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="font-medium">รายละเอียดการบันทึก</div>
      {reasonText && <div className="mt-1">เหตุผล: {reasonText}</div>}
      {r.nextAction && (
        <div className="mt-0.5">ขั้นตอนต่อไป: {failNextActionLabel[r.nextAction]}</div>
      )}
      {r.note && <div className="mt-0.5">หมายเหตุ: {r.note}</div>}
      <div className="mt-1 text-[10px] text-muted-foreground">
        บันทึกโดย {r.recordedBy.name} · {r.recordedBy.department} ·{' '}
        {new Date(r.recordedAt).toLocaleString('th', {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </div>
    </div>
  );
}
