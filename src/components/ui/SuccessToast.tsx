import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toast แจ้งผลสำเร็จ — ลอยมุมขวาบนผ่าน portal (ไม่ถูก overflow ของ content บัง)
 * ผู้เรียกคุมการแสดง/ซ่อนด้วย message + onClose (เช่น auto-dismiss ด้วย setTimeout)
 */
export function SuccessToast({
  message,
  onClose,
  className,
}: {
  message: string;
  onClose: () => void;
  className?: string;
}) {
  if (!message) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex justify-end px-4 sm:px-6">
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'pointer-events-auto flex max-w-sm items-start gap-2 rounded-xl border border-success/30 bg-background px-3 py-2.5 text-xs text-success shadow-lg duration-300 animate-in slide-in-from-top-2 fade-in',
          className,
        )}
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1 leading-relaxed">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="shrink-0 rounded-md text-success/70 transition-colors hover:text-success"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
