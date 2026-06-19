import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { type Order, formatTHB, postalServiceLabel, statusLabel } from '@/data/mock';
import { cn } from '@/lib/utils';
import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  ExternalLink,
  PackageCheck,
  Truck as TruckIcon,
  XCircle,
} from 'lucide-react';
import { OrderSummary, ResolutionInfoBlock } from './OrderSummary';

function EmptySelection() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">เลือกออเดอร์จากคอลัมน์ซ้าย</div>
  );
}

export function ReadyActionPanel({
  selectedList,
  selectedValue,
  onExport,
  selectedOrder,
  onRequestCancel,
}: {
  selectedList: Order[];
  selectedValue: number;
  onExport: () => void;
  selectedOrder?: Order | null;
  onRequestCancel?: () => void;
}) {
  const hasSelection = selectedList.length > 0;
  return (
    <>
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">เลือกแล้ว {selectedList.length} ออเดอร์</span>
          <span className="font-semibold tabular-nums text-warning">
            {formatTHB(selectedValue)}
          </span>
        </div>
        {hasSelection ? (
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {selectedList.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between">
                <span className="font-mono">{o.code}</span>
                <span className="line-clamp-1 ml-2 max-w-48 truncate">{o.customer.name}</span>
              </div>
            ))}
            {selectedList.length > 5 && (
              <div className="text-[10px]">· · · อีก {selectedList.length - 5} รายการ · · ·</div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-muted-foreground">
            เลือกออเดอร์จากรายการด้านซ้าย
          </div>
        )}
      </div>

      <Button className="w-full" disabled={!hasSelection} onClick={onExport}>
        <Download className="h-4 w-4" />
        Export CSV + สร้าง Batch
      </Button>

      {selectedOrder && onRequestCancel && (
        <Button
          variant="outline"
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRequestCancel}
        >
          <Ban className="h-4 w-4" />
          ยกเลิก {selectedOrder.code}
        </Button>
      )}
    </>
  );
}

export function AssignedActionPanel({
  order,
  onTracking,
  onHandOver,
  onReExport,
  onRequestCancel,
}: {
  order: Order | null;
  onTracking: (orderId: string, tracking: string) => void;
  onHandOver: (orderId: string) => void;
  onReExport: (batchId: string) => void;
  onRequestCancel: (orderId: string) => void;
}) {
  const [draft, setDraft] = useState(order?.postalBatch?.trackingNumber ?? '');

  useEffect(() => {
    setDraft(order?.postalBatch?.trackingNumber ?? '');
  }, [order?.id, order?.postalBatch?.trackingNumber]);

  if (!order) return <EmptySelection />;

  const batch = order.postalBatch;
  if (!batch) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">ออเดอร์นี้ยังไม่มี batch</div>
    );
  }

  const hasTracking = !!batch.trackingNumber;
  const trackingDirty = draft.trim().length > 0 && draft.trim() !== (batch.trackingNumber ?? '');

  return (
    <>
      <OrderSummary order={order} />

      <div className="rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Batch
            </div>
            <div className="font-mono text-sm font-semibold">{batch.batchId}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              บริการ {postalServiceLabel[batch.service]} · export เมื่อ{' '}
              {new Date(batch.exportedAt).toLocaleString('th', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => onReExport(batch.batchId)}>
            <Download className="h-3.5 w-3.5" />
            CSV ซ้ำ
          </Button>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground">
          เลขติดตาม (EMS / ลงทะเบียน)
        </label>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase().trim())}
          placeholder="เช่น EX123456789TH"
          className="mt-1 font-mono"
        />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={!trackingDirty}
            onClick={() => onTracking(order.id, draft.trim())}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            บันทึกเลข
          </Button>
          <Button
            size="sm"
            className="flex-1"
            disabled={!hasTracking}
            onClick={() => onHandOver(order.id)}
          >
            <TruckIcon className="h-3.5 w-3.5" />
            ยืนยันฝากไปรษณีย์
          </Button>
        </div>
        {!hasTracking && (
          <div className="mt-2 text-[11px] text-muted-foreground">
            กรอกเลข EMS แล้วกดบันทึกก่อน ถึงจะยืนยันฝากได้
          </div>
        )}
      </div>

      <Button
        variant="outline"
        className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onRequestCancel(order.id)}
      >
        <Ban className="h-4 w-4" />
        ยกเลิกออเดอร์
      </Button>
    </>
  );
}

export function InTransitActionPanel({
  order,
  onComplete,
  onRequestFail,
}: {
  order: Order | null;
  onComplete: (orderId: string) => void;
  onRequestFail: (orderId: string) => void;
}) {
  if (!order) return <EmptySelection />;
  const batch = order.postalBatch;
  return (
    <>
      <OrderSummary order={order} />

      {batch && (
        <div className="rounded-lg border p-3 text-xs">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                เลขติดตาม
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold">{batch.trackingNumber}</div>
            </div>
            <a
              href={`https://track.thailandpost.co.th/?trackNumber=${batch.trackingNumber}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> ไปรษณีย์ไทย
            </a>
          </div>
          {batch.handedOverAt && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              ฝากเมื่อ{' '}
              {new Date(batch.handedOverAt).toLocaleString('th', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => onComplete(order.id)}>
          <CheckCircle2 className="h-4 w-4" />
          ส่งสำเร็จ
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => onRequestFail(order.id)}>
          <XCircle className="h-4 w-4" />
          ส่งไม่สำเร็จ
        </Button>
      </div>
    </>
  );
}

export function ReturningPanel({
  order,
  onMarkReturned,
}: {
  order: Order | null;
  onMarkReturned: (orderId: string) => void;
}) {
  if (!order) return <EmptySelection />;
  return (
    <>
      <OrderSummary order={order} />
      {order.resolution && <ResolutionInfoBlock order={order} />}
      <Button className="w-full" onClick={() => onMarkReturned(order.id)}>
        <PackageCheck className="h-4 w-4" />
        รับคืนเข้าสาขาแล้ว
      </Button>
    </>
  );
}

export function ClosedPanel({ order }: { order: Order | null }) {
  if (!order) return <EmptySelection />;
  const tone =
    order.status === 'delivered'
      ? 'border-success/30 bg-success/10 text-success'
      : order.status === 'returned'
        ? 'border-info/30 bg-info/10 text-info'
        : order.status === 'cancelled'
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : 'border-warning/30 bg-warning/10 text-warning';
  return (
    <>
      <OrderSummary order={order} />
      <div className={cn('rounded-lg border p-3 text-xs', tone)}>
        <div className="flex items-center gap-1.5 font-medium">
          {order.status === 'delivered' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : order.status === 'returned' ? (
            <PackageCheck className="h-4 w-4" />
          ) : order.status === 'cancelled' ? (
            <Ban className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {statusLabel[order.status]}
        </div>
        {order.postalBatch?.trackingNumber && (
          <div className="mt-1 font-mono text-[11px]">{order.postalBatch.trackingNumber}</div>
        )}
      </div>
      {order.resolution && <ResolutionInfoBlock order={order} />}
    </>
  );
}
