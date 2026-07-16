import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  FileImage,
  IdCard,
  Package,
  Pencil,
  Phone,
  Route,
  ShieldCheck,
  UserX,
  XCircle,
} from 'lucide-react';
import { type Driver, type Order, formatTHB, statusLabel } from '@/data/orderTypes';
import {
  type DeliveryTrip,
  groupOrdersIntoDeliveryTrips,
  groupRouteOrdersIntoJobs,
} from '@/lib/deliveryJobs';
import { formatPlanningDateTime, getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';
import { cn } from '@/lib/utils';
import type { DriverStats, DriverStatsPeriodDays } from '@/lib/retailApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DriverAvatar } from '@/components/DriverAvatar';
import { VehicleIcon } from './VehicleIcon';
import { ImagePreviewModal } from './ImagePreviewModal';
import { DriverAuditPanel } from './DriverAuditPanel';
import {
  type DriverTab,
  approvalStatus,
  formatIdCardNumber,
  vehicleLabel,
} from '../utils/driverInfo';

type DriverDetailPanelProps = {
  driver: Driver;
  tab: DriverTab;
  driverOrders: Order[];
  stats: DriverStats | null;
  statsLoading: boolean;
  statsDays: DriverStatsPeriodDays;
  onSetStatus: (driverId: string, status: Driver['status']) => void;
  onCompleteDelivery: (orderId: string, success: boolean) => void;
  onFailDelivery: (orderId: string) => void;
  onEdit: (driver: Driver) => void;
  onArchive: (driver: Driver) => void;
  onApprove: (driver: Driver) => void;
  onReject: (driver: Driver) => void;
  onResetPin: (driver: Driver) => void;
  onRefreshStats: (driver: Driver) => void;
  onStatsDaysChange: (days: DriverStatsPeriodDays) => void;
  onOpenTrackingHistory?: () => void;
};

export function DriverStatusBadge({ driver }: { driver: Driver }) {
  return (
    <Badge
      variant={driver.status === 'available' ? 'success' : 'muted'}
      className="h-5 px-1.5 text-[10px]"
    >
      {driver.status === 'available'
        ? 'ว่าง'
        : driver.status === 'on_delivery'
          ? 'กำลังส่ง'
          : 'หยุด'}
    </Badge>
  );
}

export function DriverDetailPanel({
  driver: d,
  tab,
  driverOrders,
  stats,
  statsLoading,
  statsDays,
  onSetStatus,
  onCompleteDelivery,
  onFailDelivery,
  onEdit,
  onArchive,
  onApprove,
  onReject,
  onResetPin,
  onRefreshStats,
  onStatsDaysChange,
  onOpenTrackingHistory,
}: DriverDetailPanelProps) {
  const canToggleOffDuty = driverOrders.length === 0;
  const approval = approvalStatus(d);
  const deliveryTrips = groupOrdersIntoDeliveryTrips(driverOrders);
  const totalValue = driverOrders.reduce((total, order) => total + order.totalValue, 0);

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <DriverAvatar driver={d} className="h-14 w-14" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold">{d.name}</span>
                <DriverStatusBadge driver={d} />
                {approval !== 'approved' && (
                  <Badge
                    variant={approval === 'pending' ? 'warning' : 'destructive'}
                    className="h-5 px-1.5 text-[10px]"
                  >
                    {approval === 'pending' ? 'รออนุมัติ' : 'ไม่อนุมัติ'}
                  </Badge>
                )}
                {d.highValueCertified && (
                  <Badge variant="success" className="h-5 gap-1 px-1.5 text-[10px]">
                    <ShieldCheck className="h-3 w-3" />
                    HV
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {d.phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <VehicleIcon v={d.vehicle} />
                  {vehicleLabel[d.vehicle]}
                  {d.vehicleColor ? ` · ${d.vehicleColor}` : ''}
                </span>
                {d.licensePlate && (
                  <span className="inline-flex items-center gap-1">
                    <IdCard className="h-3 w-3" />
                    {d.licensePlate}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {tab === 'pending' ? (
              <>
                <Button size="sm" onClick={() => onApprove(d)}>
                  <Check className="h-4 w-4" />
                  อนุมัติ
                </Button>
                <Button size="sm" variant="outline" onClick={() => onReject(d)}>
                  <UserX className="h-4 w-4" />
                  ไม่อนุมัติ
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onEdit(d)}>
                <Pencil className="h-4 w-4" />
                แก้ไข
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => onArchive(d)}
            >
              ปิดใช้งาน
            </Button>
          </div>
        </div>

        {tab === 'approved' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2">
              <Button
                variant={d.status === 'available' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => onSetStatus(d.id, 'available')}
                disabled={d.status === 'available' || driverOrders.length > 0}
              >
                เปิดรับงาน
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSetStatus(d.id, 'off_duty')}
                disabled={!canToggleOffDuty || d.status === 'off_duty'}
              >
                หยุดงาน
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => onResetPin(d)}>
              สร้าง / รีเซ็ต Messenger PIN
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'เที่ยวที่รับอยู่', value: deliveryTrips.length },
            { label: 'จุดงาน', value: driverOrders.length },
            { label: 'มูลค่างานในมือ', value: formatTHB(totalValue) },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-muted/40 px-3 py-2">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>

        {tab !== 'approved' && (
          <section className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <h3 className="text-sm font-semibold">เอกสารสมัคร</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <ReviewImage label="โปรไฟล์" src={d.profilePhotoDataUrl} />
              <ReviewImage label="บัตรประชาชน" src={d.idCardPhotoDataUrl} />
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground">
              <div>
                เลขบัตร:{' '}
                <span className="font-mono text-foreground">
                  {d.idCardNumber ? formatIdCardNumber(d.idCardNumber) : '—'}
                </span>
              </div>
              {d.rejectedReason && (
                <div className="text-destructive">เหตุผล: {d.rejectedReason}</div>
              )}
            </div>
          </section>
        )}

        {driverOrders.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">เที่ยวที่รับอยู่ ({deliveryTrips.length})</h3>
            <div className="grid gap-2 xl:grid-cols-2">
              {deliveryTrips.map((trip) => (
                <DeliveryTripCard
                  key={trip.id}
                  trip={trip}
                  onCompleteDelivery={onCompleteDelivery}
                  onFailDelivery={onFailDelivery}
                />
              ))}
            </div>
          </section>
        )}

        {tab !== 'pending' && (
          <DriverAuditPanel
            stats={stats}
            loading={statsLoading}
            days={statsDays}
            onDaysChange={onStatsDaysChange}
            onRefresh={() => onRefreshStats(d)}
            onOpenTrackingHistory={onOpenTrackingHistory}
          />
        )}
      </CardContent>
    </Card>
  );
}

function stopName(order: Order) {
  return order.customer.name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim();
}

/**
 * การ์ดหนึ่งเที่ยว — ใช้ภาษาเดียวกับ TrackingRouteCard (หน้าติดตาม): เส้นขอบซ้ายบอกสถานะ,
 * หัวการ์ดเป็นรหัสเที่ยว + ความคืบหน้าจุด, รายละเอียดพับเก็บได้ แต่คงปุ่มปิดงาน (สำเร็จ/ไม่สำเร็จ)
 * ของฝั่งแอดมินไว้
 */
function DeliveryTripCard({
  trip,
  onCompleteDelivery,
  onFailDelivery,
}: {
  trip: DeliveryTrip;
  onCompleteDelivery: (orderId: string, success: boolean) => void;
  onFailDelivery: (orderId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nowMs = Date.now();
  const orders = [...trip.orders].sort(
    (a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0),
  );
  const first = orders[0];
  const route = first?.deliveryRoute;
  const jobs = route
    ? groupRouteOrdersIntoJobs(orders)
    : orders.map((order) => ({ id: order.id, stops: [order] }));
  const tripValue = orders.reduce((total, order) => total + order.totalValue, 0);
  const pickupCount = orders.filter(
    (order) => order.metadataJson?.dispatch?.routeLeg === 'pickup',
  ).length;
  const completed = orders.filter((order) =>
    ['pending_confirmation', 'delivered'].includes(order.status),
  ).length;
  const overdueMinutes = Math.max(
    0,
    ...orders.map((order) => getAssignedOrderOverdueMinutes(order, nowMs) ?? 0),
  );

  return (
    <article
      className={cn(
        'overflow-hidden rounded-lg border border-l-[3px] bg-card',
        overdueMinutes > 0
          ? 'border-l-destructive border-destructive/40 bg-destructive/5'
          : 'border-l-info',
      )}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
              <Route className="h-3.5 w-3.5" />
              {route ? 'เที่ยววิ่ง' : 'งานเดี่ยว'}
              <span className="truncate font-mono">{route?.code ?? first?.orderNo}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>
                {jobs.length} งาน · {pickupCount > 0 ? `รับ ${pickupCount} · ` : ''}ส่ง{' '}
                {orders.length - pickupCount}
              </span>
              {first?.deliveryPlan && (
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
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge
              variant={overdueMinutes > 0 ? 'destructive' : 'info'}
              className="h-5 px-1.5 text-[10px]"
            >
              {completed}/{orders.length} จุด
            </Badge>
            <span className="text-[11px] font-medium text-warning">{formatTHB(tripValue)}</span>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-2 h-7 w-full justify-between px-2 text-xs"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span>ดูงานในเที่ยวนี้ ({jobs.length})</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t bg-muted/10 px-3 py-2.5" aria-label="งานในเที่ยวนี้">
          {jobs.map((job, jobIndex) => (
            <section key={job.id} className="rounded-md border bg-background/70 p-2.5">
              <div className="mb-1.5 text-[10px] font-semibold text-muted-foreground">
                {route ? `งานที่ ${jobIndex + 1}` : 'รายละเอียดงาน'}
                <span className="ml-1 font-normal">· {job.stops.length} จุด</span>
              </div>
              <ol className="space-y-2">
                {job.stops.map((order) => {
                  const isPickup = order.metadataJson?.dispatch?.routeLeg === 'pickup';
                  const done = order.status === 'delivered';
                  const actionable =
                    order.status !== 'assigned' &&
                    order.status !== 'delivered' &&
                    order.status !== 'failed';
                  return (
                    <li key={order.id} className="flex gap-2.5">
                      <span
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                          done
                            ? 'bg-success/15 text-success'
                            : isPickup
                              ? 'bg-info text-white'
                              : 'bg-success text-white',
                        )}
                      >
                        {order.deliveryRoute?.sequence ?? 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-1 text-[12px] font-semibold">
                              <span className={isPickup ? 'text-info' : 'text-success'}>
                                {isPickup ? 'รับ' : 'ส่ง'}
                              </span>
                              <span className="text-muted-foreground">·</span>
                              <span className="truncate">{stopName(order)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span className="font-mono">{order.orderNo}</span>
                              <span className="inline-flex items-center gap-1">
                                <Package className="h-3 w-3" />
                                {order.items.length} รายการ
                              </span>
                              <span>{formatTHB(order.totalValue)}</span>
                            </div>
                          </div>
                          <Badge
                            variant={done ? 'success' : 'muted'}
                            className="h-5 shrink-0 px-1.5 text-[9px]"
                          >
                            {done ? 'เสร็จแล้ว' : statusLabel[order.status]}
                          </Badge>
                        </div>
                        {actionable && (
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              className="h-7 flex-1 text-[11px]"
                              onClick={() => onCompleteDelivery(order.id, true)}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              สำเร็จ
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 flex-1 text-[11px]"
                              onClick={() => onFailDelivery(order.id)}
                            >
                              <XCircle className="h-3 w-3" />
                              ไม่สำเร็จ
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

function ReviewImage({ label, src }: { label: string; src?: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {src ? (
          <button
            type="button"
            className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPreviewOpen(true)}
            aria-label={`ดู${label}ขนาดใหญ่`}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-background transition group-hover:bg-foreground/45 group-focus-visible:bg-foreground/45">
              <Eye className="h-5 w-5 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
          </button>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-background">
            <FileImage className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      {src && previewOpen && (
        <ImagePreviewModal title={label} src={src} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
