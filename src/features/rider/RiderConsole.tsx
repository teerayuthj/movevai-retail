import { useEffect, useMemo, useState } from 'react';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import { useRetailStore } from '@/state/retailStore';
import { statusLabel } from '@/data/mock';
import { CheckCircle2 } from 'lucide-react';
import { RIDER_JOB_STATUSES, RIDER_TABS, type RiderTab } from './riderTabs';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useRiderTab } from './hooks/useRiderTab';
import { RiderHeader } from './components/RiderHeader';
import { InstallBanner } from './components/InstallBanner';
import { JobCard } from './components/JobCard';
import { RiderTabBar } from './components/RiderTabBar';

export function RiderConsolePage({ onExit }: { onExit?: () => void }) {
  const { orders, drivers, startDelivery, submitDelivery } = useRetailStore();
  const [riderId, setRiderId] = useState<string>(() => drivers[0]?.id ?? '');
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const install = useInstallPrompt();
  const { activeTab, setTab } = useRiderTab();

  const rider = drivers.find((driver) => driver.id === riderId) ?? null;

  const myJobs = useMemo(
    () =>
      orders.filter(
        (order) => order.assignedDriverId === riderId && RIDER_JOB_STATUSES.includes(order.status),
      ),
    [orders, riderId],
  );

  const counts: Record<RiderTab, number> = {
    assigned: myJobs.filter((o) => o.status === 'assigned').length,
    in_transit: myJobs.filter((o) => o.status === 'in_transit').length,
    pending_confirmation: myJobs.filter((o) => o.status === 'pending_confirmation').length,
    delivered: myJobs.filter((o) => o.status === 'delivered').length,
  };

  // ผูก tab กับ URL: /rider เปล่า → เด้งไป tab แรกที่มีงาน, tab ปัจจุบันว่าง → เด้งหา tab ที่มีงาน
  // ใช้ replace เพื่อไม่ให้ redirect ค้างใน history (back/forward ยังถูก)
  useEffect(() => {
    const firstWithJobs = RIDER_TABS.find((tab) => counts[tab.key] > 0)?.key;
    if (activeTab === null) {
      setTab(firstWithJobs ?? 'assigned', { replace: true });
    } else if (counts[activeTab] === 0 && firstWithJobs) {
      setTab(firstWithJobs, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    riderId,
    counts.assigned,
    counts.in_transit,
    counts.pending_confirmation,
    counts.delivered,
  ]);

  const tabJobs = activeTab ? myJobs.filter((order) => order.status === activeTab) : [];

  return (
    <div className="flex min-h-dvh w-full justify-center bg-muted/40">
      {/* surface เต็มจอ mobile-first — บน desktop จำกัดความกว้างให้เหมือนมือถือ */}
      <div className="flex min-h-dvh w-full max-w-md flex-col bg-background shadow-xs">
        <RiderHeader
          rider={rider}
          drivers={drivers}
          riderId={riderId}
          switcherOpen={switcherOpen}
          onToggleSwitcher={() => setSwitcherOpen((prev) => !prev)}
          onSelectRider={(id) => {
            setRiderId(id);
            setSwitcherOpen(false);
          }}
          onExit={onExit}
        />

        <InstallBanner install={install} />

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
          {activeTab && tabJobs.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
              ไม่มีงานในสถานะ “{statusLabel[activeTab]}”
            </div>
          )}
        </div>

        <RiderTabBar activeTab={activeTab} counts={counts} onSelect={(tab) => setTab(tab)} />
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
