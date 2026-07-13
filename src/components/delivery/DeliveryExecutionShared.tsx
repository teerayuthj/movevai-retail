import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import { DriverAvatar } from '@/components/DriverAvatar';
import { LineOrderSource } from '@/components/LineOrderSource';
import {
  Ban,
  Bike,
  Car,
  CheckCircle2,
  Clock,
  Coins,
  IdCard,
  MapPin,
  Navigation2,
  Package,
  Phone,
  Route,
  ShieldCheck,
  Truck as TruckIcon,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  type CancelReason,
  type Driver,
  type FailNextAction,
  type FailReason,
  type Order,
  cancelReasonLabel,
  failNextActionLabel,
  failReasonLabel,
  formatTHB,
  paymentLabel,
} from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import {
  deriveDriverDisplayStatus,
  describeProof,
  getDriverWorkloadSummary,
  getOrderDriverTeam,
  type DriverWorkloadSummary,
} from '@/lib/deliveryExecution';
import { formatFastDispatchDueAt, getFastDispatchSla } from '@/lib/fastDispatch';
import { formatRouteDistance } from '@/lib/routeDistance';

export function VehicleIcon({ v }: { v: Driver['vehicle'] }) {
  if (v === 'motorcycle') return <Bike className="h-3.5 w-3.5" />;
  if (v === 'van') return <Car className="h-3.5 w-3.5" />;
  return <TruckIcon className="h-3.5 w-3.5" />;
}

function vehicleLabel(vehicle: Driver['vehicle']) {
  if (vehicle === 'motorcycle') return 'จักรยานยนต์';
  if (vehicle === 'van') return 'รถตู้';
  return 'รถกระบะ';
}

/** ป้ายทีมจัดส่งรายคนพร้อม role หลัก/ร่วม — ใช้แทน "+N ร่วมส่ง" เมื่อเป็นงาน co-delivery */
export function DriverTeamBadges({
  order,
  drivers,
}: {
  order: Pick<Order, 'assignedDriverId' | 'assignedDriverName' | 'coDriverIds'>;
  drivers: Pick<Driver, 'id' | 'name'>[];
}) {
  const team = getOrderDriverTeam(order, drivers);
  if (team.length === 0) return null;
  return (
    <>
      {team.map((member) => (
        <Badge
          key={member.code}
          variant={member.role === 'main' ? 'info' : 'muted'}
          className="gap-1"
        >
          {member.role === 'main' ? (
            <Navigation2 className="h-3 w-3" />
          ) : (
            <Users className="h-3 w-3" />
          )}
          {member.name} · {member.role === 'main' ? 'คนขับหลัก' : 'คนขับร่วม'}
        </Badge>
      ))}
    </>
  );
}

export function DriverWorkloadChips({
  workload,
  plannedLabel = 'แผนวันนี้',
  emptyLabel = 'ไม่มีงานค้าง',
  className,
}: {
  workload: DriverWorkloadSummary;
  plannedLabel?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const hasWorkload =
    workload.waitingToStart > 0 ||
    workload.inTransit > 0 ||
    workload.pendingReview > 0 ||
    workload.returning > 0 ||
    workload.plannedForDate > 0;

  if (!hasWorkload) {
    return <div className={cn('text-[11px] text-muted-foreground', className)}>{emptyLabel}</div>;
  }

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {workload.waitingToStart > 0 && (
        <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
          รอเริ่ม {workload.waitingToStart}
        </Badge>
      )}
      {workload.inTransit > 0 && (
        <Badge variant="info" className="h-5 px-1.5 text-[10px]">
          กำลังส่ง {workload.inTransit}
        </Badge>
      )}
      {workload.pendingReview > 0 && (
        <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
          รอตรวจ {workload.pendingReview}
        </Badge>
      )}
      {workload.returning > 0 && (
        <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
          ส่งกลับ {workload.returning}
        </Badge>
      )}
      {workload.plannedForDate > 0 && (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
          {plannedLabel} {workload.plannedForDate}
        </Badge>
      )}
    </div>
  );
}

