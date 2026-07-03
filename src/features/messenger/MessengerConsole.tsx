import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessengerCloseJobDialog } from '@/components/delivery/MessengerCloseJobDialog';
import { Button } from '@/components/ui/button';
import { useRetailStore } from '@/state/retailStore';
import { paymentLabel, statusLabel } from '@/data/mock';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  List,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageSquareText,
  Navigation,
  Package,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
import { MESSENGER_JOB_STATUSES, MESSENGER_TABS, type MessengerTab } from './messengerTabs';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useMessengerTab } from './hooks/useMessengerTab';
import {
  clearMessengerAppBadge,
  currentPermission,
  DEFAULT_MESSENGER_CODE,
  isPushSupported,
  subscribeToPush,
} from './push';
import { isNativePushSupported, registerNativePush } from './nativePush';
import { MessengerHeader } from './components/MessengerHeader';
import { JobCard } from './components/JobCard';
import {
  formatInTransitStartTime,
  getMessengerAppointmentCountdown,
  getMessengerJobOverdueMinutes,
  getMessengerJobScheduledAt,
} from './messengerSchedule';
import { formatElapsedDuration } from '@/lib/deliveryExecution';
import { MessengerTabBar } from './components/MessengerTabBar';
import { MessengerCompletedList } from './components/MessengerCompletedList';
import { MessengerProfileSheet } from './components/MessengerProfileSheet';
import { MessengerPushSetupBanner } from './components/MessengerPushSetupBanner';
import { MessengerRouteMap } from './components/MessengerRouteMap';
import { MessengerOrderMapPage } from './components/MessengerOrderMapPage';
import { useRouteStops } from './hooks/useRouteStops';
import { cn } from '@/lib/utils';
import type { Order } from '@/data/mock';
import {
  hasMessengerSession,
  isMessengerAuthError,
  logoutMessenger,
  MESSENGER_AUTH_EXPIRED_EVENT,
  type MessengerSession,
} from '@/lib/retailApi';
import { MessengerLogin } from './components/MessengerLogin';
import { TestRouteDialog } from './components/TestRouteDialog';
import { useMessengerTracking } from './hooks/useMessengerTracking';
import { useMessengerLocation } from './hooks/useMessengerLocation';
import { navigationUrl } from './geocode';
import { Badge } from '@/components/ui/badge';

const MESSENGER_STORAGE_KEY = 'movevai:messenger-code';

