import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import { useRetailStore } from '@/state/retailStore';
import { formatTHB, paymentLabel, statusLabel, type Order } from '@/data/mock';
import { isHighValueOrder } from '@/lib/deliveryExecution';
import { cn } from '@/lib/utils';
import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  IdCard,
  MapPin,
  Navigation,
  Package,
  Phone,
  ShieldCheck,
} from 'lucide-react';

type RiderTab = 'assigned' | 'in_transit' | 'pending_confirmation';

const RIDER_TABS: { key: RiderTab; label: string }[] = [
  { key: 'assigned', label: 'งานใหม่' },
  { key: 'in_transit', label: 'กำลังส่ง' },
  { key: 'pending_confirmation', label: 'รอ CS' },
];

function JobCard({
  order,
  onStart,
  onClose,
}: {
  order: Order;
  onStart: () => void;
  onClose: () => void;
}) {
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.code}</span>
        <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
          <Package className="h-3 w-3" /> {order.items.length}
        </Badge>
      </div>
      <div className="mt-1 text-sm font-semibold">{order.customer.name}</div>

      <div className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{order.customer.address}</span>
        </div>
        <a href={`tel:${order.customer.phone}`} className="flex items-center gap-1.5 text-sky-600">
          <Phone className="h-3.5 w-3.5" />
          <span>{order.customer.phone}</span>
        </a>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {isHighValueOrder(order) && (
          <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <ShieldCheck className="h-2.5 w-2.5" />
            ของมีค่า
          </Badge>
        )}
        {order.requiresIdCheck && (
          <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <IdCard className="h-2.5 w-2.5" />
            ตรวจบัตร
          </Badge>
        )}
        {isCod && (
          <Badge variant="muted" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <Banknote className="h-2.5 w-2.5" />
            {paymentLabel[order.payment]}
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-sm font-semibold tabular-nums text-amber-800">
          {formatTHB(order.totalValue)}
        </span>

        {order.status === 'assigned' && (
          <Button size="sm" onClick={onStart}>
            <Navigation className="h-4 w-4" />
            เริ่มเดินทาง
          </Button>
        )}
        {order.status === 'in_transit' && (
          <Button size="sm" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" />
            ปิดงาน
          </Button>
        )}
        {order.status === 'pending_confirmation' && (
          <Badge variant="warning" className="gap-1">
            <ClipboardCheck className="h-3 w-3" />
            รอ CS ยืนยัน
          </Badge>
        )}
      </div>
    </div>
  );
}

export function RiderConsolePage() {
  const { orders, drivers, startDelivery, submitDelivery } = useRetailStore();
  const [riderId, setRiderId] = useState<string>(() => drivers[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<RiderTab>('assigned');
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);

  const rider = drivers.find((driver) => driver.id === riderId) ?? null;

  const myJobs = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assignedDriverId === riderId &&
          ['assigned', 'in_transit', 'pending_confirmation'].includes(order.status),
      ),
    [orders, riderId],
  );

  const counts: Record<RiderTab, number> = {
    assigned: myJobs.filter((o) => o.status === 'assigned').length,
    in_transit: myJobs.filter((o) => o.status === 'in_transit').length,
    pending_confirmation: myJobs.filter((o) => o.status === 'pending_confirmation').length,
  };

  // ถ้าแท็บปัจจุบันว่าง ให้เด้งไปแท็บที่มีงาน
  useEffect(() => {
    if (counts[activeTab] === 0) {
      const next = RIDER_TABS.find((tab) => counts[tab.key] > 0);
      if (next) setActiveTab(next.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riderId]);

  const tabJobs = myJobs.filter((order) => order.status === activeTab);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      {/* ตัวสลับ identity — ของจริงจะมาจากการ login ของ rider */}
      <div className="rounded-lg border bg-muted/30 p-2.5">
        <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          ทดสอบในชื่อ rider (จำลองการล็อกอิน)
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {drivers.map((driver) => (
            <button
              key={driver.id}
              type="button"
              onClick={() => setRiderId(driver.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                driver.id === riderId
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <DriverAvatar driver={driver} className="h-5 w-5" />
              {driver.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* phone frame */}
      <div className="overflow-hidden rounded-[28px] border-2 border-foreground/10 bg-background shadow-sm">
        {/* rider header */}
        <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-3">
          {rider && <DriverAvatar driver={rider} className="h-10 w-10" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{rider?.name ?? '—'}</div>
            <div className="text-[11px] text-muted-foreground">
              {rider?.zone} · งานวันนี้ {rider?.activeOrders}/{rider?.capacity}
            </div>
          </div>
          <Badge
            variant={rider?.status === 'available' ? 'success' : 'muted'}
            className="h-5 px-1.5 text-[10px]"
          >
            {rider?.status === 'available'
              ? 'ว่าง'
              : rider?.status === 'on_delivery'
                ? 'กำลังส่ง'
                : 'หยุด'}
          </Badge>
        </div>

        {/* tabs */}
        <div className="flex gap-1 border-b bg-muted/30 p-1.5">
          {RIDER_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground',
              )}
            >
              {tab.label}
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] tabular-nums">
                {counts[tab.key]}
              </span>
            </button>
          ))}
        </div>

        {/* job list */}
        <div className="max-h-[calc(100vh-18rem)] space-y-2.5 overflow-auto p-3">
          {tabJobs.map((order) => (
            <JobCard
              key={order.id}
              order={order}
              onStart={() => startDelivery(order.id)}
              onClose={() => setCloseTargetId(order.id)}
            />
          ))}
          {tabJobs.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
              ไม่มีงานในสถานะ “{statusLabel[activeTab]}”
            </div>
          )}
        </div>
      </div>

      <RiderCloseJobDialog
        open={!!closeTargetId}
        order={orders.find((order) => order.id === closeTargetId) ?? null}
        onCancel={() => setCloseTargetId(null)}
        onSubmit={(input) => {
          if (!closeTargetId) return;
          submitDelivery(closeTargetId, input);
          setCloseTargetId(null);
        }}
      />
    </div>
  );
}
