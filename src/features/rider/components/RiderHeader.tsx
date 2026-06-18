import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import type { Driver } from '@/data/mock';
import { ChevronRight } from 'lucide-react';

const statusLabel: Record<Driver['status'], string> = {
  available: 'ว่าง',
  on_delivery: 'กำลังส่ง',
  off_duty: 'หยุด',
};

export function RiderHeader({
  rider,
  onOpenProfile,
}: {
  rider: Driver | null;
  onOpenProfile?: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-primary/5 backdrop-blur-sm">
      <button
        type="button"
        onClick={onOpenProfile}
        disabled={!rider}
        className="flex w-full items-center gap-3 px-4 pb-3 pt-safe text-left disabled:cursor-default"
      >
        {rider && <DriverAvatar driver={rider} className="h-10 w-10" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{rider?.name ?? '—'}</div>
          <div className="text-[11px] text-muted-foreground">
            {rider?.zone} · งานวันนี้ {rider?.activeOrders}/{rider?.capacity}
          </div>
        </div>
        <Badge
          variant={rider?.status === 'available' ? 'success' : 'muted'}
          className="h-5 px-1.5 text-[10px]"
        >
          {rider ? statusLabel[rider.status] : '—'}
        </Badge>
        {rider && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
    </header>
  );
}
