import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type MobileDetailSheetProps = {
  /** เปิด overlay (ปกติผูกกับ "มีรายการที่เลือกอยู่หรือไม่") */
  open: boolean;
  /** หัวเรื่องบนแถบ header เช่น order code */
  title: ReactNode;
  /** บรรทัดรองใต้หัวเรื่อง เช่น สถานะ */
  subtitle?: ReactNode;
  onClose: () => void;
  /** แถบปุ่ม action ติดล่างจอ (sticky) — ไม่ใส่ก็ได้ถ้า action อยู่ใน body แล้ว */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Master-detail overlay สำหรับมือถือ — แสดงเต็มจอเฉพาะจอเล็ก (`lg:hidden`)
 * ใช้คู่กับหน้าที่มี list + detail หลายคอลัมน์บนเดสก์ท็อป
 * (เดสก์ท็อปยังใช้ layout เดิม, มือถือเปิดรายละเอียดทับเป็น full-screen)
 */
export function MobileDetailSheet({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
}: MobileDetailSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background duration-200 animate-in slide-in-from-right lg:hidden">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-3 pb-3 pt-safe">
        <button
          type="button"
          onClick={onClose}
          aria-label="ย้อนกลับ"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-4">{children}</div>

      {footer && (
        <div className="sticky bottom-0 border-t bg-background px-4 pt-3 pb-safe">{footer}</div>
      )}
    </div>
  );
}
