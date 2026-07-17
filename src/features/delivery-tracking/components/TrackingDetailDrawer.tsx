import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { DetailDrawer } from '@/components/DetailDrawer';
import { CustomerTrackingQrCard } from '@/components/CustomerTrackingQrCard';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  DriverSummary,
  DriverTeamBadges,
  OrderSummary,
  ProofOfDeliveryInfo,
  ResolutionInfo,
} from '@/components/delivery/DeliveryExecutionShared';
import { type Driver, type Order, statusLabel } from '@/data/orderTypes';
import {
  formatElapsedDuration,
  getInTransitElapsedMinutes,
  getInTransitElapsedTone,
} from '@/lib/deliveryExecution';
import { formatPlanningDateTime } from '@/lib/deliveryPlanning';
import { groupRouteOrdersIntoJobs } from '@/lib/deliveryJobs';
import { cn } from '@/lib/utils';
import { Clock3, Loader2, MapPin, Route } from 'lucide-react';

type TrackingDetailDrawerProps = {
  order: Order | null;
  /** หลักฐานระดับงานของ Route — ปกติคือ dropoff ที่รอตรวจ แม้กำลังดู pickup อยู่ */
  proofOrder?: Order | null;
  driver: Driver | null;
  /** ใช้ resolve ชื่อคนขับร่วมบนป้ายทีมจัดส่ง */
  drivers: Driver[];
  /** ทุกจุดของเที่ยวเดียวกัน เพื่อให้สลับดูแต่ละ order ภายใน drawer เดิม */
  routeOrders: Order[];
  isDetailLoading: boolean;
  onClose: () => void;
  onSelectStop: (order: Order) => void;
  actions?: ReactNode;
  /** เวลาปัจจุบันจากหน้าแม่ (tick ทุกนาที) — ใช้คำนวณ "ส่งมาแล้ว X นาที" */
  nowMs?: number;
};

