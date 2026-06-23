import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { DriverAvatar } from '@/components/DriverAvatar';
import {
  Ban,
  Bike,
  Car,
  CheckCircle2,
  Clock,
  Coins,
  IdCard,
  MapPin,
  Package,
  Phone,
  Route,
  ShieldCheck,
  Sparkles,
  Truck as TruckIcon,
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
} from '@/data/mock';
import { cn } from '@/lib/utils';
import { describeProof } from '@/lib/deliveryExecution';
import { formatRouteDistance } from '@/lib/routeDistance';

export function VehicleIcon({ v }: { v: Driver['vehicle'] }) {
  if (v === 'motorcycle') return <Bike className="h-3.5 w-3.5" />;
  if (v === 'van') return <Car className="h-3.5 w-3.5" />;
  return <TruckIcon className="h-3.5 w-3.5" />;
}

export function DriverCard({
  driver,
  selected,
  onSelect,
  recommended,
}: {
  driver: Driver;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
}) {
  const pct = (driver.activeOrders / driver.capacity) * 100;
  const remainingCapacity = Math.max(0, driver.capacity - driver.activeOrders);

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
            {recommended && (
              <Badge variant="muted" className="h-4 gap-0.5 px-1 text-[9px]">
                <Sparkles className="h-2.5 w-2.5" />
                แนะนำ
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <VehicleIcon v={driver.vehicle} />
            <span>{driver.zone}</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                งาน {driver.activeOrders}/{driver.capacity}
              </span>
              <span>ว่างอีก {remainingCapacity}</span>
            </div>
            <Progress value={pct} className="h-1" />
          </div>
        </div>
        <Badge
          variant={
            driver.status === 'available'
              ? 'success'
              : driver.status === 'on_delivery'
                ? 'muted'
                : 'muted'
          }
          className="h-5 shrink-0 px-1.5 text-[10px]"
        >
          {driver.status === 'available'
            ? 'ว่าง'
            : driver.status === 'on_delivery'
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
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
  statusText?: string;
  /** ลำดับในคิวตาม priority (1 = ควรมอบหมายก่อน) */
  rank?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border bg-card p-4 text-left transition-all',
        selected ? 'border-primary ring-1 ring-primary shadow-xs' : 'hover:border-primary/40',
      )}
    >
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
            <span className="font-mono text-xs font-medium">{order.code}</span>
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
          </div>
          <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
        </div>
        <Badge variant="muted" className="shrink-0">
          <Package className="h-3 w-3" /> {order.items.length}
        </Badge>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
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
  );
}

export function OrderSummary({ order }: { order: Order }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-medium">{order.code}</span>
        <Badge variant="muted">{order.items.length} รายการ</Badge>
      </div>
      <div className="mt-1 text-sm">{order.customer.name}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{order.customer.address}</div>
      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
        <span className="text-sm font-semibold tabular-nums text-warning">
          {formatTHB(order.totalValue)}
        </span>
      </div>
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

export function DriverSummary({ driver, order }: { driver: Driver | null; order?: Order | null }) {
  if (!driver) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
        {order ? 'ยังไม่ได้มอบหมายคนขับ' : 'เลือก order ก่อน'}
      </div>
    );
  }

  const pct = (driver.activeOrders / driver.capacity) * 100;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{driver.name}</span>
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
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <VehicleIcon v={driver.vehicle} />
            <span>{driver.zone}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span>{driver.phone}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-[11px] text-muted-foreground">คะแนน</div>
          <div className="mt-1 font-medium">⭐ {driver.rating}</div>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <div className="text-[11px] text-muted-foreground">งานปัจจุบัน</div>
          <div className="mt-1 font-medium">
            {driver.activeOrders}/{driver.capacity}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Capacity</span>
          <span>
            {driver.activeOrders}/{driver.capacity}
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Route className="h-3 w-3" />
          {order?.status === 'in_transit' ? 'กำลังวิ่งงานนี้อยู่' : 'ติดตามงานตามสถานะปัจจุบัน'}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          รองรับงานในโซน {driver.zone}
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3" />
          {driver.highValueCertified ? 'ผ่านอบรมขนส่งของมีค่า' : 'ไม่มีใบรับรอง high-value'}
        </div>
      </div>
    </div>
  );
}

export function ProofOfDeliveryInfo({ order, driverName }: { order: Order; driverName?: string }) {
  const pod = order.proofOfDelivery;
  if (!pod) return null;

  const items = describeProof(pod);
  const capturedBy = driverName || pod.capturedByDriverId || 'คนขับ';

  return (
    <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs">
      <div className="flex items-center justify-between font-medium text-success">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          หลักฐานปิดงานจาก rider
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
            <a
              key={i}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="aspect-4/3 overflow-hidden rounded-md border border-success/30"
            >
              <img src={src} alt={`รูปหลักฐาน ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {pod.signatureDataUrl && (
        <div className="mt-2">
          <div className="text-[10px] text-success/80">ลายเซ็นผู้รับ</div>
          <img
            src={pod.signatureDataUrl}
            alt="ลายเซ็นผู้รับ"
            className="mt-1 h-16 w-full rounded-md border border-success/30 bg-white object-contain"
          />
        </div>
      )}

      <div className="mt-2 text-[10px] text-success/80">บันทึกโดย {capturedBy}</div>
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

export function QueueAiAssessment() {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Sparkles className="h-3 w-3" />
        AI ประเมิน
      </div>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-success" />
          ประกันขนส่งครอบคลุม
        </li>
        <li className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> ส่งถึงภายใน ~35 นาที
        </li>
        <li className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3" /> อยู่ในโซนเดียวกับ order อื่น
        </li>
        <li className="flex items-center gap-1.5">
          <Package className="h-3 w-3" /> ยังเหลือ capacity 5/6
        </li>
      </ul>
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
