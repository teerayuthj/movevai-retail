import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import { DriverWorkloadChips } from '@/components/delivery/DeliveryExecutionShared';
import type { Driver, Order } from '@/data/orderTypes';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
import { deriveDriverDisplayStatus, getDriverWorkloadSummary } from '@/lib/deliveryExecution';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

type DriverPlanningCardProps = {
  driver: Driver;
  orders: Order[];
  plannedLoad: number;
  selected: boolean;
  selectedDate: string;
  onSelect: () => void;
};

export function DriverPlanningCard({
  driver,
  orders,
  plannedLoad,
  selected,
  selectedDate,
  onSelect,
}: DriverPlanningCardProps) {
  const displayStatus = deriveDriverDisplayStatus(driver, orders);
  const status =
    displayStatus === 'available'
      ? { label: 'ว่าง', variant: 'success' as const }
      : displayStatus === 'on_delivery'
        ? { label: 'กำลังส่ง', variant: 'muted' as const }
        : { label: 'หยุด', variant: 'warning' as const };
  const workload = getDriverWorkloadSummary(driver, orders, { plannedDate: selectedDate });

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
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-[11px]">
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
          <span className="text-muted-foreground">
            แผนวันที่ {formatPlanningDate(selectedDate)}
          </span>
          <span className="font-semibold tabular-nums">{plannedLoad}</span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>ภาระงาน messenger</span>
          <span className="font-medium tabular-nums">
            {workload.waitingToStart +
              workload.inTransit +
              workload.pendingReview +
              workload.returning}
          </span>
        </div>
        <DriverWorkloadChips workload={workload} plannedLabel="แผนวันนั้น" />
      </div>
    </button>
  );
}