export function DriverCard({
  driver,
  selected,
  onSelect,
  orders,
  workloadDate,
  coRole,
}: {
  driver: Driver;
  selected: boolean;
  onSelect: () => void;
  /** ถ้าส่งมา จะ derive สถานะ "ว่าง/กำลังส่ง" จากงานจริงให้ตรงกับ messenger */
  orders?: Order[];
  workloadDate?: string;
  /** co-delivery: บทบาทเมื่อเลือกหลายคน — 'primary' = คนขับหลัก, 'secondary' = คนขับร่วม */
  coRole?: 'primary' | 'secondary';
}) {
  const displayStatus = orders ? deriveDriverDisplayStatus(driver, orders) : driver.status;
  const workload = orders
    ? getDriverWorkloadSummary(driver, orders, { plannedDate: workloadDate })
    : {
        waitingToStart: driver.activeOrders,
        inTransit: 0,
        pendingReview: 0,
        returning: 0,
        plannedForDate: 0,
      };

  return (
    <button
      onClick={onSelect}
      disabled={driver.status === 'off_duty'}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-all',
        selected && 'border-primary bg-primary/5 ring-1 ring-primary',
        !selected && driver.status !== 'off_duty' && 'hover:border-primary/40 hover:bg-muted/40',
        driver.status === 'off_duty' && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{driver.name}</span>
            {coRole && (
              <Badge
                variant={coRole === 'primary' ? 'info' : 'muted'}
                className="h-4 shrink-0 px-1.5 text-[9px]"
              >
                {coRole === 'primary' ? 'คนขับหลัก' : 'ร่วมส่ง'}
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <VehicleIcon v={driver.vehicle} />
            <span>{vehicleLabel(driver.vehicle)}</span>
          </div>
          <DriverWorkloadChips workload={workload} className="mt-2" />
        </div>
        <Badge
          variant={displayStatus === 'available' ? 'success' : 'muted'}
          className="h-5 shrink-0 px-1.5 text-[10px]"
        >
          {displayStatus === 'available'
            ? 'ว่าง'
            : displayStatus === 'on_delivery'
              ? 'กำลังส่ง'
              : 'หยุด'}
        </Badge>
      </div>
    </button>
  );
}

export function QueueOrderCard({
  order,
  selected,
  onClick,
  statusText = 'พร้อมส่ง',
  rank,
  actions,
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
  statusText?: string;
  /** ลำดับในคิวตาม priority (1 = ควรมอบหมายก่อน) */
  rank?: number;
  actions?: ReactNode;
}) {
  const fastSla = getFastDispatchSla(order);

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-xl border bg-card transition-all',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40',
      )}
    >
      <button onClick={onClick} aria-pressed={selected} className="w-full p-4 text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {rank != null && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                    rank <= 3
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                  title="ลำดับคิวตามความสำคัญ"
                >
                  #{rank}
                </span>
              )}
              <span className="font-mono text-xs font-medium">{order.orderNo}</span>
              <CopyOrderNoButton orderNo={order.orderNo} />
              <Badge
                variant={order.status === 'ready' ? 'success' : 'muted'}
                className="h-5 px-1.5 text-[10px]"
              >
                {statusText}
              </Badge>
              {order.totalValue >= 500000 && (
                <Badge
                  variant="warning"
                  className="h-5 gap-0.5 border-destructive/30 bg-destructive/10 px-1.5 text-[10px] text-destructive"
                >
                  <ShieldCheck className="h-2.5 w-2.5" />
                  High-value
                </Badge>
              )}
              {order.requiresIdCheck && (
                <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
                  <IdCard className="h-2.5 w-2.5" />
                  ตรวจบัตร
                </Badge>
              )}
              {order.deliveryPlan?.releaseState === 'released' && (
                <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                  จาก Planning
                </Badge>
              )}
              {fastSla.urgent && (
                <Badge
                  variant={fastSla.state === 'overdue' ? 'destructive' : 'warning'}
                  className="h-5 gap-0.5 px-1.5 text-[10px]"
                >
                  <Clock className="h-2.5 w-2.5" />
                  {fastSla.label}
                </Badge>
              )}
            </div>
            <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
            <LineOrderSource order={order} className="mt-1" />
          </div>
          <Badge variant={selected ? 'default' : 'muted'} className="shrink-0">
            {selected ? (
              'เลือกแล้ว'
            ) : (
              <>
                <Package className="h-3 w-3" /> {order.items.length}
              </>
            )}
          </Badge>
        </div>

        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {fastSla.urgent && (
            <div
              className={cn(
                'flex items-center gap-1.5 font-medium',
                fastSla.state === 'overdue'
                  ? 'text-destructive'
                  : fastSla.state === 'warning'
                    ? 'text-warning'
                    : 'text-info',
              )}
            >
              <Clock className="h-3 w-3" />
              <span>
                {fastSla.detail} · ต้องถึงก่อน {formatFastDispatchDueAt(fastSla.dueAt)}
              </span>
            </div>
          )}
          <div className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{order.customer.address}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3 w-3" />
            <span>{order.customer.phone}</span>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3 text-warning" />
            {paymentLabel[order.payment]}
          </div>
          <span className="text-sm font-semibold tabular-nums text-warning">
            {formatTHB(order.totalValue)}
          </span>
        </div>
      </button>
      {actions && (
        <div className="flex flex-wrap justify-end gap-2 border-t bg-muted/20 px-3 py-2">
          {actions}
        </div>
      )}
    </div>
  );
}