/** รายละเอียดเชิงลึก — drawer ขวา (เดสก์ท็อป) / เต็มจอ (มือถือ) เปิดเมื่อเลือก order */
export function TrackingDetailDrawer({
  order,
  proofOrder,
  driver,
  drivers,
  routeOrders,
  isDetailLoading,
  onClose,
  onSelectStop,
  actions,
  nowMs,
}: TrackingDetailDrawerProps) {
  const inTransitMinutes = order ? getInTransitElapsedMinutes(order, nowMs) : null;
  const isRoute = Boolean(order?.deliveryRoute?.id);
  const routeStops = [...routeOrders].sort(
    (a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0),
  );
  const routeJobs = groupRouteOrdersIntoJobs(routeStops);
  const route = order?.deliveryRoute;
  return (
    <DetailDrawer
      open={!!order}
      title={
        <span className="font-mono">{isRoute ? (route?.code ?? 'Route') : order?.orderNo}</span>
      }
      subtitle={
        order
          ? isRoute
            ? `เที่ยววิ่ง ${routeJobs.length} งาน · กำลังดู ${order.orderNo}`
            : statusLabel[order.status]
          : undefined
      }
      onClose={onClose}
      footer={order ? actions : undefined}
      widthClassName="lg:w-[600px] xl:w-[720px]"
      desktopMapFriendly
    >
      {order && (
        <>
          {isRoute && route && (
            <section className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Route className="h-3.5 w-3.5" /> การจัดส่งนี้
                  </div>
                  <div className="mt-1 text-sm font-semibold">{route.code}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {routeJobs.length} งาน · {routeStops.length} จุด
                    {order.deliveryPlan && (
                      <>
                        {' · นัด '}
                        {formatPlanningDateTime(
                          order.deliveryPlan.plannedDate,
                          order.deliveryPlan.plannedTime,
                        )}
                      </>
                    )}
                  </div>
                </div>
                {driver && <Badge variant="muted">{driver.name}</Badge>}
              </div>

              <div className="mt-3 space-y-2 border-t pt-3" aria-label="งานในเที่ยวนี้">
                {routeJobs.map((job, jobIndex) => (
                  <section key={job.id} className="rounded-md border bg-background/70 p-2">
                    <div className="mb-1 text-[11px] font-semibold">
                      งานที่ {jobIndex + 1}
                      <span className="ml-1 font-normal text-muted-foreground">
                        · {job.stops.length} จุด
                      </span>
                    </div>
                    <ol>
                      {job.stops.map((stop) => {
                        const kind = stop.metadataJson?.dispatch?.routeLeg ?? 'dropoff';
                        const selected = stop.id === order.id;
                        const pendingDeliveryReview =
                          stop.status === 'pending_confirmation' && kind !== 'pickup';
                        const stopStatusLabel =
                          kind === 'pickup' && stop.status === 'pending_confirmation'
                            ? 'รับของแล้ว'
                            : statusLabel[stop.status];
                        return (
                          <li key={stop.id}>
                            <button
                              type="button"
                              onClick={() => onSelectStop(stop)}
                              className={cn(
                                'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted',
                                selected && 'bg-primary/10 ring-1 ring-primary/30',
                              )}
                              aria-current={selected ? 'step' : undefined}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                                  selected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted-foreground/15',
                                )}
                              >
                                {stop.deliveryRoute?.sequence ?? 1}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline gap-1 text-xs font-medium">
                                  <span
                                    className={kind === 'pickup' ? 'text-info' : 'text-success'}
                                  >
                                    {kind === 'pickup' ? 'รับ' : 'ส่ง'}
                                  </span>
                                  <span className="truncate">{stop.customer.name}</span>
                                </span>
                                <span className="mt-0.5 flex items-start gap-1 text-[10px] text-muted-foreground">
                                  <MapPin className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                                  <span className="line-clamp-1">{stop.customer.address}</span>
                                </span>
                              </span>
                              <Badge
                                variant={
                                  pendingDeliveryReview
                                    ? 'warning'
                                    : stop.status === 'delivered' ||
                                        stop.status === 'pending_confirmation'
                                      ? 'success'
                                      : 'muted'
                                }
                                className="h-5 shrink-0 px-1.5 text-[9px]"
                              >
                                {stopStatusLabel}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            </section>
          )}

          <div>
            <div className="text-[11px] font-medium text-muted-foreground">
              {isRoute ? 'รายละเอียดจุดที่เลือก' : 'Order'}
            </div>
            <div className="mt-1">
              <OrderSummary order={order} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            <Badge
              variant={
                order.status === 'in_transit'
                  ? 'info'
                  : order.status === 'pending_confirmation' || order.status === 'returning'
                    ? 'warning'
                    : 'muted'
              }
            >
              {statusLabel[order.status]}
            </Badge>
            {inTransitMinutes != null && (
              <Badge
                variant={
                  getInTransitElapsedTone(inTransitMinutes) === 'critical'
                    ? 'destructive'
                    : getInTransitElapsedTone(inTransitMinutes) === 'slow'
                      ? 'warning'
                      : 'info'
                }
                className="gap-1"
              >
                <Clock3 className="h-3 w-3" />
                ส่งมาแล้ว {formatElapsedDuration(inTransitMinutes)}
              </Badge>
            )}
            {order.deliveryPlan?.releaseState === 'released' &&
              order.deliveryRoute?.dispatchMode !== 'urgent' && (
                <Badge variant="info">จาก Planning</Badge>
              )}
            {order.deliveryPlan?.releaseState === 'planned' &&
              order.deliveryPlan.plannedDriverId && <Badge variant="info">แผนล่วงหน้า</Badge>}
            {order.deliveryRoute?.dispatchMode === 'urgent' && (
              <Badge variant="info">ส่งทันที</Badge>
            )}
            {order.coDriverIds && order.coDriverIds.length > 0 ? (
              <DriverTeamBadges order={order} drivers={drivers} />
            ) : (
              driver && <Badge variant="muted">คนขับ: {driver.name}</Badge>
            )}
            {isDetailLoading && (
              <Badge variant="muted" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                กำลังโหลด
              </Badge>
            )}
          </div>

          <CustomerTrackingQrCard order={order} />

          {!isDetailLoading && (proofOrder ?? order).proofOfDelivery && (
            <ProofOfDeliveryInfo order={proofOrder ?? order} driverName={driver?.name} />
          )}

          {(order.status === 'returning' ||
            order.status === 'failed' ||
            order.status === 'cancelled' ||
            order.status === 'returned') &&
            order.resolution && <ResolutionInfo order={order} />}

          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">ข้อมูลคนขับ</div>
            <DriverSummary driver={driver} order={order} />
          </div>

          <OrderTimeline order={order} description="กิจกรรมที่เกิดขึ้นกับออเดอร์นี้" compact />
        </>
      )}
    </DetailDrawer>
  );
}
