import type { ReactNode } from 'react';
import { AlertTriangle, ClipboardCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DriverAvatar } from '@/components/DriverAvatar';
import { DriverWorkloadChips } from '@/components/delivery/DeliveryExecutionShared';
import { getDriverWorkloadSummary } from '@/lib/deliveryExecution';
import type { Driver, Order } from '@/data/orderTypes';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  /** เตือนให้ตรวจสอบ แต่ยังยืนยันได้ */
  warnings?: string[];
  /** ปัญหาที่ต้องกลับไปแก้ก่อน — ปุ่มยืนยันถูก disable */
  errors?: string[];
  confirmLabel: string;
  submitting?: boolean;
  /** ใช้ z-[60] เมื่อซ้อนบน modal อื่นที่เป็น z-50 อยู่แล้ว */
  overlayClassName?: string;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

/** Dialog คั่นก่อนส่งงานถึงมือ Messenger — ให้แอดมิน recheck สรุปงานก่อนยิงจริง */
export function ConfirmDispatchDialog({
  open,
  title,
  description,
  warnings = [],
  errors = [],
  confirmLabel,
  submitting = false,
  overlayClassName,
  onCancel,
  onConfirm,
  children,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center',
        overlayClassName,
      )}
    >
      <div className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="app-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {children}

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-warning/30 bg-warning/10 p-3">
              {warnings.map((warning, index) => (
                <div
                  key={index}
                  className="flex items-start gap-1.5 text-xs font-medium text-warning"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {errors.map((error, index) => (
                <div
                  key={index}
                  className="flex items-start gap-1.5 text-xs font-medium text-destructive"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" size="action" onClick={onCancel} disabled={submitting}>
            กลับไปแก้ไข
          </Button>
          <Button
            size="action"
            className="sm:min-w-56"
            onClick={onConfirm}
            disabled={submitting || errors.length > 0}
          >
            {submitting ? 'กำลังส่งงาน…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** แถวสรุปคนขับพร้อม workload — ใช้ร่วมกันทุกจุดที่มี ConfirmDispatchDialog */
export function DriverSummaryRow({
  driver,
  orders,
  plannedDate,
  detail,
}: {
  driver: Driver;
  orders: Order[];
  /** วันที่ใช้นับงานตามแผนใน workload chips (default วันนี้) */
  plannedDate?: string;
  /** บรรทัดรายละเอียดใต้ชื่อ เช่น SLA หรือเวลาออก */
  detail?: ReactNode;
}) {
  const workload = getDriverWorkloadSummary(driver, orders, { plannedDate });
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
      <DriverAvatar driver={driver} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{driver.name}</div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
        <DriverWorkloadChips
          workload={workload}
          plannedLabel="แผนวันนั้น"
          emptyLabel="ไม่มีงานค้าง"
          className="mt-1.5"
        />
      </div>
    </div>
  );
}
