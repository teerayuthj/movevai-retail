import { CheckCircle2, Merge, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ShippingMethod } from '@/data/orderTypes';
import type { ImportRejectReason } from '@/lib/retailApi';
import { importRejectReasonLabel } from '@/state/retail/moderation';
import { ShippingMethodSelect } from './ShippingMethodSelect';

const REJECT_REASONS: ImportRejectReason[] = [
  'incomplete_data',
  'duplicate',
  'wrong_group',
  'other',
];

// แถบ action ตอนติ๊กเลือกหลายออเดอร์ — อนุมัติ / รวมเป็นออเดอร์เดียว / ปฏิเสธพร้อมเหตุผล
export function BulkActionBar({
  selectedCount,
  method,
  onMethodChange,
  reason,
  onReasonChange,
  busy,
  onApprove,
  onMerge,
  onReject,
}: {
  selectedCount: number;
  method: ShippingMethod;
  onMethodChange: (method: ShippingMethod) => void;
  reason: ImportRejectReason | '';
  onReasonChange: (reason: ImportRejectReason | '') => void;
  busy: boolean;
  onApprove: () => void;
  onMerge: () => void;
  onReject: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
      <span className="text-xs font-medium text-primary">เลือก {selectedCount} รายการ</span>
      <div className="flex flex-wrap items-center gap-2">
        <ShippingMethodSelect value={method} onChange={onMethodChange} />
        <Button size="sm" disabled={busy} onClick={onApprove}>
          <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ ({selectedCount})
        </Button>
        {selectedCount >= 2 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy} onClick={onMerge}>
                <Merge className="h-3.5 w-3.5" /> รวมเป็น 1 ออเดอร์
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[260px]">
              <p className="font-semibold">รวม {selectedCount} รายการเป็นออเดอร์เดียว</p>
              <p className="mt-0.5 font-normal leading-snug text-background/80">
                สินค้าทุก SKU และแถวต้นทางย้ายไปอยู่ออเดอร์แรกที่เลือก ยอดรวมถูกบวกให้ —
                แยกกลับได้ด้วย “แยกตามแถว”
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        <Separator orientation="vertical" className="h-6" />
        <Select
          value={reason}
          onChange={(e) => onReasonChange(e.target.value as ImportRejectReason | '')}
          className="h-8 text-xs"
        >
          <option value="">เหตุผล (ไม่บังคับ)</option>
          {REJECT_REASONS.map((value) => (
            <option key={value} value={value}>
              {importRejectReasonLabel[value]}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
          <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
        </Button>
      </div>
    </div>
  );
}
