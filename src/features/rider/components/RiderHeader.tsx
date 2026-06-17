import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import { cn } from '@/lib/utils';
import type { Driver } from '@/data/mock';
import { ChevronDown, LogOut } from 'lucide-react';
import { NotificationTestButton } from './NotificationTestButton';

const statusLabel: Record<Driver['status'], string> = {
  available: 'ว่าง',
  on_delivery: 'กำลังส่ง',
  off_duty: 'หยุด',
};

export function RiderHeader({
  rider,
  drivers,
  riderId,
  switcherOpen,
  onToggleSwitcher,
  onSelectRider,
  onExit,
}: {
  rider: Driver | null;
  drivers: Driver[];
  riderId: string;
  switcherOpen: boolean;
  onToggleSwitcher: () => void;
  onSelectRider: (id: string) => void;
  onExit?: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b bg-primary/5 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-4 pb-3 pt-safe">
        {rider && <DriverAvatar driver={rider} className="h-10 w-10" />}
        <button
          type="button"
          onClick={onToggleSwitcher}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{rider?.name ?? '—'}</div>
            <div className="text-[11px] text-muted-foreground">
              {rider?.zone} · งานวันนี้ {rider?.activeOrders}/{rider?.capacity}
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              switcherOpen && 'rotate-180',
            )}
          />
        </button>
        <Badge
          variant={rider?.status === 'available' ? 'success' : 'muted'}
          className="h-5 px-1.5 text-[10px]"
        >
          {rider ? statusLabel[rider.status] : '—'}
        </Badge>
      </div>

      {/* identity switcher — จำลองการ login (ของจริงจะมาจาก auth ของ rider) */}
      {switcherOpen && (
        <div className="border-t bg-background/60 px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground">
              สลับบัญชี rider (จำลองการล็อกอิน)
            </span>
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
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {drivers.map((driver) => (
              <button
                key={driver.id}
                type="button"
                onClick={() => onSelectRider(driver.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                  driver.id === riderId
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                <DriverAvatar driver={driver} className="h-5 w-5" />
                {driver.name.split(' ')[0]}
              </button>
            ))}
          </div>

          <NotificationTestButton />
        </div>
      )}
    </header>
  );
}
