import {
  AlertTriangle,
  CalendarClock,
  Bot,
  FileSpreadsheet,
  Image as ImageIcon,
  MessageSquare,
  Package,
  Pencil,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Order,
  dispatchReadinessLabel,
  formatTHB,
  sourceLabel,
  statusLabel,
} from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import { formatPlanningDate, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';

const STATUS_COLORS: Partial<
  Record<
    Order['status'],
    'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'muted'
  >
> = {
  new: 'muted',
  parsing: 'muted',
  needs_review: 'warning',
  ready: 'success',
  in_transit: 'muted',
  delivered: 'muted',
};

export function SourceIcon({ source }: { source: Order['source'] }) {
  const iconBySource = {
    line_text: MessageSquare,
    line_image: ImageIcon,
    line_excel: FileSpreadsheet,
    line_csv: FileSpreadsheet,
    internal_chat: Bot,
    manual: Pencil,
  };

  const Icon = iconBySource[source];
  return <Icon className="h-3.5 w-3.5" />;
}

export default function OrderListItem({
  order,
  selected,
  onClick,
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
}) {
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const firstItem = order.items[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-border bg-muted' : 'border-transparent hover:bg-muted/60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.code}</span>
        <Badge
          variant={STATUS_COLORS[order.status] ?? 'secondary'}
          className="h-5 px-1.5 text-[10px]"
        >
          {statusLabel[order.status]}
        </Badge>
      </div>

      <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>

      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <SourceIcon source={order.source} />
        <span>{sourceLabel[order.source]}</span>
        <span>·</span>
        <span>
          {new Date(order.receivedAt).toLocaleTimeString('th', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
      {order.status !== 'parsing' && (
        <>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
            <span className="text-xs font-semibold tabular-nums text-warning">
              {formatTHB(order.totalValue)}
            </span>
          </div>
          {firstItem && (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Package className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {order.items.length.toLocaleString('th-TH')} SKU ·{' '}
                {totalQty.toLocaleString('th-TH')} ชิ้น · {firstItem.name}
                {order.items.length > 1 && ` (+${order.items.length - 1})`}
              </span>
            </div>
          )}
          {(isUnreleasedPlannedOrder(order) || order.dispatchReadiness === 'awaiting_items') && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {isUnreleasedPlannedOrder(order) && order.deliveryPlan && (
                <Badge variant="info" className="h-5 gap-1 px-1.5 text-[10px]">
                  <CalendarClock className="h-3 w-3" />
                  {formatPlanningDate(order.deliveryPlan.plannedDate)}
                </Badge>
              )}
              {order.dispatchReadiness === 'awaiting_items' && (
                <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                  {dispatchReadinessLabel.awaiting_items}
                </Badge>
              )}
            </div>
          )}
          {order.confidence < 80 && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
              <AlertTriangle className="h-3 w-3" />
              ต้องตรวจข้อมูล
            </div>
          )}
        </>
      )}
    </button>
  );
}
