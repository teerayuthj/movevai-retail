import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Navigation,
  Package,
  PenLine,
  Phone,
  Route,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  formatTHB,
  paymentLabel,
  shippingMethodLabel,
  statusLabel,
  type Order,
  type OrderStatus,
} from '@/data/orderTypes';
import {
  fetchCustomerOrder,
  fetchCustomerLiveTracking,
  type CustomerLiveTracking,
} from '@/lib/retailApi';
import { formatPlanningDateTime } from '@/lib/deliveryPlanning';
import {
  formatApproxDistance,
  getCustomerPublicStatusLabel,
  getCustomerTrackingOrderId,
  getPlannedDelivery,
  getPublicTimelineEvents,
  haversineMeters,
  isOrderScheduled,
  maskPhone,
  type CustomerProofEvidence,
} from '@/lib/customerTracking';
import { cn } from '@/lib/utils';

type CustomerTrackingPageProps = {
  pathname: string;
};

const DELIVERY_STEPS: {
  key: string;
  label: string;
  statuses: OrderStatus[];
  icon: typeof Package;
}[] = [
  {
    key: 'received',
    label: 'รับคำสั่งซื้อ',
    statuses: ['new', 'parsing', 'needs_review'],
    icon: Package,
  },
  { key: 'ready', label: 'เตรียมสินค้า', statuses: ['ready'], icon: ShieldCheck },
  { key: 'assigned', label: 'มอบหมายจัดส่ง', statuses: ['assigned'], icon: Route },
  { key: 'in_transit', label: 'กำลังจัดส่ง', statuses: ['in_transit'], icon: Truck },
  {
    key: 'delivered',
    label: 'ส่งมอบแล้ว',
    statuses: ['pending_confirmation', 'delivered'],
    icon: CheckCircle2,
  },
];

function getStepState(order: Order, index: number): 'done' | 'current' | 'upcoming' | 'problem' {
  if (order.status === 'pending_confirmation' || order.status === 'delivered') {
    return index < DELIVERY_STEPS.length ? 'done' : 'upcoming';
  }

  if (['failed', 'cancelled', 'returning', 'returned'].includes(order.status)) {
    return index < 4 ? 'done' : 'problem';
  }

  const currentIndex = DELIVERY_STEPS.findIndex((step) => step.statuses.includes(order.status));
  if (currentIndex < 0) return 'upcoming';
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'current';
  return 'upcoming';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getMapsUrl(order: Order) {
  if (order.customer.geo) {
    return `https://www.google.com/maps/search/?api=1&query=${order.customer.geo.lat},${order.customer.geo.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customer.address)}`;
}

function getStatusVariant(
  status: OrderStatus,
): 'success' | 'warning' | 'info' | 'muted' | 'destructive' {
  if (status === 'pending_confirmation' || status === 'delivered') return 'success';
  if (status === 'failed' || status === 'cancelled') return 'destructive';
  if (status === 'returning' || status === 'returned') return 'warning';
  if (status === 'in_transit' || status === 'assigned') return 'info';
  return 'muted';
}

function CustomerTrackingSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลดสถานะสินค้า
      </div>
    </div>
  );
}

function CustomerTrackingNotFound({ orderId }: { orderId: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 text-center shadow-sm">
        <AlertCircle className="mx-auto h-10 w-10 text-warning" />
        <h1 className="mt-3 text-lg font-semibold">ไม่พบข้อมูลติดตามสินค้า</h1>
        <p className="mt-1 text-sm text-muted-foreground">ตรวจสอบ QR หรือรหัสอ้างอิงอีกครั้ง</p>
        {orderId && <div className="mt-3 font-mono text-xs text-muted-foreground">{orderId}</div>}
      </div>
    </div>
  );
}

