import {
  CalendarDays,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Layers,
  Loader2,
  Package,
  Pencil,
  RotateCcw,
  Route,
  Send,
  Split,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTHB, type Order } from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import { isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import { formatRequestedDelivery } from '@/features/inbox/utils/orderSchedule';
import {
  canOpenFastDispatch,
  canOpenPlanning,
  getDeliveryQueueBadge,
  orderItemStats,
  type CardVM,
  type RowVM,
} from '@/features/inbox/utils/importCardModel';
import { getRowRequestedDelivery } from '@/features/inbox/utils/importEditDraft';
import { OrderItemPreviewList } from './OrderItemPreviewList';
import { RowStatusBadge } from './RowStatusBadge';
import type { ShortcutConfirm } from './ShortcutConfirmDialog';

// ปุ่ม action บน order card — ทุกปุ่มขนาด/จัดกลางเหมือนกัน ให้ grid เรียงเป็นระเบียบ
const CARD_ACTION_CLASS =
  'inline-flex h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] font-medium transition-colors disabled:opacity-40';

// การ์ด 1 ใบ = 1 draft order ในลิสต์ตรวจนำเข้า — badge สถานะ + ข้อมูลลูกค้า + ปุ่ม action ตามสถานะ
export function ImportOrderCard({
  card,
  order,
  showFile,
  checked,
  busy,
  editBusy,
  previewLoading,
  onToggle,
  onApprove,
  onReject,
  onRestore,
  onEdit,
  onPreviewImage,
  onSplit,
  onFastDispatch,
  onPlanning,
}: {
  card: CardVM;
  order: Order | undefined;
  showFile: boolean;
  checked: boolean;
  busy: boolean;
  editBusy: boolean;
  previewLoading: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onEdit: (row: RowVM) => void;
  onPreviewImage: (row: RowVM) => void;
  onSplit: () => void;
  onFastDispatch?: (confirm: ShortcutConfirm) => void;
  onPlanning?: (confirm: ShortcutConfirm) => void;
}) {
  const r = card.primary;
  const selectable = card.kind === 'review' && !!card.orderId && !!order;
  // ยกเลิกแล้วเป็นสถานะสุดทาง — แก้ไขไม่ได้ (ต่างจากปฏิเสธที่ยังดึงกลับมาแก้ได้)
  const editable = !!card.orderId && card.kind !== 'error' && card.kind !== 'cancelled';
  const showFastDispatchAction = !!card.orderId && canOpenFastDispatch(card, order);
  const showPlanningAction = !!card.orderId && canOpenPlanning(card, order);
  const plannedAlready = !!order && isUnreleasedPlannedOrder(order);
  const requiresApproval = card.kind === 'review';
  const deliveryQueueBadge = getDeliveryQueueBadge(order);
  const rowLabel =
    card.rows.length === 1
      ? `แถว ${r.rowIndex + 1}`
      : `แถว ${card.rows.map((row) => row.rowIndex + 1).join(', ')}`;
  const { skuCount, totalQty } = orderItemStats(order);
  const skuSummary =
    skuCount > 0
      ? `${skuCount.toLocaleString('th-TH')} SKU · ${totalQty.toLocaleString('th-TH')} ชิ้น`
      : r.item;
  const requestedDelivery = getRowRequestedDelivery(r, order);
  const requestedDeliveryText = requestedDelivery.date
    ? formatRequestedDelivery(requestedDelivery)
    : null;

  const shortcutPayload = (action: ShortcutConfirm['action']): ShortcutConfirm => ({
    orderId: card.orderId!,
    orderName: r.name,
    orderNo: order?.orderNo ?? null,
    action,
    requiresApproval,
    plannedAlready,
  });

  return (
    <div
      className={cn(
        'rounded-lg border bg-background p-3 transition-colors hover:border-border',
        checked && 'border-primary/40 bg-primary/5',
        (card.kind === 'rejected' || card.kind === 'cancelled') &&
          'bg-muted/40 text-muted-foreground',
      )}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="checkbox"
              aria-label={`เลือกออเดอร์จาก${rowLabel}`}
              checked={checked}
              disabled={!selectable}
              onChange={onToggle}
              className="h-3.5 w-3.5 disabled:opacity-30"
            />
            <RowStatusBadge kind={card.kind} />
            {order?.orderNo && (
              <span className="inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold">
                {order.orderNo}
                <CopyOrderNoButton orderNo={order.orderNo} className="h-4 w-4" />
              </span>
            )}
            {deliveryQueueBadge && (
              <Badge variant="success" className="h-5 gap-1 px-1.5 text-[10px]">
                <Route className="h-3 w-3" />
                {deliveryQueueBadge}
              </Badge>
            )}
            {card.rows.length > 1 && (
              <Badge variant="info" className="h-5 gap-1 px-1.5 text-[10px]">
                <Layers className="h-3 w-3" />
                รวม {card.rows.length} แถว
              </Badge>
            )}
            {skuSummary && (
              <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px]">
                <Package className="h-3 w-3" />
                {skuSummary}
              </Badge>
            )}
            {r.hasSourceImage && (
              <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px]">
                <ImageIcon className="h-3 w-3" />
                รูปต้นฉบับ
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {showFile ? `${r.fileName} · ${rowLabel}` : rowLabel}
            </span>
          </div>

          <div
            className={cn(
              'mt-2 truncate text-sm font-semibold',
              (card.kind === 'rejected' || card.kind === 'cancelled') && 'line-through',
            )}
          >
            {r.name}
          </div>

          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {card.kind === 'error' && r.errorMessage ? (
              <span className="text-destructive">{r.errorMessage}</span>
            ) : (
              r.address
            )}
          </div>

          {requestedDeliveryText && (
            <div className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md border border-info/30 bg-info/5 px-2.5 py-1 text-xs text-info">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0 font-medium">นัดส่ง</span>
              <span className="min-w-0 truncate text-foreground">{requestedDeliveryText}</span>
            </div>
          )}

          {order ? (
            <OrderItemPreviewList order={order} />
          ) : (
            r.item && (
              <div className="mt-2 flex items-center gap-1 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                <Package className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{r.item}</span>
              </div>
            )
          )}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 xl:w-[230px]">
          <div className="flex items-baseline justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 xl:block xl:text-right">
            <div className="text-[11px] text-muted-foreground">มูลค่ารวม</div>
            <div className="text-sm font-semibold tabular-nums text-warning">
              {r.value != null ? formatTHB(r.value) : '—'}
            </div>
          </div>

          {/* ปุ่มเรียงเป็น grid 2 คอลัมน์ขนาดเท่ากัน (จำนวนคี่ → ปุ่มสุดท้ายเต็มแถว)
            เรียงตามความสำคัญ: อนุมัติ/Fast Dispatch ก่อน, ปฏิเสธไว้ท้ายสุด */}
          <div className="grid grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
            {showFastDispatchAction && onFastDispatch && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onFastDispatch(shortcutPayload('fast'))}
                    className={cn(
                      CARD_ACTION_CLASS,
                      'border-primary bg-primary/5 text-primary hover:bg-primary/10',
                    )}
                  >
                    <Send className="h-3 w-3" />
                    {requiresApproval ? 'อนุมัติและส่งทันที' : 'ส่งทันที'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-[240px]">
                  <p className="font-semibold">
                    {plannedAlready
                      ? 'ถอดออกจากรอบ แล้วส่งทันที'
                      : requiresApproval
                        ? 'อนุมัติและไปหน้าส่งทันที'
                        : 'ไปหน้าส่งทันที'}
                  </p>
                  <p className="mt-0.5 font-normal leading-snug text-background/80">
                    {plannedAlready
                      ? 'order นี้ถูกจัดรอบไว้แล้ว — กดเพื่อถอดออกจากรอบ แล้วเปิดหน้า “ส่งทันที” เลือกคนขับมอบงานให้ Messenger ทันที'
                      : requiresApproval
                        ? 'อนุมัติออเดอร์ก่อน แล้วเปิดหน้า “ส่งทันที” พร้อมโฟกัส order นี้ให้เลย'
                        : 'เปิดหน้า “ส่งทันที” พร้อมโฟกัส order นี้ให้เลย — เลือกคนขับแล้วมอบงานให้ Messenger ได้ทันที'}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {showPlanningAction && onPlanning && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPlanning(shortcutPayload('planning'))}
                    className={cn(
                      CARD_ACTION_CLASS,
                      'border-info/50 bg-info/5 text-info hover:bg-info/10',
                    )}
                  >
                    <CalendarDays className="h-3 w-3" />
                    {requiresApproval ? 'อนุมัติและจัดรอบส่ง' : 'จัดรอบส่ง'}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-[240px]">
                  <p className="font-semibold">
                    {requiresApproval ? 'อนุมัติและไปหน้า Planning' : 'ไปหน้า Planning'}
                  </p>
                  <p className="mt-0.5 font-normal leading-snug text-background/80">
                    {requiresApproval
                      ? 'อนุมัติออเดอร์ก่อน แล้วเปิดหน้า Planning พร้อมโฟกัส order นี้ในลิสต์ “รอจัดรอบ”'
                      : 'เปิดหน้า Planning พร้อมโฟกัส order นี้ในลิสต์ “รอจัดรอบ” — เลือกวัน/เวลา/คนขับ แล้วบันทึกเพื่อมอบงานให้ Messenger'}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {card.kind === 'review' && card.orderId && (
              <button
                type="button"
                disabled={busy}
                onClick={onApprove}
                className={cn(
                  CARD_ACTION_CLASS,
                  'border-success/60 text-success hover:bg-success/10',
                )}
              >
                <CheckCircle2 className="h-3 w-3" />
                อนุมัติ
              </button>
            )}
            {editable && (
              <button
                type="button"
                disabled={busy || editBusy}
                onClick={() => onEdit(r)}
                className={cn(CARD_ACTION_CLASS, 'border-border text-foreground hover:bg-muted')}
              >
                <Pencil className="h-3 w-3" />
                แก้ไข
              </button>
            )}
            {r.hasSourceImage && (
              <button
                type="button"
                disabled={busy || previewLoading}
                onClick={() => onPreviewImage(r)}
                className={cn(CARD_ACTION_CLASS, 'border-border text-foreground hover:bg-muted')}
              >
                {previewLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                ดูรูป
              </button>
            )}
            {card.kind === 'review' && card.orderId && card.rows.length > 1 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onSplit}
                    className={cn(
                      CARD_ACTION_CLASS,
                      'border-border text-foreground hover:bg-muted',
                    )}
                  >
                    <Split className="h-3 w-3" />
                    แยกตามแถว
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" align="end" className="max-w-[240px]">
                  <p className="font-semibold">แยกตามแถวต้นทาง</p>
                  <p className="mt-0.5 font-normal leading-snug text-background/80">
                    แตกกลับเป็น {card.rows.length} ออเดอร์ตามแถวเดิมในไฟล์ —
                    ใช้เมื่อรวมผิดหรือไฟล์ตั้งใจให้เป็นคนละออเดอร์
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            {card.kind === 'review' && card.orderId && (
              <button
                type="button"
                disabled={busy}
                onClick={onReject}
                className={cn(
                  CARD_ACTION_CLASS,
                  'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <XCircle className="h-3 w-3" />
                ปฏิเสธ
              </button>
            )}
            {card.kind === 'rejected' && card.orderId && (
              <button
                type="button"
                disabled={busy}
                onClick={onRestore}
                className={cn(CARD_ACTION_CLASS, 'border-border text-foreground hover:bg-muted')}
              >
                <RotateCcw className="h-3 w-3" /> ดึงกลับ
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
