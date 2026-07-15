import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { type Order, statusLabel } from '@/data/orderTypes';
import { formatPlanningDateTime, getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, Route } from 'lucide-react';

type TrackingRouteCardProps = {
  orders: Order[];
  selectedOrderId: string | null;
  onSelectStop: (order: Order) => void;
  actions?: ReactNode;
  nowMs: number;
};

function stopName(order: Order) {
  return order.customer.name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim();
}

function routeTitle(orders: Order[]) {
  const first = orders[0];
  const dispatch = first.metadataJson?.dispatch;
  return (
    dispatch?.messengerTitle?.trim() ||
    dispatch?.routeTemplateName?.trim() ||
    dispatch?.title?.trim() ||
    `เที่ยว ${stopName(first)} → ${stopName(orders[orders.length - 1])}`
  );
}

/**
 * Route Builder สร้างข้อมูลการปิดงานแบบ Order ต่อจุดอยู่ในระบบเดิม แต่หน้าติดตามต้อง
 * นำเสนอเป็น "หนึ่งเที่ยว หลายจุด" เพื่อไม่ให้ผู้ใช้เข้าใจว่าแต่ละจุดคือคำสั่งซื้อใหม่
 */
export function TrackingRouteCard({
  orders,
  selectedOrderId,
  onSelectStop,
  actions,
  nowMs,
}: TrackingRouteCardProps) {
  const sortedOrders = [...orders].sort(
    (a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0),
  );
  const first = sortedOrders[0];
  const route = first.deliveryRoute;
  const [expanded, setExpanded] = useState(false);
  const completed = sortedOrders.filter((order) =>
    ['pending_confirmation', 'delivered'].includes(order.status),
  ).length;
  const pickupCount = sortedOrders.filter(
    (order) => order.metadataJson?.dispatch?.routeLeg === 'pickup',
  ).length;
  const overdueMinutes = Math.max(
    ...sortedOrders.map((order) => getAssignedOrderOverdueMinutes(order, nowMs) ?? 0),
  );
  const hasSelectedStop = sortedOrders.some((order) => order.id === selectedOrderId);

  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border border-l-[3px] bg-card',
        overdueMinutes > 0
          ? 'border-l-destructive border-destructive/40 bg-destructive/5'
          : 'border-l-info',
        hasSelectedStop && 'ring-1 ring-primary',
      )}
    >
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <Route className="h-3.5 w-3.5" /> เที่ยววิ่ง
              <span className="font-mono">{route?.code ?? 'Route'}</span>
            </div>
            <div className="mt-1 truncate text-sm font-semibold">{routeTitle(sortedOrders)}</div>
          </div>
          <Badge
            variant={overdueMinutes > 0 ? 'destructive' : 'info'}
            className="shrink-0 text-[10px]"
          >
            {completed}/{sortedOrders.length} จุด
          </Badge>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {pickupCount > 0 ? `รับ ${pickupCount} · ` : ''}ส่ง {sortedOrders.length - pickupCount}
          </span>
          {first.deliveryPlan && (
            <span>
              · นัด{' '}
              {formatPlanningDateTime(
                first.deliveryPlan.plannedDate,
                first.deliveryPlan.plannedTime,
              )}
            </span>
          )}
          {overdueMinutes > 0 && (
            <span className="font-medium text-destructive">· เลยเวลานัดส่ง</span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full justify-between px-2 text-xs"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span>ดูจุดในเที่ยวนี้ ({sortedOrders.length})</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {expanded && (
        <ol className="border-t bg-muted/10 px-4 py-3" aria-label="จุดแวะในเที่ยว">
          {sortedOrders.map((order, index) => {
            const kind = order.metadataJson?.dispatch?.routeLeg ?? 'dropoff';
            const done = ['pending_confirmation', 'delivered'].includes(order.status);
            return (
              <li key={order.id} className="flex gap-2.5 py-1.5 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                    done
                      ? 'bg-success/15 text-success'
                      : kind === 'pickup'
                        ? 'bg-info text-white'
                        : 'bg-success text-white',
                  )}
                >
                  {index + 1}
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelectStop(order)}
                >
                  <div className="flex items-baseline gap-1 text-[12px] font-semibold">
                    <span className={kind === 'pickup' ? 'text-info' : 'text-success'}>
                      {kind === 'pickup' ? 'รับ' : 'ส่ง'}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate">{stopName(order)}</span>
                  </div>
                  <div className="line-clamp-1 text-[10px] text-muted-foreground">
                    {order.customer.address}
                  </div>
                </button>
                <Badge variant={done ? 'success' : 'muted'} className="h-5 shrink-0 text-[9px]">
                  {done ? 'เสร็จแล้ว' : statusLabel[order.status]}
                </Badge>
              </li>
            );
          })}
        </ol>
      )}

      {actions && <div className="border-t p-3">{actions}</div>}
    </article>
  );
}
