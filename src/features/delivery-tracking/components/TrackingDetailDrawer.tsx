import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { DetailDrawer } from '@/components/DetailDrawer';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import { CopyRouteCodeButton } from '@/components/CopyRouteCodeButton';
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
  getDispatchStopDisplayName,
  getInTransitElapsedMinutes,
  getInTransitElapsedTone,
} from '@/lib/deliveryExecution';
import { getProofReviewAgeMinutes } from '@/lib/deliveryProofReview';
import { getFastDispatchSla } from '@/lib/fastDispatch';
import { formatPlanningDateTime } from '@/lib/deliveryPlanning';
import { groupRouteOrdersIntoJobs } from '@/lib/deliveryJobs';
import { shortRouteCode } from '@/lib/routeCode';
import { cn } from '@/lib/utils';
import { ChevronDown, Clock3, Link2, Loader2, MapPin, Route, UserRound } from 'lucide-react';

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
  const proofTarget = proofOrder ?? order;
  const reviewAgeMinutes = proofTarget ? getProofReviewAgeMinutes(proofTarget, nowMs) : null;
  const reviewSla = proofTarget ? getFastDispatchSla(proofTarget) : null;
  return (
    <DetailDrawer
      open={!!order}
      title={
        <span className="inline-flex items-center gap-1 font-mono">
          {isRoute ? (route ? shortRouteCode(route.code) : 'Route') : order?.orderNo}
          {isRoute ? (
            <CopyRouteCodeButton code={route?.code} />
          ) : (
            <CopyOrderNoButton orderNo={order?.orderNo} />
          )}
        </span>
      }
      subtitle={
        order
          ? isRoute
            ? `${routeJobs.length} งาน · ${routeStops.length} จุด · กำลังดู ${order.orderNo}`
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
            {reviewAgeMinutes != null && (
              <Badge variant="warning" className="gap-1">
                <Clock3 className="h-3 w-3" /> รอตรวจมา {formatElapsedDuration(reviewAgeMinutes)}
              </Badge>
            )}
            {reviewSla?.urgent && reviewSla.frozenAtProof && (
              <Badge variant={reviewSla.state === 'overdue' ? 'destructive' : 'success'}>
                {reviewSla.detail}
              </Badge>
            )}
            {order.coDriverIds && order.coDriverIds.length > 0 ? (
              <DriverTeamBadges order={order} drivers={drivers} />
            ) : null}
            {isDetailLoading && (
              <Badge variant="muted" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                กำลังโหลด
              </Badge>
            )}
          </div>

          {!isDetailLoading && proofTarget?.proofOfDelivery && (
            <ProofOfDeliveryInfo order={proofTarget} driverName={driver?.name} />
          )}

          {isRoute && route && (
            <section className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Route className="h-3.5 w-3.5" /> เส้นทางและจุดส่ง
                  </div>
                  {order.deliveryPlan?.appointmentDate && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      นัด{' '}
                      {formatPlanningDateTime(
                        order.deliveryPlan.appointmentDate,
                        order.deliveryPlan.appointmentTime,
                      )}
                    </div>
                  )}
                </div>
                <Badge variant="muted">{routeStops.length} จุด</Badge>
              </div>

              <div className="mt-3 space-y-2 border-t pt-3" aria-label="งานในเที่ยวนี้">
                {routeJobs.map((job, jobIndex) => (
                  <section key={job.id} className="rounded-md border bg-background/70 p-2">
                    {routeJobs.length > 1 && (
                      <div className="mb-1 text-[11px] font-semibold">
                        งานที่ {jobIndex + 1}
                        <span className="ml-1 font-normal text-muted-foreground">
                          · {job.stops.length} จุด
                        </span>
                      </div>
                    )}
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
                                  <span className="truncate">
                                    {getDispatchStopDisplayName(stop.customer.name)}
                                  </span>
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
              <OrderSummary order={order} slaOrder={proofTarget ?? order} showSla={false} />
            </div>
          </div>

          {(order.status === 'returning' ||
            order.status === 'failed' ||
            order.status === 'cancelled' ||
            order.status === 'returned') &&
            order.resolution && <ResolutionInfo order={order} />}

          <details className="group rounded-lg border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
              <span className="flex min-w-0 items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">QR และลิงก์ติดตามลูกค้า</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-3">
              <CustomerTrackingQrCard order={order} compact />
            </div>
          </details>

          <details className="group rounded-lg border bg-muted/10">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium">
              <span className="flex min-w-0 items-center gap-2">
                <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {driver ? `ผู้จัดส่ง · ${driver.name}` : 'ผู้จัดส่ง'}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-3">
              <DriverSummary driver={driver} order={order} compact />
            </div>
          </details>

          <OrderTimeline order={order} title="ประวัติกิจกรรม" compact defaultExpanded={false} />
        </>
      )}
    </DetailDrawer>
  );
}
