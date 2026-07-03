import { Badge } from '@/components/ui/badge';
import { dispatchReadinessLabel, formatTHB, type Driver, type Order } from '@/data/orderTypes';
import { formatPlanningDateTime, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { MapPin, Minus, Package, Plus } from 'lucide-react';

type PlanningOrderCardProps = {
  order: Order;
  drivers: Driver[];
  selected: boolean;
  onSelect: () => void;
  onToggleGroup: () => void;
  onViewMap: () => void;
};

export function PlanningOrderCard({
  order,
  drivers,
  selected,
  onSelect,
  onToggleGroup,
  onViewMap,
}: PlanningOrderCardProps) {
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
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-xl border bg-card p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleGroup();
          }}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
            selected
              ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
              : 'border-border bg-background text-foreground hover:bg-muted',
          )}
        >
          {selected ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {selected ? 'นำออก' : 'เพิ่ม'}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onViewMap();
          }}
          className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-info/30 bg-info/5 px-2.5 py-1 text-[11px] font-medium text-info transition-colors hover:bg-info/10"
        >
          <MapPin className="h-3.5 w-3.5" />
          ดูแผนที่
        </button>
      </div>
    </div>
  );
}
