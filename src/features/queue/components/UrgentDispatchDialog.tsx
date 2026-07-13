import { useEffect, useState } from 'react';
import { AlertTriangle, Navigation2, Send, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DriverAvatar } from '@/components/DriverAvatar';
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
  /** driverIds เรียงตาม role แล้ว — index 0 = คนขับหลัก (สลับได้ใน dialog) */
  onConfirm: (input: { note?: string; driverIds: string[] }) => void;
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
  // คนขับหลักที่เลือกใน dialog — เริ่มจากลำดับที่เลือกใน Queue แต่ admin สลับได้ก่อนยืนยัน
  const [mainDriverId, setMainDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote('');
      setMainDriverId(null);
    }
  }, [open]);

  if (!open || !order || drivers.length === 0) return null;

  const effectiveMainId =
    mainDriverId && drivers.some((driver) => driver.id === mainDriverId)
      ? mainDriverId
      : drivers[0].id;
  // เรียง main ขึ้นก่อนเสมอ — ลำดับนี้คือสัญญาเดียวกับ payload (index 0 = คนขับหลัก)
  const orderedDrivers = [
    ...drivers.filter((driver) => driver.id === effectiveMainId),
    ...drivers.filter((driver) => driver.id !== effectiveMainId),
  ];
  const selectedWorkloads = orderedDrivers.map((driver) => ({
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
            <div className="font-mono text-xs font-medium">{order.orderNo}</div>
            <div className="mt-1 font-medium">{order.customer.name}</div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              ทีมจัดส่ง ({orderedDrivers.length} คน)
            </div>
            <div className="mt-1.5 space-y-1.5">
              {orderedDrivers.map((driver) => {
                const isMain = driver.id === effectiveMainId;
                return (
                  <div
                    key={driver.id}
                    className={
                      isMain
                        ? 'flex items-center gap-2.5 rounded-lg border border-info/40 bg-info/5 px-3 py-2'
                        : 'flex items-center gap-2.5 rounded-lg border px-3 py-2'
                    }
                  >
                    <DriverAvatar driver={driver} className="h-8 w-8 shrink-0" />
                    <div className="min-w-0 flex-1 text-sm font-medium">{driver.name}</div>
                    {isMain ? (
                      <Badge variant="info" className="gap-1">
                        <Navigation2 className="h-3 w-3" />
                        คนขับหลัก
                      </Badge>
                    ) : (
                      <>
                        <Badge variant="muted" className="gap-1">
                          <Users className="h-3 w-3" />
                          คนขับร่วม
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px]"
                          disabled={loading}
                          onClick={() => setMainDriverId(driver.id)}
                        >
                          ตั้งเป็นหลัก
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {orderedDrivers.length > 1 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                คนขับหลักเป็นคนเริ่มงานและปิดงาน (ถ่ายหลักฐาน) —
                คนขับร่วมเห็นงานบนมือถือแบบดูอย่างเดียว
              </p>
            )}
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
          <Button
            size="sm"
            disabled={loading}
            onClick={() =>
              onConfirm({
                note: note.trim() || undefined,
                driverIds: orderedDrivers.map((driver) => driver.id),
              })
            }
          >
            <Send className="h-4 w-4" />
            {loading ? 'กำลังสร้าง Route…' : 'ยืนยันส่งทันที'}
          </Button>
        </div>
      </div>
    </div>
  );
}