export function OrderSummary({ order }: { order: Order }) {
  const fastSla = getFastDispatchSla(order);

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-medium">{order.orderNo}</span>
          <CopyOrderNoButton orderNo={order.orderNo} />
        </div>
        <Badge variant="muted">{order.items.length} รายการ</Badge>
      </div>
      <div className="mt-1 text-sm">{order.customer.name}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{order.customer.address}</div>
      {order.items.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t pt-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Package className="h-3 w-3" />
            สินค้าที่จัดส่ง
          </div>
          <ul className="space-y-1.5">
            {order.items.map((item, i) => (
              <li
                key={`${item.sku ?? 'item'}-${i}`}
                className="flex items-start justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {[item.weight, item.purity].filter(Boolean).join(' · ')}
                    {item.note ? ` · ${item.note}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-muted-foreground">× {item.qty}</div>
                  <div className="font-medium text-foreground">
                    {formatTHB(item.unitPrice * item.qty)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
        <span className="text-sm font-semibold tabular-nums text-warning">
          {formatTHB(order.totalValue)}
        </span>
      </div>
      {fastSla.urgent && (
        <div
          className={cn(
            'mt-2 rounded-md border px-2.5 py-2 text-xs',
            fastSla.state === 'overdue'
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-warning/30 bg-warning/10 text-warning',
          )}
        >
          <div className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5" />
            {fastSla.label}
          </div>
          <div className="mt-0.5 text-[10px] opacity-80">
            {fastSla.detail} · เป้าหมาย {formatFastDispatchDueAt(fastSla.dueAt)}
          </div>
        </div>
      )}
      {order.deliveryRoute?.plannedDistanceMeters != null &&
        order.deliveryRoute.plannedDistanceMeters > 0 && (
          <div className="mt-2 rounded-md border bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Route className="h-3.5 w-3.5" />
              <span>ระยะตามถนนประมาณ</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatRouteDistance(order.deliveryRoute.plannedDistanceMeters)}
              </span>
            </div>
            <div className="mt-0.5 text-[10px]">ไม่รวมสภาพจราจร</div>
          </div>
        )}
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge variant="muted" className="gap-1 text-[10px]">
          <Coins className="h-2.5 w-2.5" />
          {paymentLabel[order.payment]}
        </Badge>
        {order.requiresIdCheck && (
          <Badge variant="warning" className="gap-1 text-[10px]">
            <IdCard className="h-2.5 w-2.5" />
            ตรวจบัตร
          </Badge>
        )}
        {order.insured && (
          <Badge variant="muted" className="gap-1 text-[10px]">
            <ShieldCheck className="h-2.5 w-2.5" />
            ประกันขนส่ง
          </Badge>
        )}
      </div>
    </div>
  );
}

export function DriverSummary({
  driver,
  order,
  orders,
  workloadDate,
}: {
  driver: Driver | null;
  order?: Order | null;
  /** ถ้าส่งมา จะ derive สถานะ "ว่าง/กำลังส่ง" จากงานจริงให้ตรงกับ messenger */
  orders?: Order[];
  workloadDate?: string;
}) {
  if (!driver) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
        {order ? 'ยังไม่ได้มอบหมายคนขับ' : 'เลือก order ก่อน'}
      </div>
    );
  }

  const displayStatus = orders ? deriveDriverDisplayStatus(driver, orders) : driver.status;
  const workload = orders
    ? getDriverWorkloadSummary(driver, orders, { plannedDate: workloadDate })
    : {
        waitingToStart: driver.activeOrders,
        inTransit: 0,
        pendingReview: 0,
        returning: 0,
        plannedForDate: 0,
      };

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{driver.name}</span>
            <Badge
              variant={displayStatus === 'available' ? 'success' : 'muted'}
              className="h-5 px-1.5 text-[10px]"
            >
              {displayStatus === 'available'
                ? 'ว่าง'
                : displayStatus === 'on_delivery'
                  ? 'กำลังส่ง'
                  : 'หยุด'}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <VehicleIcon v={driver.vehicle} />
            <span>{vehicleLabel(driver.vehicle)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>{driver.phone}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-[11px] text-muted-foreground">ภาระงาน messenger</div>
          <DriverWorkloadChips workload={workload} className="mt-2" />
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Route className="h-3 w-3" />
          {order?.status === 'in_transit' ? 'กำลังวิ่งงานนี้อยู่' : 'ติดตามงานตามสถานะปัจจุบัน'}
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" />
          {driver.highValueCertified ? 'ผ่านอบรมขนส่งของมีค่า' : 'ไม่มีใบรับรอง high-value'}
        </div>
      </div>
    </div>
  );
}

function ImageLightbox({
  src,
  alt,
  onWhite,
  onClose,
}: {
  src: string;
  alt: string;
  onWhite?: boolean;
  onClose: () => void;
}) {
  const MIN = 1;
  const MAX = 5;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };
  const zoomBy = (delta: number) =>
    setScale((s) => {
      const next = Math.min(MAX, Math.max(MIN, +(s + delta).toFixed(2)));
      if (next === MIN) setOffset({ x: 0, y: 0 });
      return next;
    });

  const onPointerDown = (e: ReactPointerEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onWheel={(e) => zoomBy(e.deltaY < 0 ? 0.25 : -0.25)}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/85 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="ปิด"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/15 p-1 text-white backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="ซูมออก"
          onClick={() => zoomBy(-0.5)}
          disabled={scale <= MIN}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-w-[3rem] rounded-full px-2 text-sm tabular-nums hover:bg-white/20"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          aria-label="ซูมเข้า"
          onClick={() => zoomBy(0.5)}
          disabled={scale >= MAX}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/20 disabled:opacity-40"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={() => (scale > 1 ? reset() : zoomBy(1))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        className={cn(
          'max-h-full max-w-full select-none rounded-lg object-contain shadow-2xl transition-transform',
          onWhite && 'bg-white p-4',
          scale > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in',
        )}
      />
    </div>
  );
}

export function ProofOfDeliveryInfo({ order, driverName }: { order: Order; driverName?: string }) {
  const pod = order.proofOfDelivery;
  const [preview, setPreview] = useState<{ src: string; alt: string; onWhite?: boolean } | null>(
    null,
  );
  if (!pod) return null;

  const items = describeProof(pod);
  const capturedBy = driverName || pod.capturedByDriverId || 'คนขับ';
  const proofHistory = order.proofHistory ?? [];

  return (
    <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs">
      <div className="flex items-center justify-between font-medium text-success">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          หลักฐานปิดงานจาก messenger
        </span>
        <span className="text-[10px] opacity-75">
          {new Date(pod.capturedAt).toLocaleString('th', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5 text-success">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {pod.photos && pod.photos.length > 0 && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {pod.photos.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPreview({ src, alt: `รูปหลักฐาน ${i + 1}` })}
              className="aspect-4/3 overflow-hidden rounded-md border border-success/30 transition hover:opacity-90"
            >
              <img src={src} alt={`รูปหลักฐาน ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {pod.signatureDataUrl && (
        <div className="mt-2">
          <div className="text-[10px] text-success/80">ลายเซ็นผู้รับ</div>
          <button
            type="button"
            onClick={() =>
              setPreview({ src: pod.signatureDataUrl!, alt: 'ลายเซ็นผู้รับ', onWhite: true })
            }
            className="mt-1 block w-full"
          >
            <img
              src={pod.signatureDataUrl}
              alt="ลายเซ็นผู้รับ"
              className="h-16 w-full rounded-md border border-success/30 bg-white object-contain transition hover:opacity-90"
            />
          </button>
        </div>
      )}

      {proofHistory.length > 0 && (
        <div className="mt-3 border-t border-success/20 pt-3">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-success">
            <Clock className="h-3 w-3" />
            ประวัติหลักฐานเดิม {proofHistory.length} รายการ
          </div>
          <div className="mt-2 space-y-2">
            {[...proofHistory].reverse().map((history, index) => (
              <div key={`${history.capturedAt}-${index}`} className="rounded-md bg-white/60 p-2">
                <div className="flex items-center justify-between gap-2 text-[10px] text-success/80">
                  <span>
                    แก้โดย {history.replacedByRole === 'admin' ? 'admin' : 'messenger'}
                    {history.replacedByName ? ` · ${history.replacedByName}` : ''}
                  </span>
                  <span>
                    {new Date(history.replacedAt).toLocaleString('th', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-success/70">
                  หลักฐานเดิมจาก{' '}
                  {new Date(history.capturedAt).toLocaleString('th', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {history.photos?.[0] && (
                    <button
                      type="button"
                      onClick={() => setPreview({ src: history.photos![0], alt: 'รูปหลักฐานเดิม' })}
                      className="aspect-4/3 overflow-hidden rounded border border-success/20"
                    >
                      <img
                        src={history.photos[0]}
                        alt="รูปหลักฐานเดิม"
                        className="h-full w-full object-cover"
                      />
                    </button>
                  )}
                  {history.signatureDataUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreview({
                          src: history.signatureDataUrl!,
                          alt: 'ลายเซ็นเดิม',
                          onWhite: true,
                        })
                      }
                      className="aspect-4/3 overflow-hidden rounded border border-success/20 bg-white"
                    >
                      <img
                        src={history.signatureDataUrl}
                        alt="ลายเซ็นเดิม"
                        className="h-full w-full object-contain"
                      />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2 text-[10px] text-success/80">บันทึกโดย {capturedBy}</div>

      {preview && (
        <ImageLightbox
          src={preview.src}
          alt={preview.alt}
          onWhite={preview.onWhite}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

export function ResolutionInfo({ order }: { order: Order }) {
  const r = order.resolution;
  if (!r) return null;

  const reasonText = r.reason
    ? (failReasonLabel[r.reason as FailReason] ?? cancelReasonLabel[r.reason as CancelReason])
    : undefined;
  const tone =
    r.type === 'cancelled'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : r.type === 'failed'
        ? 'border-warning/30 bg-warning/10 text-warning'
        : r.type === 'returning'
          ? 'border-info/30 bg-info/10 text-info'
          : 'border-success/30 bg-success/10 text-success';
  const title =
    r.type === 'cancelled'
      ? 'ยกเลิกแล้ว'
      : r.type === 'failed'
        ? 'ส่งไม่สำเร็จ'
        : r.type === 'returning'
          ? 'อยู่ระหว่างส่งกลับ'
          : 'รับคืนแล้ว';

  return (
    <div className={cn('rounded-lg border p-3 text-xs', tone)}>
      <div className="flex items-center justify-between font-medium">
        <span>{title}</span>
        <span className="text-[10px] opacity-75">
          {new Date(r.recordedAt).toLocaleString('th', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </span>
      </div>
      {reasonText && <div className="mt-1">เหตุผล: {reasonText}</div>}
      {r.nextAction && (
        <div className="mt-0.5">
          ขั้นตอนต่อไป: {failNextActionLabel[r.nextAction as FailNextAction]}
        </div>
      )}
      {r.note && <div className="mt-0.5">หมายเหตุ: {r.note}</div>}
      <div className="mt-1 text-[10px] opacity-75">
        บันทึกโดย {r.recordedBy.name} · {r.recordedBy.department}
      </div>
    </div>
  );
}

export function EmptyState({ title = 'ไม่มีรายการในสถานะนี้' }: { title?: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
      {title}
    </div>
  );
}

export function QueueCancelButton({
  onClick,
  label,
  fullWidth,
}: {
  onClick: () => void;
  label: string;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 hover:text-destructive',
        fullWidth && 'w-full',
      )}
    >
      <Ban className="h-4 w-4" />
      {label}
    </button>
  );
}
