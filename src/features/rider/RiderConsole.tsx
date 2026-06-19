import { useCallback, useEffect, useMemo, useState } from 'react';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import { Button } from '@/components/ui/button';
import { useRetailStore } from '@/state/retailStore';
import { statusLabel } from '@/data/mock';
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { RIDER_JOB_STATUSES, RIDER_TABS, type RiderTab } from './riderTabs';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useRiderTab } from './hooks/useRiderTab';
import {
  clearRiderAppBadge,
  currentPermission,
  DEFAULT_RIDER_CODE,
  isPushSupported,
  subscribeToPush,
} from './push';
import { RiderHeader } from './components/RiderHeader';
import { JobCard } from './components/JobCard';
import { getRiderJobOverdueMinutes, getRiderJobScheduledAt } from './riderSchedule';
import { RiderTabBar } from './components/RiderTabBar';
import { RiderCompletedList } from './components/RiderCompletedList';
import { RiderProfileSheet } from './components/RiderProfileSheet';
import { RiderPushSetupBanner } from './components/RiderPushSetupBanner';

const RIDER_STORAGE_KEY = 'movevai:rider-code';

function resolveRiderCode() {
  const fromUrl = new URLSearchParams(window.location.search).get('rider')?.trim();
  if (fromUrl) {
    localStorage.setItem(RIDER_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(RIDER_STORAGE_KEY) || DEFAULT_RIDER_CODE;
}

export function RiderConsolePage({ onExit }: { onExit?: () => void }) {
  const { orders, drivers, startDelivery, submitDelivery, refreshRiderJobs } = useRetailStore();
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const install = useInstallPrompt();
  const { activeTab, setTab } = useRiderTab();
  const [riderCode] = useState(resolveRiderCode);

  const rider = drivers.find((driver) => driver.id === riderCode) ?? null;

  const myJobs = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assignedDriverId === riderCode && RIDER_JOB_STATUSES.includes(order.status),
      ),
    [orders, riderCode],
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

  // คง subscription ของเครื่องนี้ให้สดเมื่อเคยอนุญาต Push แล้ว
  // ใช้ได้ทั้ง PWA และ Desktop Web ที่เปิดผ่าน HTTPS/localhost
  useEffect(() => {
    if (!rider || !isPushSupported() || currentPermission() !== 'granted') {
      return;
    }
    void subscribeToPush(rider.id);
  }, [rider]);

  const refreshJobs = useCallback(
    async (background = false) => {
      if (!background) setJobsLoading(true);
      try {
        await refreshRiderJobs(riderCode);
        setJobsError(null);
      } catch (error) {
        setJobsError(error instanceof Error ? error.message : 'โหลดข้อมูลงานไม่สำเร็จ');
      } finally {
        if (!background) setJobsLoading(false);
      }
    },
    [refreshRiderJobs, riderCode],
  );

  useEffect(() => {
    void refreshJobs();

    const intervalId = window.setInterval(() => void refreshJobs(true), 15_000);
    const onFocus = () => void refreshJobs(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshJobs(true);
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | undefined)?.type === 'movevai:rider-push-job-added') {
        void refreshJobs(true);
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [refreshJobs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const overdueCount = myJobs.filter(
    (order) => getRiderJobOverdueMinutes(order, nowMs) != null,
  ).length;

  const tabJobs = activeTab
    ? myJobs
        .filter((order) => order.status === activeTab)
        .sort((a, b) => {
          const aOverdue = getRiderJobOverdueMinutes(a, nowMs) != null;
          const bOverdue = getRiderJobOverdueMinutes(b, nowMs) != null;
          if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
          if (aOverdue && bOverdue) {
            return (getRiderJobScheduledAt(a) ?? 0) - (getRiderJobScheduledAt(b) ?? 0);
          }
          const dateCompare = (a.deliveryPlan?.plannedDate ?? '').localeCompare(
            b.deliveryPlan?.plannedDate ?? '',
          );
          return dateCompare || (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0);
        })
    : [];

  return (
    <div className="flex min-h-dvh w-full justify-center bg-muted/40">
      {/* surface เต็มจอ mobile-first — บน desktop จำกัดความกว้างให้เหมือนมือถือ */}
      <div className="relative flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-xs">
        <RiderHeader rider={rider} onOpenProfile={() => setProfileOpen(true)} />
        {rider && <RiderPushSetupBanner installed={install.installed} riderCode={rider.id} />}

        {/* job list */}
        <div className="flex-1 space-y-2.5 overflow-auto p-3 pb-safe">
          {jobsLoading && myJobs.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              กำลังโหลดงานจาก Route…
            </div>
          )}
          {jobsError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>โหลดข้อมูลงานไม่ได้ — {jobsError}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                disabled={jobsLoading}
                onClick={() => void refreshJobs()}
              >
                <RefreshCw className={jobsLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                ลองโหลดใหม่
              </Button>
            </div>
          )}
          {activeTab === 'assigned' && overdueCount > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                มี {overdueCount} งานเลยเวลานัดส่ง กรุณารับงานทันที
              </div>
            </div>
          )}
          {activeTab === 'in_transit' && counts.assigned > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-warning">
                <ClipboardList className="h-4 w-4" />
                มีงานใหม่รอรับ {counts.assigned} งาน
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full border-warning/30 bg-white text-warning hover:bg-warning/15"
                onClick={() => setTab('assigned')}
              >
                ไปกดรับงาน
              </Button>
            </div>
          )}
          {!jobsLoading && activeTab === 'delivered' && rider ? (
            // tab สำเร็จ: ดึงรายการที่ส่งสำเร็จจาก backend โดยตรง (privacy-minimal, ไม่มี PII ลูกค้า)
            <RiderCompletedList riderCode={rider.id} />
          ) : (
            <>
              {tabJobs.map((order, index) => {
                const showDate =
                  activeTab === 'assigned' &&
                  order.deliveryPlan?.plannedDate !== tabJobs[index - 1]?.deliveryPlan?.plannedDate;
                return (
                  <div key={order.id}>
                    {showDate && order.deliveryPlan?.plannedDate && (
                      <div className="mb-2 mt-3 text-xs font-semibold text-muted-foreground first:mt-0">
                        งานวันที่{' '}
                        {new Date(`${order.deliveryPlan.plannedDate}T00:00:00`).toLocaleDateString(
                          'th-TH',
                          { dateStyle: 'full' },
                        )}
                      </div>
                    )}
                    <JobCard
                      order={order}
                      nowMs={nowMs}
                      onStart={() => void startDelivery(order.id)}
                      onClose={() => setCloseTargetId(order.id)}
                    />
                  </div>
                );
              })}
              {!jobsLoading && !jobsError && activeTab && tabJobs.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
                  ไม่มีงานในสถานะ “{statusLabel[activeTab]}”
                </div>
              )}
            </>
          )}
        </div>

        <RiderTabBar activeTab={activeTab} counts={counts} onSelect={(tab) => setTab(tab)} />

        {rider && profileOpen && (
          <RiderProfileSheet
            rider={rider}
            install={install}
            onClose={() => setProfileOpen(false)}
            onExit={onExit}
          />
        )}
      </div>

      <RiderCloseJobDialog
        open={!!closeTargetId}
        order={orders.find((order) => order.id === closeTargetId) ?? null}
        onCancel={() => setCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!closeTargetId) return;
          await submitDelivery(closeTargetId, input);
          setCloseTargetId(null);
        }}
      />
    </div>
  );
}
