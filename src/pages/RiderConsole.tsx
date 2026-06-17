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
  ChevronDown,
  ClipboardCheck,
  Download,
  IdCard,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Phone,
  Share,
  ShieldCheck,
} from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as { standalone?: boolean }).standalone === true);

const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** จัดการ "เพิ่มลงหน้าจอโฮม" — Android/Chrome ใช้ beforeinstallprompt, iOS ต้องบอกวิธีเอง */
function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return {
    installed,
    canPrompt: !!deferred,
    needsIosHint: !installed && isIos() && !deferred,
    promptInstall,
  };
}

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

export function RiderConsolePage({ onExit }: { onExit?: () => void }) {
  const { orders, drivers, startDelivery, submitDelivery } = useRetailStore();
  const [riderId, setRiderId] = useState<string>(() => drivers[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<RiderTab>('assigned');
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [iosHintOpen, setIosHintOpen] = useState(false);
  const install = useInstallPrompt();

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
    <div className="flex min-h-dvh w-full justify-center bg-muted/40">
      {/* surface เต็มจอ mobile-first — บน desktop จำกัดความกว้างให้เหมือนมือถือ */}
      <div className="flex min-h-dvh w-full max-w-md flex-col bg-background shadow-xs">
        {/* rider header (sticky) */}
        <header className="sticky top-0 z-10 border-b bg-primary/5 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 pb-3 pt-safe">
            {rider && <DriverAvatar driver={rider} className="h-10 w-10" />}
            <button
              type="button"
              onClick={() => setSwitcherOpen((prev) => !prev)}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{rider?.name ?? '—'}</div>
                <div className="text-[11px] text-muted-foreground">
                  {rider?.zone} · งานวันนี้ {rider?.activeOrders}/{rider?.capacity}
                </div>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                  switcherOpen && 'rotate-180',
                )}
              />
            </button>
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

          {/* identity switcher — จำลองการ login (ของจริงจะมาจาก auth ของ rider) */}
          {switcherOpen && (
            <div className="border-t bg-background/60 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  สลับบัญชี rider (จำลองการล็อกอิน)
                </span>
                {onExit && (
                  <button
                    type="button"
                    onClick={onExit}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="h-3 w-3" />
                    ออกจากโหมด rider
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {drivers.map((driver) => (
                  <button
                    key={driver.id}
                    type="button"
                    onClick={() => {
                      setRiderId(driver.id);
                      setSwitcherOpen(false);
                    }}
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
          )}

          {/* tabs */}
          <div className="flex gap-1 border-t bg-muted/30 p-1.5">
            {RIDER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-background text-foreground shadow-xs'
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
        </header>

        {/* เพิ่มลงหน้าจอโฮม — แสดงเฉพาะตอนยังไม่ได้ติดตั้งและติดตั้งได้ */}
        {!install.installed && (install.canPrompt || install.needsIosHint) && (
          <div className="border-b bg-primary/5 px-3 py-2.5">
            {install.canPrompt ? (
              <button
                type="button"
                onClick={install.promptInstall}
                className="flex w-full items-center gap-2.5 text-left"
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Download className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">ติดตั้งแอป MoveVai Rider</span>
                  <span className="block text-[11px] text-muted-foreground">
                    เพิ่มลงหน้าจอโฮม เปิดเร็วขึ้น ใช้แบบเต็มจอ
                  </span>
                </span>
              </button>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => setIosHintOpen((prev) => !prev)}
                  className="flex w-full items-center gap-2.5 text-left"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Share className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">เพิ่มลงหน้าจอโฮม</span>
                    <span className="block text-[11px] text-muted-foreground">
                      ใช้งานเหมือนแอป — แตะดูวิธีติดตั้งบน iPhone
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                      iosHintOpen && 'rotate-180',
                    )}
                  />
                </button>
                {iosHintOpen && (
                  <ol className="mt-2 space-y-1 pl-1 text-[12px] text-muted-foreground">
                    <li>
                      1. แตะปุ่ม <Share className="inline h-3.5 w-3.5" /> (Share) ใน Safari
                    </li>
                    <li>2. เลือก “เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)</li>
                    <li>3. แตะ “เพิ่ม” — จะได้ไอคอน MoveVai Rider บนหน้าจอ</li>
                  </ol>
                )}
              </div>
            )}
          </div>
        )}

        {/* job list */}
        <div className="flex-1 space-y-2.5 overflow-auto p-3 pb-safe">
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
