import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import type { Driver } from '@/data/orderTypes';
import { ChevronRight } from 'lucide-react';

const statusLabel: Record<Driver['status'], string> = {
  available: 'ว่าง',
  on_delivery: 'กำลังส่ง',
  off_duty: 'หยุด',
};

export function MessengerHeader({
  messenger,
  effectiveStatus,
  activeOrders,
  onOpenProfile,
}: {
  messenger: Driver | null;
  /** สถานะที่สะท้อนกิจกรรมจริง (เช่น กำลังส่ง GPS) — override ค่า static ใน driver record */
  effectiveStatus?: Driver['status'];
  /** จำนวนงานที่คำนวณจาก order สดในหน้านี้ แทน driver metadata ที่อาจค้าง */
  activeOrders?: number;
  onOpenProfile?: () => void;
}) {
  const status = effectiveStatus ?? messenger?.status;
  const displayedActiveOrders = activeOrders ?? messenger?.activeOrders;
  const workSummary = `งานวันนี้ ${displayedActiveOrders ?? '—'}`;
  return (
    <header className="sticky top-0 z-10 border-b bg-primary/5 backdrop-blur-sm">
      <button
        type="button"
        onClick={onOpenProfile}
        disabled={!messenger}
        className="flex w-full items-center gap-3 px-4 pb-3 pt-safe text-left disabled:cursor-default"
      >
        {messenger && <DriverAvatar driver={messenger} className="h-10 w-10" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{messenger?.name ?? '—'}</div>
          <div className="text-[11px] text-muted-foreground">{workSummary}</div>
        </div>
        <Badge
          variant={status === 'on_delivery' ? 'info' : status === 'available' ? 'success' : 'muted'}
          className="h-5 px-1.5 text-[10px]"
        >
          {status ? statusLabel[status] : '—'}
        </Badge>
        {messenger && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
    </header>
  );
}
