import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CopyOrderNoButtonProps = {
  /** null/undefined = draft ที่ยังไม่ออกเลข — ไม่ render ปุ่ม */
  orderNo: string | null | undefined;
  className?: string;
};

/**
 * ปุ่มคัดลอกเลขออเดอร์ — วางคู่กับ orderNo ในทุก surface ที่ admin ต้องเอาเลขไปใช้ต่อ
 * ใช้ <span role="button"> แทน <button> จริง เพราะการ์ดหลายหน้า (Queue/Tracking) ครอบทั้งใบ
 * ด้วย <button> การเอา <button> ซ้อนเข้าไปเป็น invalid HTML และคลิกไม่ติด
 */
export function CopyOrderNoButton({ orderNo, className }: CopyOrderNoButtonProps) {
  const [copied, setCopied] = useState(false);
  if (!orderNo) return null;
  const issuedOrderNo = orderNo;

  async function copy() {
    try {
      await navigator.clipboard?.writeText(issuedOrderNo);
      setCopied(true);
      toast.success(`คัดลอกเลขออเดอร์ ${orderNo} แล้ว`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('คัดลอกไม่สำเร็จ — กรุณาคัดลอกด้วยตนเอง');
    }
  }

  function handleClick(event: MouseEvent<HTMLSpanElement>) {
    // กัน card/row ที่ครอบอยู่ไม่ให้ถูกเลือกตอนกด copy
    event.stopPropagation();
    void copy();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      void copy();
    }
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      title="คัดลอกเลขออเดอร์"
      aria-label={`คัดลอกเลขออเดอร์ ${orderNo}`}
      className={cn(
        'inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        copied && 'text-success hover:text-success',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3 w-3" />}
    </span>
  );
}
