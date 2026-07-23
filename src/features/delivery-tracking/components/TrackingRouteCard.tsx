import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DriverAvatar } from '@/components/DriverAvatar';
import { CopyRouteCodeButton } from '@/components/CopyRouteCodeButton';
import { type Order, statusLabel } from '@/data/orderTypes';
import { formatPlanningDateTime, getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';
import { groupRouteOrdersIntoJobs } from '@/lib/deliveryJobs';
import { shortRouteCode } from '@/lib/routeCode';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import { ChevronDown, ChevronUp, Navigation, Route, UserRound } from 'lucide-react';

type TrackingRouteCardProps = {
  orders: Order[];
  selectedOrderId: string | null;
  onSelectStop: (order: Order) => void;
  onViewLive: (order: Order) => void;
  actions?: ReactNode;
  /** เพิ่งกด action — ทำให้ทั้งการ์ดเที่ยวค่อย ๆ จางก่อนรีเฟรชรายการ */
  settling?: boolean;
  /** ข้อความสรุป action ที่เพิ่งทำ */
  settledLabel?: string;
  nowMs: number;
};

function stopName(order: Order) {
  return order.customer.name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim();
}

function routeTitle(orders: Order[]) {
  const first = orders[0];
  const dispatch = first.metadataJson?.dispatch;
  const custom =
    dispatch?.messengerTitle?.trim() ||
    dispatch?.routeTemplateName?.trim() ||
    dispatch?.title?.trim();
  if (custom) return custom;
  const firstName = stopName(first);
  const lastName = stopName(orders[orders.length - 1]);
  // เที่ยวจุดเดียว (เช่นสร้างจากศูนย์จัดส่ง) ต้น–ปลายคือลูกค้าคนเดียวกัน
  // ถ้าแสดง "ชื่อ → ชื่อ" จะดูเป็นข้อมูลผิด — แสดงจุดหมายเดียวพอ
  if (orders.length === 1 || firstName === lastName) {
    const leg = first.metadataJson?.dispatch?.routeLeg === 'pickup' ? 'รับ' : 'ส่ง';
    return `${leg} · ${firstName}`;
  }
  return `${firstName} → ${lastName}`;
}

// สรุปสถานะรวมของเที่ยวจากสถานะรายจุด — เรียงตามความสำคัญที่คนดูหน้า monitoring อยากรู้ก่อน
function routeStatusSummary(orders: Order[]): {
  label: string;
  variant: 'info' | 'warning' | 'success' | 'muted';
} {
  if (orders.some((order) => order.status === 'in_transit'))
    return { label: statusLabel.in_transit, variant: 'info' };
  if (orders.some((order) => order.status === 'assigned'))
    return { label: statusLabel.assigned, variant: 'muted' };
  if (orders.some((order) => order.status === 'pending_confirmation'))
    return { label: statusLabel.pending_confirmation, variant: 'warning' };
  if (orders.every((order) => order.status === 'delivered'))
    return { label: statusLabel.delivered, variant: 'success' };
  return { label: statusLabel[orders[0].status], variant: 'muted' };
}

/**
 * Route Builder สร้างข้อมูลการปิดงานแบบ Order ต่อจุดอยู่ในระบบเดิม แต่หน้าติดตามต้อง
 * นำเสนอเป็น "หนึ่งเที่ยว หลายจุด" เพื่อไม่ให้ผู้ใช้เข้าใจว่าแต่ละจุดคือคำสั่งซื้อใหม่
 */
export function TrackingRouteCard({
  orders,
  selectedOrderId,
  onSelectStop,
  onViewLive,
  actions,
  settling = false,
  settledLabel,
  nowMs,
}: TrackingRouteCardProps) {
  const { drivers } = useRetailStore();
  const sortedOrders = [...orders].sort(
    (a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0),
  );
  const first = sortedOrders[0];
  const route = first.deliveryRoute;
  const driverOrder = sortedOrders.find((order) => order.assignedDriverId);
  const driver = drivers.find((item) => item.id === driverOrder?.assignedDriverId) ?? null;
  const driverName = driver?.name ?? driverOrder?.assignedDriverName ?? null;
  const status = routeStatusSummary(sortedOrders);
  const routeJobs = groupRouteOrdersIntoJobs(sortedOrders);
  const [expanded, setExpanded] = useState(false);
  // นับความคืบหน้าเป็น "งาน" (จุดส่ง) ไม่ใช่ราย leg — งานถือว่าเสร็จเมื่อจุดส่งปิดแล้ว
  // ส่วนจุดรับเป็นขั้นย่อยของงาน จึงไม่นับซ้ำ
  const completed = routeJobs.filter((job) => {
    const dropoff =
      job.stops.find((stop) => stop.metadataJson?.dispatch?.routeLeg !== 'pickup') ??
      job.stops[job.stops.length - 1];
    return ['pending_confirmation', 'delivered'].includes(dropoff.status);
  }).length;
  const overdueMinutes = Math.max(
    ...sortedOrders.map((order) => getAssignedOrderOverdueMinutes(order, nowMs) ?? 0),
  );
  const hasSelectedStop = sortedOrders.some((order) => order.id === selectedOrderId);

  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border border-l-[3px] bg-card transition-all duration-500',
        overdueMinutes > 0
          ? 'border-l-destructive border-destructive/40 bg-destructive/5'
          : 'border-l-info',
        hasSelectedStop && 'ring-1 ring-primary',
        // ใช้ effect เดียวกับ TrackingCard: หลังปิดงานยังเห็นผลลัพธ์ชั่วครู่
        // แล้วค่อยรีเฟรชให้การ์ดออกจากรายการแบบไม่เด้งทันที
        settling &&
          'pointer-events-none border-l-muted-foreground/40 bg-muted/40 opacity-60 grayscale',
      )}
    >
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {driver ? (
              <DriverAvatar driver={driver} className="h-8 w-8" />
            ) : driverName ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {driverName.trim().charAt(0)}
              </span>
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground">
                <UserRound className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              {driverName ? (
                <>
                  <div className="truncate text-sm font-semibold">{driverName}</div>
                  <div className="text-[10px] text-muted-foreground">
                    คนขับ{driver?.phone ? ` · ${driver.phone}` : ''}
                  </div>
                </>
              ) : (
                <div className="text-sm font-medium text-muted-foreground">ยังไม่มอบหมายคนขับ</div>
              )}
            </div>
          </div>
          <Badge variant={status.variant} className="shrink-0 text-[10px]">
            {status.label}
          </Badge>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          <Route className="h-3.5 w-3.5" /> เที่ยววิ่ง
          <span className="font-mono">{route ? shortRouteCode(route.code) : 'Route'}</span>
          <CopyRouteCodeButton code={route?.code} />
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold">{routeTitle(sortedOrders)}</div>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                overdueMinutes > 0 ? 'bg-destructive' : 'bg-success',
              )}
              style={{
                width: `${routeJobs.length > 0 ? Math.round((completed / routeJobs.length) * 100) : 0}%`,
              }}
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
            {completed}/{routeJobs.length} งาน
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {first.deliveryPlan?.appointmentDate && (
            <span>
              นัด{' '}
              {formatPlanningDateTime(
                first.deliveryPlan.appointmentDate,
                first.deliveryPlan.appointmentTime,
              )}
            </span>
          )}
          {overdueMinutes > 0 && (
            <span className="font-medium text-destructive">
              {first.deliveryPlan?.appointmentDate ? '· ' : ''}เลยเวลานัดส่ง
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full justify-between px-2 text-xs"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span>ดูงานในเที่ยวนี้ ({routeJobs.length})</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 h-7 w-full text-xs"
          onClick={() => onViewLive(first)}
        >
          <Navigation className="h-3.5 w-3.5" />
          ดูตำแหน่งบนแผนที่
        </Button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t bg-muted/10 px-4 py-3" aria-label="งานในเที่ยวนี้">
          {routeJobs.map((job, jobIndex) => (
            <section key={job.id} className="rounded-md border bg-background/70 p-2.5">
              <div className="mb-1.5 text-[11px] font-semibold text-foreground">
                งานที่ {jobIndex + 1}
                <span className="ml-1 font-normal text-muted-foreground">
                  · {job.stops.length} จุด
                </span>
              </div>
              <ol>
                {job.stops.map((order) => {
                  const kind = order.metadataJson?.dispatch?.routeLeg ?? 'dropoff';
                  const done = ['pending_confirmation', 'delivered'].includes(order.status);
                  const pendingDeliveryReview =
                    order.status === 'pending_confirmation' && kind !== 'pickup';
                  const stopStatusLabel = pendingDeliveryReview
                    ? statusLabel.pending_confirmation
                    : kind === 'pickup' && order.status === 'pending_confirmation'
                      ? 'รับของแล้ว'
                      : order.status === 'delivered'
                        ? 'เสร็จแล้ว'
                        : statusLabel[order.status];
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
                        {order.deliveryRoute?.sequence ?? 1}
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
                      <Badge
                        variant={pendingDeliveryReview ? 'warning' : done ? 'success' : 'muted'}
                        className="h-5 shrink-0 text-[9px]"
                      >
                        {stopStatusLabel}
                      </Badge>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {settling ? (
        <div className="flex items-center justify-center gap-1.5 border-t p-3 text-[11px] font-medium text-muted-foreground">
          {settledLabel ?? 'ดำเนินการแล้ว'}
        </div>
      ) : (
        actions && <div className="border-t p-3">{actions}</div>
      )}
    </article>
  );
}
