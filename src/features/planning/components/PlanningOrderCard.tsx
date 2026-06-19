import { Badge } from '@/components/ui/badge';
import { dispatchReadinessLabel, formatTHB, type Driver, type Order } from '@/data/mock';
import { formatPlanningDateTime, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { Package } from 'lucide-react';

type PlanningOrderCardProps = {
  order: Order;
  drivers: Driver[];
  selected: boolean;
  onToggle: () => void;
};

export function PlanningOrderCard({ order, drivers, selected, onToggle }: PlanningOrderCardProps) {
  const plannedDriverName = order.deliveryPlan?.plannedDriverId
    ? drivers.find((driver) => driver.id === order.deliveryPlan?.plannedDriverId)?.name
    : undefined;
  const readiness = order.dispatchReadiness ?? 'ready';
  const needsAttention = readiness !== 'ready';
  const totalQuantity = order.items.reduce((total, item) => total + item.qty, 0);
  const itemSummary = order.items
    .map((item) => `${item.name} ${item.weight} × ${item.qty}`)
    .join(', ');

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full rounded-xl border bg-card p-4 text-left transition-all',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40',
        !selected && needsAttention && 'border-l-4 border-l-warning bg-warning/5',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.code}</span>
            {isUnreleasedPlannedOrder(order) ? (
              <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                {formatPlanningDateTime(
                  order.deliveryPlan!.plannedDate,
                  order.deliveryPlan!.plannedTime,
                )}
              </Badge>
            ) : (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                ยังไม่วางแผน
              </Badge>
            )}
            {needsAttention && (
              <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                {dispatchReadinessLabel[readiness]}
              </Badge>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
        </div>
        <Badge variant={selected ? 'default' : 'outline'} className="shrink-0">
          {selected ? 'เลือกแล้ว' : `${totalQuantity} ชิ้น`}
        </Badge>
      </div>
      <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Package className="h-3 w-3 shrink-0" />
          <span className="truncate">{itemSummary}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Package className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.customer.address}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {plannedDriverName ? `คนขับตามแผน: ${plannedDriverName}` : 'ยังไม่เลือกคนขับ'}
          </span>
          <span className="font-medium text-warning">{formatTHB(order.totalValue)}</span>
        </div>
      </div>
    </button>
  );
}
