import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import type { Driver } from '@/data/mock';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import { formatDriverStatus } from '../utils/planningHelpers';

type DriverPlanningCardProps = {
  driver: Driver;
  plannedLoad: number;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
};

export function DriverPlanningCard({
  driver,
  plannedLoad,
  selected,
  selectedDate,
  onSelect,
}: DriverPlanningCardProps) {
  const status = formatDriverStatus(driver);
  const capacityOverflow = plannedLoad > driver.capacity;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl border p-4 text-left transition-all',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{driver.name}</span>
            <Badge variant={status.variant} className="h-5 px-1.5 text-[10px]">
              {status.label}
            </Badge>
            {driver.status === 'off_duty' && (
              <Badge variant="warning" className="h-5 gap-1 px-1.5 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                Off duty
              </Badge>
            )}
            {capacityOverflow && (
              <Badge variant="warning" className="h-5 gap-1 px-1.5 text-[10px]">
                <AlertTriangle className="h-3 w-3" />
                เกิน capacity
              </Badge>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{driver.zone}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-muted-foreground">
            แผนวันที่ {formatPlanningDate(selectedDate)}
          </span>
          <span className="font-semibold tabular-nums">
            {plannedLoad}/{driver.capacity}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>งาน active วันนี้</span>
          <span className="font-medium tabular-nums">{driver.activeOrders}</span>
        </div>
      </div>
    </button>
  );
}
