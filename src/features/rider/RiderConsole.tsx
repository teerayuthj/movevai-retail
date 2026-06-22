import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import { Button } from '@/components/ui/button';
import { useRetailStore } from '@/state/retailStore';
import { statusLabel } from '@/data/mock';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
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
import { RiderRouteMap } from './components/RiderRouteMap';
import { useRouteStops } from './hooks/useRouteStops';
import { cn } from '@/lib/utils';
import type { Order } from '@/data/mock';
import { hasRiderSession, logoutRider, type RiderSession } from '@/lib/retailApi';
import { RiderLogin } from './components/RiderLogin';
import { TestRouteDialog } from './components/TestRouteDialog';
import { useRiderTracking } from './hooks/useRiderTracking';
import { useRiderLocation } from './hooks/useRiderLocation';

const RIDER_STORAGE_KEY = 'movevai:rider-code';

function resolveRiderCode() {
  const fromUrl = new URLSearchParams(window.location.search).get('rider')?.trim();
  if (fromUrl && import.meta.env.DEV && import.meta.env.VITE_ALLOW_LEGACY_RIDER_QUERY === 'true') {
    localStorage.setItem(RIDER_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(RIDER_STORAGE_KEY) || DEFAULT_RIDER_CODE;
}

export function RiderConsolePage({ onExit }: { onExit?: () => void }) {
  const [authenticated, setAuthenticated] = useState(hasRiderSession);
  const { orders, drivers, startDelivery, submitDelivery, refreshRiderJobs } = useRetailStore();
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [assignedView, setAssignedView] = useState<'list' | 'map'>('list');
  // โฟกัสแผนที่ไปที่ปลายทางของงานเดียว (กดจากการ์ด) — null = ดูทั้ง Route ที่เลือก
  const [mapFocusOrderId, setMapFocusOrderId] = useState<string | null>(null);
  // กลุ่ม Route+วันส่งที่เลือกดูบนแผนที่ (null = ใช้กลุ่มแรก)
  const [mapGroupKey, setMapGroupKey] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const install = useInstallPrompt();
  const { activeTab, setTab } = useRiderTab();
  const [riderCode, setRiderCode] = useState(resolveRiderCode);
  const tracking = useRiderTracking(authenticated);
  // ถ้า backend เริ่ม tracking session ไม่สำเร็จ ยังอ่าน GPS บนอุปกรณ์เพื่อแสดงแผนที่
  // และแนบพิกัดจริงตอนปิดงานได้ โดยไม่สร้างตำแหน่งจำลอง
  const fallbackLocation = useRiderLocation(
    authenticated && activeTab === 'in_transit' && !tracking.session,
  );
  const autoOpenedSessionId = useRef<string | null>(null);

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
    // Test Route ไม่มี Order แต่ถือเป็นกิจกรรมที่กำลังส่งหนึ่งรายการใน UI
    in_transit:
      myJobs.filter((o) => o.status === 'in_transit').length +
      (tracking.session?.type === 'test' ? 1 : 0),
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

  // เมื่อพบ active session จาก backend (รวม session ที่เริ่มจาก Web/PWA อีกตัว)
  // เปิดหน้ากำลังส่งหนึ่งครั้ง แล้วปล่อยให้ rider เปลี่ยนแท็บเองได้ตามปกติ
  useEffect(() => {
    if (!tracking.session || autoOpenedSessionId.current === tracking.session.id) return;
    autoOpenedSessionId.current = tracking.session.id;
    setTab('in_transit', { replace: true });
  }, [setTab, tracking.session]);

  // คง subscription ของเครื่องนี้ให้สดเมื่อเคยอนุญาต Push แล้ว
  // ใช้ได้ทั้ง PWA และ Desktop Web ที่เปิดผ่าน HTTPS/localhost
  useEffect(() => {
    if (!rider || !isPushSupported() || currentPermission() !== 'granted') {
      return;
    }
    void subscribeToPush(rider.id);
  }, [rider]);

  // เริ่มส่งงาน = จังหวะ rider ออกไปส่งของจริง → ถ้ายังไม่ได้บันทึก Route ของรอบนี้
  // ให้ start tracking อัตโนมัติ เพื่อให้ "ทุกรอบถูกบันทึก" โดยไม่ต้องพึ่งความจำ rider
  const handleStartJob = useCallback(
    async (order: Order) => {
      await startDelivery(order.id);
      const routeId = order.deliveryRoute?.id;
      if (routeId && !tracking.session) {
        // GPS/route start อาจล้มเหลว (สิทธิ์ตำแหน่ง/เครือข่าย) — ไม่ให้บล็อกการเริ่มส่งงาน
        try {
          await tracking.start(routeId);
        } catch {
          /* ปล่อยให้ rider ส่งงานต่อได้ แม้บันทึกเส้นทางไม่เริ่ม */
        }
      }
      setTab('in_transit');
    },
    [setTab, startDelivery, tracking],
  );

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
    // อย่ายิง fetch ก่อน login — ตอนยังไม่มี bearer token backend จะตอบ
    // "Missing rider bearer token" แล้ว error ค้างทับหน้าจอหลัง login เสร็จ
    if (!authenticated) return;

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
  }, [authenticated, refreshJobs]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const overdueCount = myJobs.filter(
    (order) => getRiderJobOverdueMinutes(order, nowMs) != null,
  ).length;

  const tabJobs = useMemo(
    () =>
      activeTab
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
              return (
                dateCompare || (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0)
              );
            })
        : [],
    [activeTab, myJobs, nowMs],
  );

  const showAssignedMap = activeTab === 'assigned' && assignedView === 'map';
  const showTrackingMap =
    activeTab === 'in_transit' && (Boolean(tracking.session) || counts.in_transit > 0);
  // Leaflet ใช้ transform/GPU layers ซึ่งบน iOS Safari สามารถทะลุ fixed modal และ video ได้
  // เมื่อเปิด overlay ต้อง unmount map จริง ไม่ใช่แค่เพิ่ม z-index หรือซ่อนด้วย opacity
  const suspendMap = Boolean(closeTargetId) || testDialogOpen || profileOpen;

  // จัดงานใหม่เป็นกลุ่มตาม Route + วันส่ง เพื่อให้แผนที่แยกแต่ละรอบชัดเจน
  // (ไม่รวมงานล่วงหน้าหลายวัน/หลาย Route ไว้บนภาพเดียวจนหมุดทับกัน)
  const mapGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; date: string | null; routeCode: string | null; jobs: Order[] }
    >();
    for (const order of tabJobs) {
      const date = order.deliveryPlan?.plannedDate ?? null;
      const routeId = order.deliveryRoute?.id ?? null;
      const key = `${date ?? 'no-date'}__${routeId ?? 'no-route'}`;
      const existing = groups.get(key);
      if (existing) existing.jobs.push(order);
      else
        groups.set(key, { key, date, routeCode: order.deliveryRoute?.code ?? null, jobs: [order] });
    }
    return [...groups.values()];
  }, [tabJobs]);

  const groupKeyOf = (order: Order) =>
    `${order.deliveryPlan?.plannedDate ?? 'no-date'}__${order.deliveryRoute?.id ?? 'no-route'}`;

  const selectedGroup =
    mapGroups.find((group) => group.key === mapGroupKey) ?? mapGroups[0] ?? null;
  const focusOrder = mapFocusOrderId
    ? (tabJobs.find((order) => order.id === mapFocusOrderId) ?? null)
    : null;

  // หน้ากำลังส่งต้องแสดงเฉพาะจุดหมายของงานที่ rider กำลังนำส่งอยู่ ไม่รวมงาน assigned
  // ที่ยังรอรับใน route เดียวกัน มิฉะนั้นผู้ใช้จะเห็นหลายจุดและไม่รู้ว่าต้องไปจุดไหนก่อน
  const activeDeliveryJob = myJobs
    .filter((order) => order.status === 'in_transit')
    .sort((a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0))[0];
  const routeMapJobs = showAssignedMap
    ? focusOrder
      ? [focusOrder]
      : (selectedGroup?.jobs ?? [])
    : showTrackingMap && activeDeliveryJob
      ? [activeDeliveryJob]
      : [];
  const routeStops = useRouteStops(routeMapJobs);
  const liveLocation = tracking.session ? tracking.location : fallbackLocation.location;
  const liveLocationSource = tracking.session
    ? {
        location: tracking.location,
        status: tracking.status,
        error: tracking.error,
        retry: tracking.retry,
        remote: !tracking.isOwner,
      }
    : {
        location: fallbackLocation.location,
        status: fallbackLocation.status,
        error: fallbackLocation.error,
        retry: fallbackLocation.retry,
        remote: false,
      };

  const handleViewOrderMap = useCallback((order: Order) => {
    setMapFocusOrderId(order.id);
    setMapGroupKey(groupKeyOf(order));
    setAssignedView('map');
  }, []);
  const activeRouteId = myJobs.find((order) => order.deliveryRoute)?.deliveryRoute?.id;

  if (!authenticated) {
    return (
      <RiderLogin
        onLogin={(session: RiderSession) => {
          setRiderCode(session.rider.code);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-dvh w-full justify-center bg-muted/40">
      {/* surface เต็มจอ mobile-first — บน desktop จำกัดความกว้างให้เหมือนมือถือ */}
      <div className="relative flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-xs">
        <RiderHeader
          rider={rider}
          // สถานะ badge ต้องตามกิจกรรมจริง: กำลังบันทึก GPS หรือมีงานที่กำลังส่ง = "กำลังส่ง"
          // ไม่ใช่ค่า static ใน driver record (ที่ค้างเป็น available)
          effectiveStatus={
            rider?.status === 'off_duty'
              ? 'off_duty'
              : tracking.session || counts.in_transit > 0
                ? 'on_delivery'
                : rider?.status
          }
          onOpenProfile={() => setProfileOpen(true)}
        />
        {(activeRouteId || tracking.session) && (
          <div className="flex items-center gap-2 border-b bg-background px-3 py-2 text-xs">
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-full',
                tracking.session ? 'animate-pulse bg-success' : 'bg-muted-foreground',
              )}
            />
            <span className="min-w-0 flex-1 truncate">
              {tracking.session
                ? `${tracking.session.type === 'test' ? `Test${tracking.session.label ? ` · ${tracking.session.label}` : ''} · ` : ''}${
                    tracking.status === 'tracking'
                      ? tracking.isOwner
                        ? `กำลังส่ง GPS · ±${Math.round(tracking.location?.accuracy ?? 0)} ม.`
                        : `ติดตามจากอีกอุปกรณ์ · ±${Math.round(tracking.location?.accuracy ?? 0)} ม.`
                      : tracking.error || 'กำลังเปิด GPS…'
                  }`
                : 'ระบบจะเริ่มบันทึกเส้นทางเมื่อกดรับงาน'}
            </span>
            {/* บันทึกเริ่มอัตโนมัติตอนกดรับงาน — เหลือแค่ปุ่ม "จบ Route" ระหว่างบันทึก */}
            {tracking.session && tracking.isOwner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Test Route ไม่ผูกกับงานลูกค้า → จบได้เลยไม่ต้องถามเหตุผล
                  if (tracking.session?.type === 'test') {
                    void tracking.end();
                    return;
                  }
                  const openStops = myJobs.some(
                    (order) => !['delivered', 'failed', 'cancelled'].includes(order.status),
                  );
                  const reason = openStops
                    ? window.prompt('ยังมีงานค้าง กรุณาระบุเหตุผลที่จบ Route')?.trim()
                    : undefined;
                  if (openStops && !reason) return;
                  void tracking.end(reason);
                }}
              >
                จบ Route
              </Button>
            )}
          </div>
        )}
        {/* Test Route: ทดสอบ GPS/เส้นทางโดยไม่ต้องมีงานลูกค้า (เช่น ไปกินข้าว) */}
        {!tracking.session && !activeRouteId && (
          <div className="border-b bg-background px-3 py-2">
            <Button
              size="sm"
              variant="outline"
              className="w-full border-dashed text-muted-foreground"
              onClick={() => setTestDialogOpen(true)}
            >
              <MapIcon className="h-3.5 w-3.5" />
              เริ่ม Test Route (ทดสอบ GPS)
            </Button>
          </div>
        )}
        {rider && <RiderPushSetupBanner installed={install.installed} riderCode={rider.id} />}

        {/* toggle รายการ/แผนที่ — เฉพาะ tab งานใหม่ ที่ rider ดูเส้นทางก่อนออกงาน */}
        {activeTab === 'assigned' && tabJobs.length > 0 && (
          <div className="flex gap-1.5 border-b bg-background p-2">
            {(
              [
                { key: 'list', label: 'รายการ', icon: List },
                { key: 'map', label: 'แผนที่', icon: MapIcon },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setAssignedView(key);
                  // กดดู "แผนที่" จากแท็บ = เริ่มจากภาพรวมทั้ง Route เสมอ (ล้างโฟกัสจุดเดียว)
                  if (key === 'map') setMapFocusOrderId(null);
                }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors',
                  assignedView === key
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}

        {showAssignedMap || showTrackingMap ? (
          <div className="relative flex flex-1 flex-col">
            {showAssignedMap &&
              (focusOrder ? (
                /* โฟกัสปลายทางเดียว: บอกชัดว่ากำลังดูงานไหน + กลับไปดูทั้ง Route ได้ */
                <div className="flex items-center gap-2 border-b bg-info/5 px-3 py-2">
                  <MapPin className="h-4 w-4 shrink-0 text-info" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{focusOrder.customer.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {focusOrder.deliveryRoute
                        ? `${focusOrder.deliveryRoute.code} · จุดที่ ${focusOrder.deliveryRoute.sequence}`
                        : 'ปลายทางเดียว'}
                      {focusOrder.deliveryPlan?.plannedDate &&
                        ` · ${formatPlanningDate(focusOrder.deliveryPlan.plannedDate)}`}
                    </div>
                  </div>
                  {selectedGroup && selectedGroup.jobs.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setMapFocusOrderId(null)}
                    >
                      ดูทั้ง Route ({selectedGroup.jobs.length})
                    </Button>
                  )}
                </div>
              ) : mapGroups.length > 1 ? (
                /* หลาย Route/วันส่ง: ให้เลือกว่าจะดูรอบไหนบนแผนที่ */
                <div className="border-b bg-background px-3 py-2">
                  <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                    เลือกรอบที่จะดูบนแผนที่
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {mapGroups.map((group) => (
                      <button
                        key={group.key}
                        type="button"
                        onClick={() => setMapGroupKey(group.key)}
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                          group.key === selectedGroup?.key
                            ? 'border-info bg-info/10 text-info'
                            : 'border-border text-muted-foreground hover:bg-muted/50',
                        )}
                      >
                        <span>{group.date ? formatPlanningDate(group.date) : 'ไม่ระบุวัน'}</span>
                        {group.routeCode && <span className="opacity-70">· {group.routeCode}</span>}
                        <span className="opacity-70">({group.jobs.length})</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                selectedGroup && (
                  /* รอบเดียว: บอก context + วิธีดูปลายทางเดี่ยว */
                  <div className="flex items-center gap-2 border-b bg-background px-3 py-2 text-[11px] text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {selectedGroup.date ? formatPlanningDate(selectedGroup.date) : 'ไม่ระบุวัน'}
                      {selectedGroup.routeCode && ` · ${selectedGroup.routeCode}`} ·{' '}
                      {selectedGroup.jobs.length} จุด — แตะ “ดูแผนที่” ในการ์ดเพื่อดูทีละปลายทาง
                    </span>
                  </div>
                )
              ))}
            <div className="relative flex-1">
              {!suspendMap && (
                <RiderRouteMap
                  stops={routeStops}
                  nowMs={nowMs}
                  locationSource={showTrackingMap ? liveLocationSource : undefined}
                />
              )}
            </div>
            {showTrackingMap && activeDeliveryJob && (
              <div className="max-h-[46dvh] shrink-0 overflow-auto border-t bg-background p-3 pb-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-info" />
                  ปลายทางที่กำลังส่ง
                </div>
                <JobCard
                  order={activeDeliveryJob}
                  nowMs={nowMs}
                  onStart={() => undefined}
                  onClose={() => setCloseTargetId(activeDeliveryJob.id)}
                />
              </div>
            )}
          </div>
        ) : (
          /* job list */
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
                    order.deliveryPlan?.plannedDate !==
                      tabJobs[index - 1]?.deliveryPlan?.plannedDate;
                  return (
                    <div key={order.id}>
                      {showDate && order.deliveryPlan?.plannedDate && (
                        <div className="mb-2 mt-3 text-xs font-semibold text-muted-foreground first:mt-0">
                          งานวันที่{' '}
                          {new Date(
                            `${order.deliveryPlan.plannedDate}T00:00:00`,
                          ).toLocaleDateString('th-TH', { dateStyle: 'full' })}
                        </div>
                      )}
                      <JobCard
                        order={order}
                        nowMs={nowMs}
                        onStart={() => void handleStartJob(order)}
                        onClose={() => setCloseTargetId(order.id)}
                        onViewMap={
                          activeTab === 'assigned' ? () => handleViewOrderMap(order) : undefined
                        }
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
        )}

        <RiderTabBar activeTab={activeTab} counts={counts} onSelect={(tab) => setTab(tab)} />

        <TestRouteDialog
          open={testDialogOpen}
          onCancel={() => setTestDialogOpen(false)}
          onConfirm={(label) => {
            setTestDialogOpen(false);
            void tracking.startTest(label).then(() => setTab('in_transit'));
          }}
        />

        {rider && profileOpen && (
          <RiderProfileSheet
            rider={rider}
            install={install}
            onClose={() => setProfileOpen(false)}
            onExit={() => {
              void logoutRider().finally(() => {
                setAuthenticated(false);
                onExit?.();
              });
            }}
          />
        )}
      </div>

      <RiderCloseJobDialog
        open={!!closeTargetId}
        order={orders.find((order) => order.id === closeTargetId) ?? null}
        location={liveLocation}
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
