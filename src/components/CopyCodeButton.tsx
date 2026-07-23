import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type CopyCodeButtonProps = {
  /** ค่าที่จะคัดลอก — null/undefined = ยังไม่มีเลข → ไม่ render ปุ่ม */
  value: string | null | undefined;
  /** ป้ายกำกับชนิดของเลขสำหรับ toast/aria เช่น "เลขออเดอร์", "เลขเที่ยว" */
  label: string;
  className?: string;
};

/**
 * ปุ่มคัดลอกเลข (order/route/…) — วางคู่กับเลขในทุก surface ที่ admin ต้องเอาไปใช้ต่อ
 * ใช้ <span role="button"> แทน <button> จริง เพราะการ์ดหลายหน้า (Queue/Tracking) ครอบทั้งใบ
 * ด้วย <button> การเอา <button> ซ้อนเข้าไปเป็น invalid HTML และคลิกไม่ติด
 */
export function CopyCodeButton({ value, label, className }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const text = value;

  async function copy() {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      toast.success(`คัดลอก${label} ${text} แล้ว`);
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
      title={`คัดลอก${label}`}
      aria-label={`คัดลอก${label} ${text}`}
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
