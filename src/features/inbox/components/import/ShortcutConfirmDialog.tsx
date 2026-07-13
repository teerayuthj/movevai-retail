import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ข้อมูลที่ปุ่มลัดบน order card ส่งมาให้ยืนยันก่อนพาไปหน้า "ส่งทันที" / "จัดรอบส่ง"
export type ShortcutConfirm = {
  orderId: string;
  orderName: string;
  orderNo: string | null;
  action: 'fast' | 'planning';
  requiresApproval: boolean;
  plannedAlready: boolean;
};

export function ShortcutConfirmDialog({
  confirm,
  busy,
  onClose,
  onConfirm,
}: {
  confirm: ShortcutConfirm;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcut-confirm-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div>
            <h2 id="shortcut-confirm-title" className="text-base font-semibold">
              {confirm.requiresApproval
                ? confirm.action === 'fast'
                  ? 'อนุมัติและเปิดส่งทันที?'
                  : 'อนุมัติและเปิดจัดรอบส่ง?'
                : confirm.action === 'fast'
                  ? 'เปิดส่งทันที?'
                  : 'เปิดจัดรอบส่ง?'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">โปรดตรวจสอบก่อนดำเนินการ</p>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
            {confirm.orderNo && (
              <div className="font-mono text-[11px] font-medium">{confirm.orderNo}</div>
            )}
            <div className="mt-0.5 text-sm font-medium">{confirm.orderName}</div>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            {confirm.plannedAlready && confirm.action === 'fast'
              ? 'ออเดอร์นี้อยู่ในรอบส่งที่วางแผนไว้แล้ว ระบบจะถอดออกจากรอบเดิม แล้วเปิดหน้าส่งทันทีให้เลือก Messenger ใหม่'
              : confirm.requiresApproval
                ? confirm.action === 'fast'
                  ? 'ระบบจะอนุมัติออเดอร์เป็นการจัดส่งโดยคนขับภายใน แล้วเปิดหน้าส่งทันทีเพื่อเลือก Messenger และมอบงาน'
                  : 'ระบบจะอนุมัติออเดอร์เป็นการจัดส่งโดยคนขับภายใน แล้วเปิดหน้า Planning เพื่อกำหนดวัน เวลา และคนขับ'
                : confirm.action === 'fast'
                  ? 'ระบบจะเปิดหน้าส่งทันทีเพื่อเลือก Messenger และมอบงาน'
                  : 'ระบบจะเปิดหน้า Planning เพื่อกำหนดวัน เวลา และคนขับ'}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {confirm.requiresApproval
              ? confirm.action === 'fast'
                ? 'อนุมัติและส่งทันที'
                : 'อนุมัติและจัดรอบส่ง'
              : confirm.action === 'fast'
                ? 'เปิดส่งทันที'
                : 'เปิดจัดรอบส่ง'}
          </Button>
        </div>
      </div>
    </div>
  );
}
