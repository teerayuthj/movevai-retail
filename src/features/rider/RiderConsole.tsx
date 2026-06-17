import { useCallback, useEffect, useMemo, useState } from 'react';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import { Button } from '@/components/ui/button';
import { useRetailStore } from '@/state/retailStore';
import { statusLabel } from '@/data/mock';
import { CheckCircle2, ClipboardList } from 'lucide-react';
import { RIDER_JOB_STATUSES, RIDER_TABS, type RiderTab } from './riderTabs';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useRiderTab } from './hooks/useRiderTab';
import { clearRiderAppBadge, drainQueuedRiderPushJobs } from './push';
import { RiderHeader } from './components/RiderHeader';
import { InstallBanner } from './components/InstallBanner';
import { JobCard } from './components/JobCard';
import { RiderTabBar } from './components/RiderTabBar';
import { RiderPushSetupBanner } from './components/RiderPushSetupBanner';

const DEMO_RIDER_ID = 'D-02';

export function RiderConsolePage({ onExit }: { onExit?: () => void }) {
  const { orders, drivers, startDelivery, submitDelivery, importRiderPushJobs } = useRetailStore();
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const install = useInstallPrompt();
  const { activeTab, setTab } = useRiderTab();

  const rider = drivers.find((driver) => driver.id === DEMO_RIDER_ID) ?? drivers[0] ?? null;

  const myJobs = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assignedDriverId === rider?.id && RIDER_JOB_STATUSES.includes(order.status),
      ),
    [orders, rider?.id],
  );

  const counts: Record<RiderTab, number> = {
    assigned: myJobs.filter((o) => o.status === 'assigned').length,
    in_transit: myJobs.filter((o) => o.status === 'in_transit').length,
    pending_confirmation: myJobs.filter((o) => o.status === 'pending_confirmation').length,
    delivered: myJobs.filter((o) => o.status === 'delivered').length,
  };

  // auto-select เฉพาะตอน /rider เปล่า (ยังไม่ได้เลือก tab) → เด้งไป tab แรกที่มีงาน
  // ใช้ replace เพื่อไม่ให้ /rider ค้างใน history (back/forward ยังถูก)
  // ไม่เด้งตอน tab ปัจจุบันว่าง — ผู้ใช้ต้องกดดู tab ว่างได้ (เห็น empty state)
  useEffect(() => {
    if (activeTab !== null) return;
    const firstWithJobs = RIDER_TABS.find((tab) => counts[tab.key] > 0)?.key;
    setTab(firstWithJobs ?? 'assigned', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeTab,
    counts.assigned,
    counts.in_transit,
    counts.pending_confirmation,
    counts.delivered,
  ]);

  useEffect(() => {
    if (activeTab !== 'assigned') return;
    void clearRiderAppBadge();
  }, [activeTab]);

  const drainPushJobs = useCallback(async () => {
    const jobs = await drainQueuedRiderPushJobs();
    if (jobs.length > 0) importRiderPushJobs(jobs);
  }, [importRiderPushJobs]);

  useEffect(() => {
    void drainPushJobs();

    const onFocus = () => void drainPushJobs();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void drainPushJobs();
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === 'movevai:rider-push-job-added') {
        void drainPushJobs();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [drainPushJobs]);

  const tabJobs = activeTab ? myJobs.filter((order) => order.status === activeTab) : [];

  return (
    <div className="flex min-h-dvh w-full justify-center bg-muted/40">
      {/* surface เต็มจอ mobile-first — บน desktop จำกัดความกว้างให้เหมือนมือถือ */}
      <div className="flex min-h-dvh w-full max-w-md flex-col bg-background shadow-xs">
        <RiderHeader rider={rider} onExit={onExit} />

        <InstallBanner install={install} />
        <RiderPushSetupBanner installed={install.installed} />

        {/* job list */}
        <div className="flex-1 space-y-2.5 overflow-auto p-3 pb-safe">
          {activeTab === 'in_transit' && counts.assigned > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-950">
                <ClipboardList className="h-4 w-4" />
                มีงานใหม่รอรับ {counts.assigned} งาน
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
                onClick={() => setTab('assigned')}
              >
                ไปกดรับงาน
              </Button>
            </div>
          )}
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
