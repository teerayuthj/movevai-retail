import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import type { Driver } from '@/data/mock';
import { LogOut } from 'lucide-react';
import { NotificationTestButton } from './NotificationTestButton';

const statusLabel: Record<Driver['status'], string> = {
  available: 'ว่าง',
  on_delivery: 'กำลังส่ง',
  off_duty: 'หยุด',
};

export function RiderHeader({ rider, onExit }: { rider: Driver | null; onExit?: () => void }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-primary/5 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 pb-3 pt-safe">
        {rider && <DriverAvatar driver={rider} className="h-10 w-10" />}
        <div className="min-w-0 flex-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{rider?.name ?? '—'}</div>
            <div className="text-[11px] text-muted-foreground">
              {rider?.zone} · งานวันนี้ {rider?.activeOrders}/{rider?.capacity}
            </div>
          </div>
        </div>
        <Badge
          variant={rider?.status === 'available' ? 'success' : 'muted'}
          className="h-5 px-1.5 text-[10px]"
        >
          {rider ? statusLabel[rider.status] : '—'}
        </Badge>
      </div>

      <div className="border-t bg-background/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">บัญชี rider</span>
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-3 w-3" />
              ออกจากโหมด rider
            </button>
          )}
        </div>
        <div className="mt-2">
          <NotificationTestButton />
        </div>
      </div>
    </header>
  );
}
