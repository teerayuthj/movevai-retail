import { Ban, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { RowKind } from '@/features/inbox/utils/importCardModel';

export function RowStatusBadge({ kind }: { kind: RowKind }) {
  if (kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <XCircle className="h-3 w-3 shrink-0" /> ผิดพลาด
      </span>
    );
  }
  if (kind === 'review') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <Clock className="h-3 w-3 shrink-0" /> รอตรวจ
      </span>
    );
  }
  if (kind === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <Ban className="h-3 w-3 shrink-0" /> ยกเลิกแล้ว
      </span>
    );
  }
  if (kind === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <XCircle className="h-3 w-3 shrink-0" /> ปฏิเสธ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
      <CheckCircle2 className="h-3 w-3 shrink-0" /> อนุมัติแล้ว
    </span>
  );
}
