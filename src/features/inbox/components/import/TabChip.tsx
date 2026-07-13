import { CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tab } from '@/features/inbox/utils/importCardModel';

export function TabChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: 'accent' | 'muted' | 'success' | 'destructive';
}) {
  const activeClass =
    tone === 'success'
      ? 'border-success bg-success/10 text-success'
      : tone === 'destructive'
        ? 'border-destructive bg-destructive/10 text-destructive'
        : tone === 'muted'
          ? 'border-foreground/40 text-foreground'
          : 'border-primary bg-primary/5 text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? activeClass : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label} {count}
    </button>
  );
}

// เมื่อ filter ของแท็บปัจจุบันว่าง ให้ชี้ว่ารายการไปอยู่แท็บไหน (ไม่ได้หาย — แค่เปลี่ยนสถานะ)
export function TabEmptyState({
  tab,
  stats,
  onJump,
}: {
  tab: Tab;
  stats: {
    review: number;
    approved: number;
    cancelled: number;
    rejected: number;
    error: number;
    total: number;
  };
  onJump: (tab: Tab) => void;
}) {
  const reviewCount = stats.review + stats.error;
  const suggestions: { tab: Tab; label: string; count: number }[] = [];
  if (tab !== 'approved' && stats.approved > 0)
    suggestions.push({ tab: 'approved', label: 'อนุมัติแล้ว', count: stats.approved });
  if (tab !== 'review' && reviewCount > 0)
    suggestions.push({ tab: 'review', label: 'รอตรวจ', count: reviewCount });
  if (tab !== 'cancelled' && stats.cancelled > 0)
    suggestions.push({ tab: 'cancelled', label: 'ยกเลิกแล้ว', count: stats.cancelled });
  if (tab !== 'rejected' && stats.rejected > 0)
    suggestions.push({ tab: 'rejected', label: 'ปฏิเสธ', count: stats.rejected });

  // ตรวจครบแล้ว (ไม่เหลือรอตรวจ แต่มีของในไฟล์) → เป็นสถานะที่ดี ไม่ใช่ error
  const reviewedClean = tab === 'review' && stats.total > 0;
  const title = reviewedClean
    ? 'ตรวจครบแล้ว — ไม่มีรายการรอตรวจ'
    : tab === 'approved'
      ? 'ยังไม่มีรายการที่อนุมัติเข้าคิว'
      : tab === 'cancelled'
        ? 'ไม่มีรายการที่ยกเลิก'
        : tab === 'rejected'
          ? 'ไม่มีรายการที่ปฏิเสธ'
          : 'ไม่มีรายการในกลุ่มนี้';

  return (
    <div className="flex flex-col items-center gap-2">
      {reviewedClean ? (
        <CheckCircle2 className="h-6 w-6 text-success/70" />
      ) : (
        <Clock className="h-6 w-6 text-muted-foreground/50" />
      )}
      <div className="text-sm text-muted-foreground">{title}</div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <span>รายการอยู่ที่:</span>
          {suggestions.map((s) => (
            <button
              key={s.tab}
              type="button"
              onClick={() => onJump(s.tab)}
              className="rounded-full border border-border px-2.5 py-1 font-medium text-foreground transition-colors hover:border-primary hover:text-primary"
            >
              {s.label} {s.count}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
