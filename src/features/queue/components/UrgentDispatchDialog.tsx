import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DriverWorkloadChips } from '@/components/delivery/DeliveryExecutionShared';
import type { Driver, Order } from '@/data/orderTypes';
import { getDriverWorkloadSummary } from '@/lib/deliveryExecution';

type Props = {
  open: boolean;
  order: Order | null;
  /** คนขับที่เลือก (co-delivery) — index 0 = คนขับหลัก, ที่เหลือ = คนขับร่วม */
  drivers: Driver[];
  orders: Order[];
  loading: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (note?: string) => void;
};

export function UrgentDispatchDialog({
  open,
  order,
  drivers,
  orders,
  loading,
  error,
  onCancel,
  onConfirm,
}: Props) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  if (!open || !order || drivers.length === 0) return null;

  const messengerLabel =
    drivers.length === 1
      ? drivers[0].name
      : `${drivers[0].name} + ร่วมส่งอีก ${drivers.length - 1} คน (${drivers
          .slice(1)
          .map((driver) => driver.name)
          .join(', ')})`;
  const selectedWorkloads = drivers.map((driver) => ({
    driver,
    workload: getDriverWorkloadSummary(driver, orders),
  }));
  const driversWithExistingWork = selectedWorkloads.filter(
    ({ workload }) =>
      workload.waitingToStart > 0 ||
      workload.inTransit > 0 ||
      workload.pendingReview > 0 ||
      workload.returning > 0 ||
      workload.plannedForDate > 0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Send className="h-4 w-4 text-info" /> ส่งทันที
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              สร้าง Route และ Push ไปหา Messenger ทันที
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="font-mono text-xs font-medium">{order.code}</div>
            <div className="mt-1 font-medium">{order.customer.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">Messenger: {messengerLabel}</div>
          </div>
          {driversWithExistingWork.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                Messenger ที่เลือกมีงานค้างอยู่
              </div>
              <div className="mt-1 text-[11px] text-warning/90">
                ยืนยันอีกครั้งว่าต้องการจ่ายงานเพิ่มให้คนนี้
              </div>
              <div className="mt-2 space-y-1.5">
                {driversWithExistingWork.map(({ driver, workload }) => (
                  <div key={driver.id} className="rounded-md bg-background/70 px-2 py-1.5">
                    <div className="font-medium text-foreground">{driver.name}</div>
                    <DriverWorkloadChips workload={workload} className="mt-1" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <div className="flex items-start gap-2">
              <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Messenger ต้องกดรับงานเองภายใน 5 นาที หากยังไม่รับ ระบบจะย้ายไปสถานะ “เลยกำหนด”
              </span>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น ลูกค้ารอรับที่หน้างาน"
              className="mt-1"
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            กลับ
          </Button>
          <Button size="sm" disabled={loading} onClick={() => onConfirm(note.trim() || undefined)}>
            <Send className="h-4 w-4" />
            {loading ? 'กำลังสร้าง Route…' : 'ยืนยันส่งทันที'}
          </Button>
        </div>
      </div>
    </div>
  );
}
