import { X } from 'lucide-react';
import type { ReactNode } from 'react';

type DetailDrawerProps = {
  /** เปิด overlay (ปกติผูกกับ "มีรายการที่เลือกอยู่หรือไม่") */
  open: boolean;
  /** หัวเรื่องบนแถบ header เช่น order code */
  title: ReactNode;
  /** บรรทัดรองใต้หัวเรื่อง เช่น สถานะ */
  subtitle?: ReactNode;
  onClose: () => void;
  /** แถบปุ่ม action ติดล่าง (sticky) — ไม่ใส่ก็ได้ถ้า action อยู่ใน body แล้ว */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Detail drawer แบบ responsive — มือถือแสดงเต็มจอ, เดสก์ท็อปสไลด์เป็นพาเนลด้านขวา
 * ใช้แทนคอลัมน์ detail แบบตายตัว เพื่อให้ list หลักได้พื้นที่เต็มและไม่มีคอลัมน์ว่าง
 */
export function DetailDrawer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: DetailDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 duration-200 animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-0 flex flex-col bg-background duration-200 animate-in slide-in-from-right lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[460px] lg:border-l lg:shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 pb-3 pt-safe lg:pt-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
            {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-auto p-4">{children}</div>

        {footer && (
          <div className="sticky bottom-0 border-t bg-background px-4 pt-3 pb-safe lg:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