function CustomerProofTimelineCard({ proof }: { proof: CustomerProofEvidence }) {
  const [preview, setPreview] = useState<{ src: string; alt: string; onWhite?: boolean } | null>(
    null,
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 rounded-lg border border-success/30 bg-success/5">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-2 p-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-success">หลักฐานที่ส่งล่าสุด</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDateTime(proof.capturedAt)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="success" className="h-5 gap-1 px-1.5 text-[10px]">
              <ImageIcon className="h-3 w-3" />
              รูป {proof.photoCount}
            </Badge>
            {proof.signatureCaptured && (
              <Badge variant="success" className="h-5 gap-1 px-1.5 text-[10px]">
                <PenLine className="h-3 w-3" />
                ลายเซ็นแล้ว
              </Badge>
            )}
            {(proof.locationLabel || proof.locationMapsUrl) && (
              <Badge variant="success" className="h-5 gap-1 px-1.5 text-[10px]">
                <MapPin className="h-3 w-3" />
                GPS
              </Badge>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-success transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-success/20 p-3 pt-3 text-xs">
          <div>
            <div className="flex items-center gap-1.5 font-medium">
              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              รูปหลักฐานการส่งมอบ
            </div>
            {proof.photos.length > 0 ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {proof.photos.map((src, index) => (
                  <button
                    key={`${src}-${index}`}
                    type="button"
                    onClick={() => setPreview({ src, alt: `รูปหลักฐาน ${index + 1}` })}
                    className="aspect-4/3 overflow-hidden rounded-md border bg-background transition hover:opacity-90"
                  >
                    <img
                      src={src}
                      alt={`รูปหลักฐาน ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-muted-foreground">
                รูป {proof.photoCount} รูป
              </div>
            )}
          </div>

          {proof.signatureCaptured && (
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                <PenLine className="h-3.5 w-3.5 text-muted-foreground" />
                ลายเซ็นผู้รับ
              </div>
              {proof.signatureDataUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    setPreview({
                      src: proof.signatureDataUrl!,
                      alt: 'ลายเซ็นผู้รับ',
                      onWhite: true,
                    })
                  }
                  className="mt-2 block w-full rounded-md border bg-white p-2 transition hover:opacity-90"
                >
                  <img
                    src={proof.signatureDataUrl}
                    alt="ลายเซ็นผู้รับ"
                    className="h-14 w-full object-contain"
                  />
                </button>
              ) : (
                <div className="mt-1 text-[11px] text-muted-foreground">ลายเซ็นแล้ว</div>
              )}
            </div>
          )}

          {(proof.locationLabel || proof.locationMapsUrl) && (
            <div className="rounded-md border bg-background/70 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">พิกัด GPS ขณะปิดงาน</div>
                  {proof.locationLabel && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {proof.locationLabel}
                    </div>
                  )}
                  {proof.locationMapsUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 px-2 text-[11px]"
                      asChild
                    >
                      <a href={proof.locationMapsUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        เปิดแผนที่
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview.src}
            alt={preview.alt}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'max-h-full max-w-full rounded-lg object-contain shadow-2xl',
              preview.onWhite && 'bg-white p-4',
            )}
          />
        </div>
      )}
    </div>
  );
}

function CustomerTrackingNotScheduled({ order }: { order: Order }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-5 text-center shadow-sm">
        <CalendarClock className="mx-auto h-10 w-10 text-info" />
        <h1 className="mt-3 text-lg font-semibold">ออเดอร์ยังไม่ถูกจัดรอบส่ง</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          เราได้รับคำสั่งซื้อ <span className="font-mono">{order.orderNo}</span> แล้ว
          และกำลังจัดเตรียมรอบจัดส่ง ระบบติดตามจะเปิดให้ใช้งานเมื่อมีการวางแผนจัดส่งเรียบร้อย
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          สถานะปัจจุบัน: {statusLabel[order.status]}
        </div>
      </div>
    </div>
  );
}

export function CustomerTrackingPage({ pathname }: CustomerTrackingPageProps) {
  const orderId = useMemo(() => getCustomerTrackingOrderId(pathname), [pathname]);
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [liveTracking, setLiveTracking] = useState<CustomerLiveTracking | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setOrder(null);

    void fetchCustomerOrder(orderId)
      .then((nextOrder) => {
        if (cancelled) return;
        setOrder(nextOrder);
      })
      .catch(() => {
        if (cancelled) return;
        // ไม่มี mock fallback แล้ว — customer surface ใช้ข้อมูลจริงจาก backend อย่างเดียว
        setOrder(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // ระหว่างกำลังจัดส่ง: poll ตำแหน่งคนส่งเพื่ออัปเดต "กำลังมาส่ง" แบบ near real-time
  const isInTransit = order?.status === 'in_transit';
  const liveTrackingOrderId = order?.id ?? orderId;
  useEffect(() => {
    if (!isInTransit || !liveTrackingOrderId) {
      setLiveTracking(null);
      return;
    }

    let cancelled = false;
    const poll = () => {
      void fetchCustomerLiveTracking(liveTrackingOrderId)
        .then((next) => {
          if (!cancelled) setLiveTracking(next);
        })
        .catch(() => {
          if (!cancelled) setLiveTracking(null);
        });
    };

    poll();
    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isInTransit, liveTrackingOrderId]);

  if (isLoading) return <CustomerTrackingSkeleton />;
  if (!order) return <CustomerTrackingNotFound orderId={orderId} />;
  // ผูกกับ Planning: เปิดหน้า tracking ให้เฉพาะออเดอร์ที่ถูกจัดรอบส่งแล้วเท่านั้น
  if (!isOrderScheduled(order)) return <CustomerTrackingNotScheduled order={order} />;

  const timelineEvents = [...getPublicTimelineEvents(order)].sort((a, b) =>
    b.at.localeCompare(a.at),
  );
  const shippingMethod = order.shippingMethod ?? 'internal_driver';
  const mapsUrl = getMapsUrl(order);
  const plannedDelivery = getPlannedDelivery(order);
  const publicStatusLabel = getCustomerPublicStatusLabel(order.status);
  const liveDistanceMeters =
    liveTracking?.destination && haversineMeters(liveTracking.position, liveTracking.destination);
  const liveMapsUrl = liveTracking
    ? `https://www.google.com/maps/search/?api=1&query=${liveTracking.position.lat},${liveTracking.position.lng}`
    : null;

  return (
    <main className="min-h-dvh bg-muted/30 text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
        <header className="border-b bg-background px-4 pb-4 pt-safe">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">Ausiris Delivery</div>
              <h1 className="mt-1 truncate font-mono text-xl font-semibold">{order.orderNo}</h1>
            </div>
            <Badge variant={getStatusVariant(order.status)} className="shrink-0">
              {publicStatusLabel}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">อัปเดตล่าสุดจากระบบจัดส่งของ Ausiris</p>
        </header>

        <div className="flex-1 space-y-3 p-4 pb-safe">
          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">สถานะสินค้า</div>
                <div className="mt-1 text-2xl font-semibold">{publicStatusLabel}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  วิธีจัดส่ง: {shippingMethodLabel[shippingMethod]}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-5 gap-1">
              {DELIVERY_STEPS.map((step, index) => {
                const state = getStepState(order, index);
                const Icon = step.icon;
                return (
                  <div key={step.key} className="min-w-0 text-center">
                    <div
                      className={cn(
                        'mx-auto flex h-9 w-9 items-center justify-center rounded-full border',
                        state === 'done' && 'border-success bg-success text-success-foreground',
                        state === 'current' && 'border-info bg-info text-info-foreground',
                        state === 'problem' && 'border-warning bg-warning text-warning-foreground',
                        state === 'upcoming' && 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                      {step.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {isInTransit && liveTracking && liveMapsUrl && (
            <section className="rounded-lg border border-info/40 bg-info/5 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-info/15 text-info">
                  <Navigation className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">
                    {liveTracking.messengerName} กำลังนำส่งสินค้า
                  </div>
                  {liveDistanceMeters != null ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      ห่างจากปลายทางประมาณ {formatApproxDistance(liveDistanceMeters)} (โดยประมาณ)
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      คนส่งกำลังเดินทางมาหาคุณ
                    </div>
                  )}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    อัปเดตตำแหน่งล่าสุด {formatDateTime(liveTracking.recordedAt)}
                  </div>
                  <Button size="sm" variant="outline" className="mt-3" asChild>
                    <a href={liveMapsUrl} target="_blank" rel="noreferrer">
                      <MapPin className="h-3.5 w-3.5" />
                      ดูตำแหน่งคนส่ง
                    </a>
                  </Button>
                </div>
              </div>
            </section>
          )}

          {plannedDelivery && (
            <section className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">กำหนดจัดส่ง</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {formatPlanningDateTime(plannedDelivery.date, plannedDelivery.time)}
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">ปลายทางจัดส่ง</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  แสดงที่อยู่เต็ม เบอร์โทรปกปิดบางส่วน
                </div>
              </div>
              <Button size="sm" variant="outline" asChild>
                <a href={mapsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Map
                </a>
              </Button>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{order.customer.address}</span>
              </div>
              <div className="flex gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{maskPhone(order.customer.phone)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">รายการสินค้า</div>
              <Badge variant="muted">{order.items.length} รายการ</Badge>
            </div>
            <div className="mt-3 divide-y">
              {order.items.map((item) => (
                <div key={`${item.sku}-${item.name}`} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {item.purity} · {item.weight}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums">x{item.qty}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatTHB(item.unitPrice)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <span className="text-xs text-muted-foreground">{paymentLabel[order.payment]}</span>
              <span className="text-base font-semibold tabular-nums">
                {formatTHB(order.totalValue)}
              </span>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Timeline</div>
            </div>
            {timelineEvents.length === 0 ? (
              <div className="mt-3 rounded-md border border-dashed bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
                ยังไม่มีประวัติการจัดส่งที่แสดงให้ลูกค้า
              </div>
            ) : (
              <ol className="mt-5">
                {timelineEvents.map((event, index) => {
                  const isLast = index === timelineEvents.length - 1;
                  const isLatest = index === 0;
                  const isCurrentLatest = isLatest && event.tone === 'default';
                  const Icon =
                    event.tone === 'success'
                      ? CheckCircle2
                      : event.tone === 'problem'
                        ? AlertCircle
                        : Clock;
                  return (
                    <li key={event.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                      {/* เส้นเชื่อม timeline (ซ่อนที่จุดสุดท้าย) */}
                      {!isLast && (
                        <span
                          aria-hidden
                          className={cn(
                            'absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px -translate-x-1/2',
                            isCurrentLatest
                              ? 'bg-gradient-to-b from-info/60 to-info/15'
                              : event.tone === 'success'
                                ? 'bg-gradient-to-b from-success/60 to-success/15'
                                : event.tone === 'problem'
                                  ? 'bg-gradient-to-b from-warning/60 to-warning/15'
                                  : 'bg-gradient-to-b from-primary/50 to-primary/15',
                          )}
                        />
                      )}
                      <div className="relative shrink-0">
                        <div
                          className={cn(
                            'relative flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-card',
                            event.tone === 'success' && 'bg-success/12 text-success',
                            event.tone === 'problem' && 'bg-warning/12 text-warning',
                            event.tone === 'default' &&
                              (isCurrentLatest
                                ? 'bg-info/12 text-info'
                                : 'bg-primary/12 text-primary'),
                            isCurrentLatest && 'ring-2 ring-info/40 ring-offset-2 ring-offset-card',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className={cn('text-sm font-medium', isCurrentLatest && 'text-info')}>
                          {event.label}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDateTime(event.at)}
                        </div>
                        {event.proof && <CustomerProofTimelineCard proof={event.proof} />}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