function InTransitJobSheet({
  order,
  nowMs,
  expanded,
  onExpandedChange,
  onClose,
}: {
  order: Order;
  nowMs: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
}) {
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';
  // เวลาเริ่มส่ง = ตัวเลขนิ่ง, เวลานัด = นับถอยหลัง — จงใจไม่โชว์นาฬิกาจับเวลาให้คนขับ
  const startedAtLabel = formatInTransitStartTime(order);
  const countdown = getMessengerAppointmentCountdown(order, nowMs);

  return (
    // ยก sheet ให้พ้น floating tab bar (ความสูง dock + pb-safe ของ dock + ช่องว่าง)
    <div className="absolute inset-x-0 bottom-0 z-[1100] px-3 pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.5rem)]">
      <div className="overflow-hidden rounded-2xl border bg-background/98 shadow-[0_-10px_28px_rgba(15,23,42,0.16)] backdrop-blur">
        <button
          type="button"
          className="w-full border-b px-4 pb-3 pt-2 text-left"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
        >
          <span className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-muted-foreground">
                ปลายทางที่กำลังส่ง
              </div>
              <div className="truncate text-sm font-semibold">{order.customer.name}</div>
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </button>

        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-medium">{order.code}</span>
                <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                  <Package className="h-3 w-3" /> พัสดุ
                </Badge>
                {isCod && (
                  <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                    <Banknote className="h-3 w-3" />
                    {paymentLabel[order.payment]}
                  </Badge>
                )}
              </div>
              {order.deliveryPlan?.plannedDate && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant="success" className="h-6 px-2 text-xs">
                    นัดส่ง {formatPlanningDate(order.deliveryPlan.plannedDate)}
                    {order.deliveryPlan.plannedTime
                      ? ` · ${order.deliveryPlan.plannedTime} น.`
                      : ''}
                  </Badge>
                </div>
              )}
              {(startedAtLabel || countdown) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                  {startedAtLabel && (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      เริ่มส่ง {startedAtLabel} น.
                    </span>
                  )}
                  {countdown && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-medium',
                        countdown.phase === 'before' ? 'text-info' : 'text-warning',
                      )}
                    >
                      {countdown.phase === 'before'
                        ? `อีก ${formatElapsedDuration(countdown.minutes)} ถึงเวลานัด`
                        : `เลยเวลานัด ${formatElapsedDuration(countdown.minutes)}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <Button asChild size="sm" variant="outline" className="flex-1 border-info/30 text-info">
              <a href={`tel:${order.customer.phone}`}>
                <Phone className="h-4 w-4" />
                โทร
              </a>
            </Button>
            <Button asChild size="sm" variant="outline" className="flex-1 border-info/30 text-info">
              <a
                href={navigationUrl(order.customer.address, order.customer.geo)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation className="h-4 w-4" />
                นำทาง
              </a>
            </Button>
            <Button size="sm" className="flex-1 bg-success hover:bg-success/90" onClick={onClose}>
              <CheckCircle2 className="h-4 w-4" />
              ปิดงาน
            </Button>
          </div>

          {expanded && (
            <div className="app-scroll mt-3 max-h-[34dvh] space-y-3 overflow-auto border-t pt-3">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{order.customer.address}</span>
              </div>
              {order.note && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                  <div className="flex items-start gap-2">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="text-xs font-medium">หมายเหตุ</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                        {order.note}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                อัปเดตระยะทางบนแผนที่ตาม GPS ปัจจุบัน ·{' '}
                {new Date(nowMs).toLocaleTimeString('th-TH', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                น.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function resolveMessengerCode() {
  const fromUrl = new URLSearchParams(window.location.search).get('messenger')?.trim();
  if (
    fromUrl &&
    import.meta.env.DEV &&
    import.meta.env.VITE_ALLOW_LEGACY_MESSENGER_QUERY === 'true'
  ) {
    localStorage.setItem(MESSENGER_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return localStorage.getItem(MESSENGER_STORAGE_KEY) || DEFAULT_MESSENGER_CODE;
}

export function MessengerConsolePage({ onExit }: { onExit?: () => void }) {
  const [authenticated, setAuthenticated] = useState(hasMessengerSession);
  const { orders, drivers, startDelivery, submitDelivery, refreshMessengerJobs } = useRetailStore();
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [assignedView, setAssignedView] = useState<'list' | 'map'>('list');
  const [deliverySheetExpanded, setDeliverySheetExpanded] = useState(false);
  // โฟกัสแผนที่ไปที่ปลายทางของงานเดียว (กดจากการ์ด) — null = ดูทั้ง Route ที่เลือก
  const [mapFocusOrderId, setMapFocusOrderId] = useState<string | null>(null);
  // กลุ่ม Route+วันส่งที่เลือกดูบนแผนที่ (null = ใช้กลุ่มแรก)
  const [mapGroupKey, setMapGroupKey] = useState<string | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [startingJobId, setStartingJobId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const install = useInstallPrompt();
  const { activeTab, mapOrderId, setTab, openOrderMap, backToPending } = useMessengerTab();
  const [messengerCode, setMessengerCode] = useState(resolveMessengerCode);
  const tracking = useMessengerTracking(authenticated);
  // ถ้า backend เริ่ม tracking session ไม่สำเร็จ ยังอ่าน GPS บนอุปกรณ์เพื่อแสดงแผนที่
  // และแนบพิกัดจริงตอนปิดงานได้ โดยไม่สร้างตำแหน่งจำลอง
  const fallbackLocation = useMessengerLocation(
    authenticated && activeTab === 'in_transit' && !tracking.session,
  );
  const autoOpenedSessionId = useRef<string | null>(null);
  const endingStaleSessionId = useRef<string | null>(null);
  const autoStartingTrackingRouteId = useRef<string | null>(null);

  const messenger = drivers.find((driver) => driver.id === messengerCode) ?? null;

  const myJobs = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.assignedDriverId === messengerCode && MESSENGER_JOB_STATUSES.includes(order.status),
      ),
    [orders, messengerCode],
  );

  const assignedOrderCount = myJobs.filter((o) => o.status === 'assigned').length;
  const inTransitOrderCount = myJobs.filter((o) => o.status === 'in_transit').length;
  const pendingConfirmationCount = myJobs.filter((o) => o.status === 'pending_confirmation').length;
  const deliveredOrderCount = myJobs.filter((o) => o.status === 'delivered').length;
  const hasTestTrackingSession = tracking.session?.type === 'test';
  const openCustomerJobCount = assignedOrderCount + inTransitOrderCount + pendingConfirmationCount;
  const effectiveMessengerStatus: NonNullable<typeof messenger>['status'] | undefined =
    messenger?.status === 'off_duty'
      ? 'off_duty'
      : inTransitOrderCount > 0 || hasTestTrackingSession
        ? 'on_delivery'
        : messenger
          ? 'available'
          : undefined;

  const counts: Record<MessengerTab, number> = {
    assigned: assignedOrderCount,
    // Test Route ไม่มี Order แต่ถือเป็นกิจกรรมที่กำลังส่งหนึ่งรายการใน UI
    in_transit: inTransitOrderCount + (hasTestTrackingSession ? 1 : 0),
    pending_confirmation: pendingConfirmationCount,
    delivered: deliveredOrderCount,
  };

  // auto-select เฉพาะตอน /messenger เปล่า (ยังไม่ได้เลือก tab) → เด้งไป tab แรกที่มีงาน
  // ใช้ replace เพื่อไม่ให้ /messenger ค้างใน history (back/forward ยังถูก)
  // ไม่เด้งตอน tab ปัจจุบันว่าง — ผู้ใช้ต้องกดดู tab ว่างได้ (เห็น empty state)
  useEffect(() => {
    if (activeTab !== null) return;
    const firstWithJobs = MESSENGER_TABS.find((tab) => counts[tab.key] > 0)?.key;
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
    void clearMessengerAppBadge();
  }, [activeTab]);

  // เมื่อพบ active session จาก backend (รวม session ที่เริ่มจาก Web/PWA อีกตัว)
  // เปิดหน้ากำลังส่งหนึ่งครั้ง แล้วปล่อยให้ messenger เปลี่ยนแท็บเองได้ตามปกติ
  useEffect(() => {
    if (!tracking.session || autoOpenedSessionId.current === tracking.session.id) return;
    if (tracking.session.type === 'delivery' && inTransitOrderCount === 0) return;
    autoOpenedSessionId.current = tracking.session.id;
    setTab('in_transit', { replace: true });
  }, [inTransitOrderCount, setTab, tracking.session]);

  // ถ้า route เหลือแต่รอตรวจสอบ/สำเร็จแล้ว ให้หยุด session GPS อัตโนมัติ
  // เพื่อไม่ให้ backend session ที่ยัง active ทำให้หน้า messenger ดูเหมือนกำลังส่งอยู่
  useEffect(() => {
    const session = tracking.session;
    if (
      !session ||
      session.type !== 'delivery' ||
      jobsLoading ||
      jobsError ||
      assignedOrderCount + inTransitOrderCount > 0 ||
      endingStaleSessionId.current === session.id
    ) {
      return;
    }

    endingStaleSessionId.current = session.id;
    void tracking.end('no_active_delivery_jobs').catch((error) => {
      endingStaleSessionId.current = null;
      if (isMessengerAuthError(error)) return;
      setJobsError(
        error instanceof Error
          ? `หยุด GPS ของ Route ที่จบแล้วไม่สำเร็จ — ${error.message}`
          : 'หยุด GPS ของ Route ที่จบแล้วไม่สำเร็จ',
      );
    });
  }, [assignedOrderCount, inTransitOrderCount, jobsError, jobsLoading, tracking]);

  // คง subscription ของเครื่องนี้ให้สดเมื่อเคยอนุญาต Push แล้ว
  // ใช้ได้ทั้ง PWA และ Desktop Web ที่เปิดผ่าน HTTPS/localhost
  useEffect(() => {
    if (!messenger || !isPushSupported() || currentPermission() !== 'granted') {
      return;
    }
    void subscribeToPush(messenger.id);
  }, [messenger]);

  // native (iOS/Android): ขอ permission + ผูก device token (APNs/FCM) กับคนขับ
  useEffect(() => {
    if (!messenger || !isNativePushSupported()) return;
    void registerNativePush(messenger.id);
  }, [messenger]);

  // เริ่มส่งงาน = จังหวะ messenger ออกไปส่งของจริง → ถ้ายังไม่ได้บันทึก Route ของรอบนี้
  // ให้ start tracking อัตโนมัติ เพื่อให้ "ทุกรอบถูกบันทึก" โดยไม่ต้องพึ่งความจำ messenger
  const handleStartJob = useCallback(
    async (order: Order) => {
      setStartingJobId(order.id);
      try {
        await startDelivery(order.id);
        const routeId = order.deliveryRoute?.id;
        if (routeId && !tracking.session) {
          // GPS/route start อาจล้มเหลว (สิทธิ์ตำแหน่ง/เครือข่าย) — ไม่ให้บล็อกการเริ่มส่งงาน
          try {
            await tracking.start(routeId);
          } catch (error) {
            if (isMessengerAuthError(error)) return;
            /* ปล่อยให้ messenger ส่งงานต่อได้ แม้บันทึกเส้นทางไม่เริ่ม */
          }
        }
        setTab('in_transit');
      } catch (error) {
        // เดิม fail เงียบ ๆ ทำให้ปุ่ม "นิ่ง" — แสดง toast บอกสาเหตุเสมอ
        if (isMessengerAuthError(error)) {
          toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          return;
        }
        const message = error instanceof Error ? error.message : 'เริ่มงานไม่สำเร็จ';
        setJobsError(message);
        toast.error(`รับงานไม่สำเร็จ — ${message}`);
      } finally {
        setStartingJobId(null);
      }
    },
    [setTab, startDelivery, tracking],
  );

  const refreshJobs = useCallback(
    async (background = false) => {
      // ยังไม่ได้ login (ไม่มี code จริง) — ไม่ต้องยิง fetch
      if (!messengerCode) {
        setJobsLoading(false);
        return;
      }
      if (!background) setJobsLoading(true);
      try {
        await refreshMessengerJobs(messengerCode);
        setJobsError(null);
      } catch (error) {
        if (isMessengerAuthError(error)) {
          setJobsError(null);
          setAuthenticated(false);
          return;
        }
        setJobsError(error instanceof Error ? error.message : 'โหลดข้อมูลงานไม่สำเร็จ');
      } finally {
        if (!background) setJobsLoading(false);
      }
    },
    [refreshMessengerJobs, messengerCode],
  );

  useEffect(() => {
    const onAuthExpired = () => {
      setAuthenticated(false);
      setJobsError(null);
      setJobsLoading(false);
      setCloseTargetId(null);
      setProfileOpen(false);
    };
    window.addEventListener(MESSENGER_AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(MESSENGER_AUTH_EXPIRED_EVENT, onAuthExpired);
  }, []);

  useEffect(() => {
    // อย่ายิง fetch ก่อน login — ตอนยังไม่มี bearer token backend จะตอบ
    // "Missing messenger bearer token" แล้ว error ค้างทับหน้าจอหลัง login เสร็จ
    if (!authenticated) return;

    void refreshJobs();

    const intervalId = window.setInterval(() => void refreshJobs(true), 15_000);
    const onFocus = () => void refreshJobs(true);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshJobs(true);
    };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (
        (event.data as { type?: string } | undefined)?.type === 'movevai:messenger-push-job-added'
      ) {
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
    (order) => getMessengerJobOverdueMinutes(order, nowMs) != null,
  ).length;

  const tabJobs = useMemo(
    () =>
      activeTab
        ? myJobs
            .filter((order) => order.status === activeTab)
            .sort((a, b) => {
              const aOverdue = getMessengerJobOverdueMinutes(a, nowMs) != null;
              const bOverdue = getMessengerJobOverdueMinutes(b, nowMs) != null;
              if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
              if (aOverdue && bOverdue) {
                return (getMessengerJobScheduledAt(a) ?? 0) - (getMessengerJobScheduledAt(b) ?? 0);
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
  const closingJobOpen = Boolean(closeTargetId);
  const showTrackingMap = activeTab === 'in_transit' && counts.in_transit > 0;
  // Leaflet ใช้ transform/GPU layers ซึ่งบน iOS Safari สามารถทะลุ fixed modal และ video ได้
  // เมื่อเปิด overlay ต้อง unmount map จริง ไม่ใช่แค่เพิ่ม z-index หรือซ่อนด้วย opacity
  const suspendMap = closingJobOpen || testDialogOpen || profileOpen;

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

  // หน้ากำลังส่งต้องแสดงเฉพาะจุดหมายของงานที่ messenger กำลังนำส่งอยู่ ไม่รวมงาน assigned
  // ที่ยังรอรับใน route เดียวกัน มิฉะนั้นผู้ใช้จะเห็นหลายจุดและไม่รู้ว่าต้องไปจุดไหนก่อน
  const activeDeliveryJob = myJobs
    .filter((order) => order.status === 'in_transit')
    .sort((a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0))[0];

  // กรณีเปิดแอปกลับมาตอนมีงานกำลังส่งอยู่แล้ว: แผนที่มือถืออ่าน GPS local ได้
  // แต่ถ้าไม่มี tracking session จะไม่ส่งตำแหน่งให้ admin. เริ่ม session ให้เองหนึ่งครั้งต่อ route.
  useEffect(() => {
    const routeId = activeDeliveryJob?.deliveryRoute?.id;
    const session = tracking.session;
    // session ของ delivery ที่ยัง active แต่ผูกกับ route อื่น (เช่น รอบเมื่อวานที่ยังไม่กดจบ)
    // ถือเป็น session ค้าง — ต้องเริ่ม/ยึด session ของ route ที่กำลังส่งจริง ไม่งั้น GPS ไม่ไปถึงแอดมิน
    const sessionForCurrentRoute = session?.type === 'delivery' && session.routeId === routeId;
    const sessionForStaleRoute = session?.type === 'delivery' && session.routeId !== routeId;
    const shouldStartOrClaimTracking =
      !session ||
      sessionForStaleRoute ||
      (sessionForCurrentRoute && !tracking.isOwner && !tracking.location);
    if (
      !authenticated ||
      !tracking.activeSessionChecked ||
      !routeId ||
      !shouldStartOrClaimTracking ||
      jobsLoading ||
      jobsError ||
      autoStartingTrackingRouteId.current === routeId
    ) {
      return;
    }

    autoStartingTrackingRouteId.current = routeId;
    void tracking.start(routeId, fallbackLocation.location).catch((error) => {
      autoStartingTrackingRouteId.current = null;
      if (isMessengerAuthError(error)) return;
      toast.error(
        `เริ่มส่ง GPS ให้แอดมินไม่สำเร็จ — ${
          error instanceof Error ? error.message : 'กรุณาลองเปิดแอปใหม่'
        }`,
      );
    });
  }, [
    activeDeliveryJob?.deliveryRoute?.id,
    authenticated,
    fallbackLocation.location,
    jobsError,
    jobsLoading,
    tracking,
  ]);

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
  const activeRouteId = myJobs.find((order) => order.status === 'assigned' && order.deliveryRoute)
    ?.deliveryRoute?.id;
  const mapOrder = mapOrderId ? (myJobs.find((order) => order.id === mapOrderId) ?? null) : null;

  if (!authenticated) {
    return (
      <MessengerLogin
        onLogin={(session: MessengerSession) => {
          setMessengerCode(session.rider.code);
          setAuthenticated(true);
        }}
      />
    );
  }

  if (mapOrderId) {
    return <MessengerOrderMapPage order={mapOrder} orderId={mapOrderId} onBack={backToPending} />;
  }

  return (
    <div className="flex min-h-dvh w-full justify-center bg-muted/40">
      {/* surface เต็มจอ mobile-first — บน desktop จำกัดความกว้างให้เหมือนมือถือ */}
      <div className="relative flex h-dvh max-h-dvh w-full max-w-md flex-col overflow-hidden bg-background shadow-xs">
        <MessengerHeader
          messenger={messenger}
          // สถานะ badge ต้องตามกิจกรรมจริงเท่านั้น ไม่เชื่อค่า static ใน driver record
          // (ที่ค้างได้ทั้งเป็น available ทั้งที่กำลังส่ง และค้างเป็น on_delivery ทั้งที่ส่งเสร็จแล้ว):
          //  - off_duty = messenger กดหยุดเอง → คงไว้
          //  - กำลังบันทึก GPS หรือมีงานสถานะ in_transit → "กำลังส่ง"
          //  - นอกนั้น (มีแต่งาน assigned/รอตรวจ/เสร็จ) → "ว่าง"
          effectiveStatus={effectiveMessengerStatus}
          activeOrders={openCustomerJobCount}
          onOpenProfile={() => setProfileOpen(true)}
        />
        {hasTestTrackingSession && tracking.session && (
          <div className="flex items-center gap-2 border-b bg-background px-3 py-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span className="min-w-0 flex-1 truncate">
              Test Route{tracking.session.label ? ` · ${tracking.session.label}` : ''}
            </span>
            {tracking.isOwner && (
              <Button size="sm" variant="outline" onClick={() => void tracking.end()}>
                หยุดทดสอบ
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
        {messenger && (
          <MessengerPushSetupBanner installed={install.installed} messengerCode={messenger.id} />
        )}

        {/* toggle รายการ/แผนที่ — เฉพาะ tab งานใหม่ ที่ messenger ดูเส้นทางก่อนออกงาน */}
        {activeTab === 'assigned' && tabJobs.length > 0 && (
          <div className="border-b border-border/50 bg-background p-2">
            <div className="flex gap-1 rounded-full bg-muted/60 p-1">
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
                    'flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-xs font-medium transition-all',
                    assignedView === key
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {showAssignedMap || showTrackingMap ? (
          <div className="relative flex min-h-0 flex-1 flex-col">
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
            <div className="relative min-h-0 flex-1">
              {!suspendMap && (
                <MessengerRouteMap
                  stops={routeStops}
                  nowMs={nowMs}
                  locationSource={showTrackingMap ? liveLocationSource : undefined}
                  showRemainingDistance={showTrackingMap}
                />
              )}
            </div>
            {showTrackingMap && activeDeliveryJob && !closingJobOpen && !profileOpen && (
              <InTransitJobSheet
                order={activeDeliveryJob}
                nowMs={nowMs}
                expanded={deliverySheetExpanded}
                onExpandedChange={setDeliverySheetExpanded}
                onClose={() => setCloseTargetId(activeDeliveryJob.id)}
              />
            )}
          </div>
        ) : (
          /* job list — padding ล่างเผื่อ floating tab bar ให้การ์ดสุดท้ายเลื่อนพ้น dock */
          <div className="app-scroll min-h-0 flex-1 space-y-2.5 overflow-auto p-3 pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+5.5rem)]">
            {jobsLoading && myJobs.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดงานจาก Route…
              </div>
            )}
            {jobsError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
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
              <div className="rounded-xl border border-warning/20 bg-warning/5 p-3 text-sm font-medium text-warning">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  มี {overdueCount} งานถึงเวลารับแล้ว
                </div>
              </div>
            )}
            {activeTab === 'in_transit' && counts.assigned > 0 && (
              <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-warning">
                  <ClipboardList className="h-4 w-4" />
                  มีงานใหม่รอรับ {counts.assigned} งาน
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full rounded-full border-warning/25 bg-background text-warning hover:bg-warning/10"
                  onClick={() => setTab('assigned')}
                >
                  ไปกดรับงาน
                </Button>
              </div>
            )}
            {!jobsLoading && activeTab === 'delivered' && messenger ? (
              // tab สำเร็จ: ดึงรายการที่ส่งสำเร็จจาก backend โดยตรง (privacy-minimal, ไม่มี PII ลูกค้า)
              <MessengerCompletedList messengerCode={messenger.id} />
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
                        starting={startingJobId === order.id}
                        onStart={() => void handleStartJob(order)}
                        onClose={() => setCloseTargetId(order.id)}
                        onViewMap={
                          activeTab === 'assigned'
                            ? () => handleViewOrderMap(order)
                            : activeTab === 'pending_confirmation'
                              ? () => openOrderMap(order.id)
                              : undefined
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

        <MessengerTabBar activeTab={activeTab} counts={counts} onSelect={(tab) => setTab(tab)} />

        <TestRouteDialog
          open={testDialogOpen}
          onCancel={() => setTestDialogOpen(false)}
          onConfirm={(label) => {
            setTestDialogOpen(false);
            void tracking.startTest(label).then(() => setTab('in_transit'));
          }}
        />

        {messenger && profileOpen && (
          <MessengerProfileSheet
            messenger={messenger}
            effectiveStatus={effectiveMessengerStatus}
            activeOrders={openCustomerJobCount}
            install={install}
            onClose={() => setProfileOpen(false)}
            onUpdated={() => {
              if (messengerCode) void refreshMessengerJobs(messengerCode);
            }}
            onExit={() => {
              void logoutMessenger().finally(() => {
                setAuthenticated(false);
                onExit?.();
              });
            }}
          />
        )}
      </div>

      <MessengerCloseJobDialog
        open={!!closeTargetId}
        order={orders.find((order) => order.id === closeTargetId) ?? null}
        location={liveLocation}
        editorRole="messenger"
        onCancel={() => setCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!closeTargetId) return;
          const submittedOrderId = closeTargetId;
          const nextInTransitJob = myJobs.find(
            (order) => order.id !== submittedOrderId && order.status === 'in_transit',
          );
          const shouldStopTracking =
            tracking.session?.type === 'delivery' &&
            tracking.isOwner &&
            !myJobs.some(
              (order) =>
                order.id !== submittedOrderId && ['assigned', 'in_transit'].includes(order.status),
            );
          await submitDelivery(submittedOrderId, input);
          if (!nextInTransitJob) {
            setDeliverySheetExpanded(false);
            setTab('pending_confirmation', { replace: true });
          }
          if (shouldStopTracking) {
            try {
              await tracking.end();
            } catch (error) {
              if (isMessengerAuthError(error)) return;
              setJobsError(
                error instanceof Error
                  ? `ปิดงานสำเร็จ แต่หยุด GPS ไม่สำเร็จ — ${error.message}`
                  : 'ปิดงานสำเร็จ แต่หยุด GPS ไม่สำเร็จ',
              );
            }
          }
          setCloseTargetId(null);
        }}
      />
    </div>
  );
}
