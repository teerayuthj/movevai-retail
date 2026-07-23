import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MessengerCloseJobDialog } from '@/components/delivery/MessengerCloseJobDialog';
import { Button } from '@/components/ui/button';
import { useRetailStore } from '@/state/retailStore';
import { paymentLabel, statusLabel } from '@/data/orderTypes';
import {
  AlertCircle,
  Banknote,
  CalendarClock,
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
  Users,
} from 'lucide-react';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
import { shortRouteCode } from '@/lib/routeCode';
import { MESSENGER_JOB_STATUSES, MESSENGER_TABS, type MessengerTab } from './messengerTabs';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useMessengerTab } from './hooks/useMessengerTab';
import { useSwipeTabTransition } from './hooks/useSwipeTabTransition';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { clearMessengerAppBadge, DEFAULT_MESSENGER_CODE } from './push';
import { isNativePushSupported, registerNativePush } from './nativePush';
import { MessengerHeader } from './components/MessengerHeader';
import { JobCard } from './components/JobCard';
import { MessengerTripCard } from './components/MessengerTripCard';
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
import {
  getMessengerOrderRole,
  isMessengerOrderParticipant,
  isMessengerPlannedPreview,
  type MessengerOrderRole,
} from '@/lib/messengerJobs';
import type { Order } from '@/data/orderTypes';
import {
  hasMessengerSession,
  isMessengerAuthError,
  logoutMessenger,
  MESSENGER_AUTH_EXPIRED_EVENT,
  refreshMessengerSession,
  type MessengerSession,
} from '@/lib/retailApi';
import { MessengerLogin } from './components/MessengerLogin';
import { useMessengerTracking } from './hooks/useMessengerTracking';
import { useMessengerLocation } from './hooks/useMessengerLocation';
import { useMessengerPresence } from './hooks/useMessengerPresence';
import { navigationUrl } from './geocode';
import { Badge } from '@/components/ui/badge';
import {
  groupMessengerTrips,
  isMessengerCustomerJob,
  isMultiStopMessengerTrip,
  type MessengerTrip,
} from './messengerTrips';

const MESSENGER_STORAGE_KEY = 'movevai:messenger-code';

function InTransitJobSheet({
  order,
  relatedOrders,
  nowMs,
  expanded,
  onExpandedChange,
  onClose,
  role = 'main',
}: {
  order: Order;
  relatedOrders: Order[];
  nowMs: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClose: () => void;
  /** co (คนขับร่วม) เห็นข้อมูลงานได้แต่ยืนยันส่งมอบไม่ได้ — คนขับหลักเป็นคนปิดงาน */
  role?: MessengerOrderRole;
}) {
  const isCoDriver = role === 'co';
  const trip = groupMessengerTrips(relatedOrders).find((item) =>
    item.orders.some((candidate) => candidate.id === order.id),
  );
  const tripOrders = trip?.orders ?? [order];
  const currentSequenceIndex = tripOrders.findIndex((candidate) => candidate.id === order.id);
  const completedStops = tripOrders.filter((candidate) =>
    ['pending_confirmation', 'delivered'].includes(candidate.status),
  ).length;
  const routeLeg = order.metadataJson?.dispatch?.routeLeg ?? 'dropoff';
  const isPickupStop = routeLeg === 'pickup';
  const remainingStops = tripOrders.filter(
    (candidate) =>
      candidate.id !== order.id &&
      candidate.status === 'in_transit' &&
      (candidate.deliveryRoute?.sequence ?? 0) > (order.deliveryRoute?.sequence ?? 0),
  );
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';
  const nextStop = remainingStops[0];
  const currentActionLabel = isPickupStop ? 'กำลังไปจุดรับ' : 'กำลังไปจุดส่ง';
  const currentActionDescription = isPickupStop ? 'รับพัสดุ' : 'ส่งมอบพัสดุ';
  const completionLabel = isPickupStop ? 'รับของแล้ว' : 'ยืนยันส่งมอบ';
  // เวลาเริ่มส่ง = ตัวเลขนิ่ง, เวลานัด = นับถอยหลัง — จงใจไม่โชว์นาฬิกาจับเวลาให้คนขับ
  const startedAtLabel = formatInTransitStartTime(order);
  const countdown = getMessengerAppointmentCountdown(order, nowMs);
  const appointmentTime = order.deliveryPlan?.appointmentTime;
  // เลยเวลานัด = ส้ม (เตือน), ยังไม่ถึง = ฟ้า (ปกติ) — ให้ตรงกับกล่องนัดส่งใน JobCard
  const apptTone: 'info' | 'warning' = countdown?.phase === 'after' ? 'warning' : 'info';
  const apptToneText = apptTone === 'warning' ? 'text-warning' : 'text-info';
  const apptToneSurface =
    apptTone === 'warning' ? 'border-warning/30 bg-warning/10' : 'border-info/30 bg-info/10';

  return (
    // ยก sheet ให้พ้น floating tab bar (ความสูง dock + pb-safe ของ dock + ช่องว่าง)
    <div className="absolute inset-x-0 bottom-0 z-[1100] px-3 pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.5rem)]">
      <div className="overflow-hidden rounded-2xl border bg-background/98 shadow-[0_-10px_28px_rgba(15,23,42,0.16)] backdrop-blur">
        <button
          type="button"
          className="w-full border-b px-4 pb-3 pt-2 text-left"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'ซ่อนรายละเอียดงาน' : 'ดูรายละเอียดงาน'}
        >
          <span className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    isPickupStop ? 'bg-info' : 'bg-success',
                  )}
                />
                <span className="truncate">
                  {trip?.title ?? 'เที่ยวปัจจุบัน'} · จุด {currentSequenceIndex + 1}/
                  {tripOrders.length}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    isPickupStop ? 'bg-info/10 text-info' : 'bg-success/10 text-success',
                  )}
                >
                  {currentActionDescription}
                </span>
                <span className="truncate text-sm font-semibold">{order.customer.name}</span>
              </div>
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        </button>

        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white',
                isPickupStop ? 'bg-info' : 'bg-success',
              )}
            >
              {currentSequenceIndex + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[11px] font-semibold',
                  isPickupStop ? 'text-info' : 'text-success',
                )}
              >
                {currentActionLabel}
              </p>
              <h2 className="mt-0.5 truncate text-base font-semibold">{order.customer.name}</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {order.customer.address}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              <Package className="h-3 w-3" /> {order.orderNo}
            </Badge>
            {isCod && (
              <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                <Banknote className="h-3 w-3" />
                {paymentLabel[order.payment]}
              </Badge>
            )}
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              เสร็จ {completedStops}/{tripOrders.length} จุด
            </Badge>
          </div>

          {order.deliveryPlan?.appointmentDate && (
            <div
              className={cn(
                'mt-3 flex items-center gap-2 rounded-xl border px-3 py-2',
                apptToneSurface,
              )}
            >
              <CalendarClock className={cn('h-4 w-4 shrink-0', apptToneText)} />
              <span
                className={cn('min-w-0 flex-1 truncate text-[13px] font-semibold', apptToneText)}
              >
                {countdown
                  ? countdown.phase === 'before'
                    ? `อีก ${formatElapsedDuration(countdown.minutes)} ถึงเวลานัด`
                    : `เลยเวลานัด ${formatElapsedDuration(countdown.minutes)}`
                  : formatPlanningDate(order.deliveryPlan.appointmentDate)}
              </span>
              <span className={cn('shrink-0 text-[13px] font-semibold', apptToneText)}>
                {appointmentTime ? `นัด ${appointmentTime} น.` : 'ไม่ระบุเวลา'}
              </span>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
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
          </div>
          {!isCoDriver && (
            <Button
              className={cn(
                'mt-2 w-full',
                isPickupStop ? 'bg-info hover:bg-info/90' : 'bg-success hover:bg-success/90',
              )}
              onClick={onClose}
            >
              <CheckCircle2 className="h-4 w-4" />
              {completionLabel}
            </Button>
          )}

          {isCoDriver && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-[12px] text-info">
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                คุณร่วมส่งงานนี้ — นำโดย{' '}
                <span className="font-semibold">
                  {order.assignedDriverName ?? order.assignedDriverId}
                </span>{' '}
                ซึ่งเป็นคนยืนยันส่งมอบ
              </span>
            </div>
          )}

          {expanded && (
            <div className="app-scroll mt-3 max-h-[34dvh] space-y-3 overflow-auto border-t pt-3">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-muted-foreground">รายละเอียดงาน</span>
                {startedAtLabel && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock3 className="h-3 w-3" /> เริ่มส่ง {startedAtLabel} น.
                  </span>
                )}
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-medium text-foreground">ที่อยู่เต็ม</div>
                  <div className="mt-0.5">{order.customer.address}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-3 text-xs">
                <div>
                  <div className="text-[10px] text-muted-foreground">ผู้ติดต่อ</div>
                  <div className="mt-0.5 truncate font-medium">{order.customer.name}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">โทรศัพท์</div>
                  <a
                    href={`tel:${order.customer.phone}`}
                    className="mt-0.5 block font-medium text-info"
                  >
                    {order.customer.phone}
                  </a>
                </div>
              </div>
              {order.note && (
                <div className="text-warning">
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
              {remainingStops.length > 0 && (
                <div className="border-t pt-3">
                  <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                    เส้นทางที่เหลือ
                  </div>
                  <div className="space-y-2">
                    {remainingStops.map((candidate) => (
                      <div key={candidate.id} className="flex items-start gap-2 text-xs">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {candidate.deliveryRoute?.sequence ?? '-'}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {candidate.metadataJson?.dispatch?.routeLeg === 'pickup' ? 'รับ' : 'ส่ง'}{' '}
                          · {candidate.customer.name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nextStop && (
                <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/5 px-3 py-2 text-xs">
                  <span className="font-medium text-success">ถัดไปในงานนี้</span>
                  <span className="truncate font-semibold">
                    {nextStop.metadataJson?.dispatch?.routeLeg === 'pickup' ? 'รับ' : 'ส่ง'} ·{' '}
                    {nextStop.customer.name.replace(/^(รับ|ส่ง)\s*[—–-]\s*/u, '').trim()}
                  </span>
                </div>
              )}
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
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const {
    orders,
    drivers,
    acceptDeliveryJob,
    acceptDeliveryTrip,
    startDelivery,
    startDeliveryTrip,
    submitDelivery,
    refreshMessengerJobs,
  } = useRetailStore();
  const [closeTargetId, setCloseTargetId] = useState<string | null>(null);
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
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);
  const [startingTripKey, setStartingTripKey] = useState<string | null>(null);
  const [acceptingTripKey, setAcceptingTripKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now);
  const install = useInstallPrompt();
  const { activeTab, mapOrderId, setTab, openOrderMap, backToPending } = useMessengerTab();
  const [messengerCode, setMessengerCode] = useState(resolveMessengerCode);
  const tracking = useMessengerTracking(authenticated);
  useMessengerPresence(authenticated);
  // ถ้า backend เริ่ม tracking session ไม่สำเร็จ ยังอ่าน GPS บนอุปกรณ์เพื่อแสดงแผนที่
  // และแนบพิกัดจริงตอนส่งมอบได้ โดยไม่สร้างตำแหน่งจำลอง
  // เปิดทั้งแท็บกำลังส่งและแผนที่ในแท็บงานใหม่ — สองที่นี้ใช้ location source ร่วมกัน
  const fallbackLocation = useMessengerLocation(
    authenticated &&
      !tracking.session &&
      (activeTab === 'in_transit' || (activeTab === 'assigned' && assignedView === 'map')),
  );
  const autoOpenedSessionId = useRef<string | null>(null);
  const endingStaleSessionId = useRef<string | null>(null);
  const autoStartingTrackingRouteId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const hadAccessToken = hasMessengerSession();
    void refreshMessengerSession()
      .then((session) => {
        if (!active) return;
        setMessengerCode(session.rider.code);
        setAuthenticated(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // เครือข่ายล่มไม่ควรทำให้คนขับหลุดจากระบบ ถ้ายังมี access token ในเครื่อง
        setAuthenticated(hadAccessToken && !isMessengerAuthError(error));
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const resetSessionUi = useCallback(() => {
    setCloseTargetId(null);
    setProfileOpen(false);
    setAssignedView('list');
    setDeliverySheetExpanded(false);
    setMapFocusOrderId(null);
    setMapGroupKey(null);
    setJobsError(null);
    setStartingJobId(null);
    setAcceptingJobId(null);
    setStartingTripKey(null);
    setAcceptingTripKey(null);
  }, []);

  const handleSelectTab = useCallback(
    (tab: MessengerTab) => {
      setProfileOpen(false);
      setCloseTargetId(null);
      setTab(tab);
    },
    [setTab],
  );

  const messenger = drivers.find((driver) => driver.id === messengerCode) ?? null;
  const messengerId = messenger?.id;

  const myJobs = useMemo(
    () =>
      orders.filter(
        (order) =>
          (isMessengerOrderParticipant(order, messengerCode) &&
            MESSENGER_JOB_STATUSES.includes(order.status)) ||
          isMessengerPlannedPreview(order, messengerCode),
      ),
    [orders, messengerCode],
  );

  // นับ "งาน" ที่ผู้ใช้เห็น (header/แท็บ/แจ้งเตือน) เป็นงานส่งลูกค้า ไม่รวม leg รับ ให้ตรงกับฝั่ง admin
  // ส่วน inTransitOrderCount (ทุก leg) ยังใช้ตัดสินสถานะ "กำลังส่ง" เพราะรับของก็คือกำลังวิ่งงาน
  const customerJobs = useMemo(() => myJobs.filter(isMessengerCustomerJob), [myJobs]);
  // นับทุก leg (รวมจุดรับ) — ใช้คุมสถานะ/หยุด GPS ของ session ที่จบแล้ว ไม่ใช่ตัวเลขที่โชว์ผู้ใช้
  const assignedOrderCount = myJobs.filter((o) => o.status === 'assigned').length;
  const inTransitOrderCount = myJobs.filter((o) => o.status === 'in_transit').length;
  const assignedJobCount = customerJobs.filter((o) => o.status === 'assigned').length;
  const inTransitJobCount = customerJobs.filter((o) => o.status === 'in_transit').length;
  const pendingConfirmationCount = customerJobs.filter(
    (o) => o.status === 'pending_confirmation',
  ).length;
  // จุดรับที่ยืนยันแล้วเป็น checkpoint ภายในเที่ยว ไม่ใช่งานรอ CS ปิดแยกใบ
  const pendingReviewItemCount = customerJobs.filter(
    (o) => o.status === 'pending_confirmation',
  ).length;
  const deliveredOrderCount = customerJobs.filter((o) => o.status === 'delivered').length;
  const myTrips = useMemo(() => groupMessengerTrips(myJobs), [myJobs]);
  const assignedTripCount = myTrips.filter((trip) =>
    trip.orders.some(
      (order) => order.status === 'assigned' || isMessengerPlannedPreview(order, messengerCode),
    ),
  ).length;
  const inTransitTripCount = myTrips.filter((trip) =>
    trip.orders.some((order) => order.status === 'in_transit'),
  ).length;
  const hasTestTrackingSession = tracking.session?.type === 'test';
  const openCustomerJobCount = assignedJobCount + inTransitJobCount + pendingConfirmationCount;
  // "กำลังส่ง" เฉพาะตอนมีงาน in_transit จริงหรือกำลังบันทึก GPS ทดสอบ —
  // งานที่แค่ assigned/รอตรวจสอบยังถือว่า "ว่าง" (สอดคล้อง deriveDriverDisplayStatus ฝั่ง admin)
  const effectiveMessengerStatus: NonNullable<typeof messenger>['status'] | undefined =
    messenger?.status === 'off_duty'
      ? 'off_duty'
      : inTransitOrderCount > 0 || hasTestTrackingSession
        ? 'on_delivery'
        : messenger
          ? 'available'
          : undefined;

  const counts: Record<MessengerTab, number> = {
    assigned: assignedTripCount,
    // Test Route ไม่มี Order แต่ถือเป็นกิจกรรมที่กำลังส่งหนึ่งรายการใน UI
    in_transit: inTransitTripCount + (hasTestTrackingSession ? 1 : 0),
    pending_confirmation: pendingReviewItemCount,
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

  // native (iOS/Android): ขอ permission + ผูก device token (APNs/FCM) กับคนขับ
  // ใช้ id เป็น dependency เพื่อไม่ register ใหม่ทุกครั้งที่ polling แทน driver object
  useEffect(() => {
    if (!messengerId || !isNativePushSupported()) return;
    void registerNativePush(messengerId);
  }, [messengerId]);

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
        const message = error instanceof Error ? error.message : 'เริ่มส่งไม่สำเร็จ';
        setJobsError(message);
        toast.error(`เริ่มส่งไม่สำเร็จ — ${message}`);
      } finally {
        setStartingJobId(null);
      }
    },
    [setTab, startDelivery, tracking],
  );

  const handleAcceptJob = useCallback(
    async (order: Order) => {
      setAcceptingJobId(order.id);
      try {
        await acceptDeliveryJob(order.id);
        if (order.deliveryRoute?.startPolicy === 'accept_starts') {
          const routeId = order.deliveryRoute.id;
          if (!tracking.session) {
            try {
              await tracking.start(routeId);
            } catch (error) {
              if (isMessengerAuthError(error)) return;
            }
          }
          setTab('in_transit');
          toast.success('รับงานและเริ่ม GPS Tracking แล้ว');
        } else {
          toast.success('รับงานแล้ว — กดเริ่มงานเมื่อพร้อมออกเดินทาง');
        }
      } catch (error) {
        if (isMessengerAuthError(error)) {
          toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          return;
        }
        const message = error instanceof Error ? error.message : 'รับงานไม่สำเร็จ';
        setJobsError(message);
        toast.error(`รับงานไม่สำเร็จ — ${message}`);
      } finally {
        setAcceptingJobId(null);
      }
    },
    [acceptDeliveryJob, setTab, tracking],
  );

  const handleStartTrip = useCallback(
    async (trip: MessengerTrip) => {
      const first = trip.orders[0];
      if (!trip.routeId) {
        await handleStartJob(first);
        return;
      }
      setStartingTripKey(trip.key);
      try {
        await startDeliveryTrip(trip.routeId);
        if (!tracking.session) {
          try {
            await tracking.start(trip.routeId);
          } catch (error) {
            if (isMessengerAuthError(error)) return;
          }
        }
        setTab('in_transit');
        toast.success(`เริ่มเที่ยว “${trip.title}” แล้ว · ${trip.orders.length} จุด`);
      } catch (error) {
        if (isMessengerAuthError(error)) {
          toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          return;
        }
        const message = error instanceof Error ? error.message : 'เริ่มเที่ยวไม่สำเร็จ';
        setJobsError(message);
        toast.error(`เริ่มเที่ยวไม่สำเร็จ — ${message}`);
      } finally {
        setStartingTripKey(null);
      }
    },
    [handleStartJob, setTab, startDeliveryTrip, tracking],
  );

  const handleAcceptTrip = useCallback(
    async (trip: MessengerTrip) => {
      const first = trip.orders[0];
      if (!trip.routeId) {
        await handleAcceptJob(first);
        return;
      }
      setAcceptingTripKey(trip.key);
      try {
        await acceptDeliveryTrip(trip.routeId);
        if (first.deliveryRoute?.startPolicy === 'accept_starts') {
          if (!tracking.session) {
            try {
              await tracking.start(trip.routeId);
            } catch (error) {
              if (isMessengerAuthError(error)) return;
            }
          }
          setTab('in_transit');
          toast.success(`รับและเริ่มเที่ยว “${trip.title}” แล้ว`);
        } else {
          toast.success(`รับเที่ยว “${trip.title}” แล้ว — กดเริ่มเที่ยวเมื่อพร้อม`);
        }
      } catch (error) {
        if (isMessengerAuthError(error)) {
          toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          return;
        }
        const message = error instanceof Error ? error.message : 'รับเที่ยวไม่สำเร็จ';
        setJobsError(message);
        toast.error(`รับเที่ยวไม่สำเร็จ — ${message}`);
      } finally {
        setAcceptingTripKey(null);
      }
    },
    [acceptDeliveryTrip, handleAcceptJob, setTab, tracking],
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
      resetSessionUi();
      setAuthenticated(false);
      setJobsLoading(false);
      setTab('assigned', { replace: true });
    };
    window.addEventListener(MESSENGER_AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(MESSENGER_AUTH_EXPIRED_EVENT, onAuthExpired);
  }, [resetSessionUi, setTab]);

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

  // แจ้งเตือน "งานถึงเวลาเริ่มส่ง" นับเป็นงานส่ง (ไม่รวม leg รับ) ให้ตรงกับ count งานทั้งระบบ
  const overdueCount = customerJobs.filter(
    (order) => getMessengerJobOverdueMinutes(order, nowMs) != null,
  ).length;

  const tabJobs = useMemo(
    () =>
      activeTab
        ? myJobs
            .filter(
              (order) =>
                (order.status === activeTab &&
                  !(activeTab === 'pending_confirmation' && !isMessengerCustomerJob(order))) ||
                (activeTab === 'assigned' && isMessengerPlannedPreview(order, messengerCode)),
            )
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
    [activeTab, messengerCode, myJobs, nowMs],
  );
  const tabTrips = useMemo(() => groupMessengerTrips(tabJobs), [tabJobs]);

  const showAssignedMap = activeTab === 'assigned' && assignedView === 'map';
  const closingJobOpen = Boolean(closeTargetId);
  const showTrackingMap = activeTab === 'in_transit' && counts.in_transit > 0;
  // Leaflet ใช้ transform/GPU layers ซึ่งบน iOS Safari สามารถทะลุ fixed modal และ video ได้
  // เมื่อเปิด overlay ต้อง unmount map จริง ไม่ใช่แค่เพิ่ม z-index หรือซ่อนด้วย opacity
  const suspendMap = closingJobOpen || profileOpen;
  // ปัดซ้าย/ขวาเปลี่ยนแท็บได้เฉพาะตอนดูรายการ (ปิดตอนอยู่บนแผนที่ ไม่งั้นชนกับ pan/drag ของ Leaflet
  // หรือตอนมี dialog/sheet เปิดทับอยู่)
  const swipeTabEnabled = Boolean(activeTab) && !showAssignedMap && !showTrackingMap && !suspendMap;
  const swipeContainerRef = useSwipeTabTransition(activeTab, handleSelectTab, swipeTabEnabled);

  // ดึงลงเพื่อรีเฟรชงาน (แบบ social app) — เฉพาะตอนดูรายการ ไม่ใช่แผนที่
  const handlePullRefresh = useCallback(async () => {
    // หน่วงขั้นต่ำเพื่อให้ spinner ไม่กระพริบหายเร็วเกินไป
    await Promise.all([refreshJobs(true), new Promise((resolve) => setTimeout(resolve, 500))]);
  }, [refreshJobs]);
  const pullToRefresh = usePullToRefresh<HTMLDivElement>({
    onRefresh: handlePullRefresh,
    disabled: showAssignedMap || showTrackingMap,
  });

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
  const activeRouteJobs = activeDeliveryJob
    ? myJobs
        .filter(
          (order) =>
            order.status === 'in_transit' &&
            (activeDeliveryJob.deliveryRoute?.id
              ? order.deliveryRoute?.id === activeDeliveryJob.deliveryRoute.id
              : order.id === activeDeliveryJob.id),
        )
        .sort((a, b) => (a.deliveryRoute?.sequence ?? 0) - (b.deliveryRoute?.sequence ?? 0))
    : [];

  // กรณีเปิดแอปกลับมาตอนมีงานกำลังส่งอยู่แล้ว: แผนที่มือถืออ่าน GPS local ได้
  // แต่ถ้าไม่มี tracking session จะไม่ส่งตำแหน่งให้ admin. เริ่ม session ให้เองหนึ่งครั้งต่อ route.
  // คนขับร่วมห้ามเริ่ม/ยึด session ของ route — GPS เส้นหลักต้องมาจากคนขับหลักเท่านั้น
  const activeDeliveryRole = activeDeliveryJob
    ? getMessengerOrderRole(activeDeliveryJob, messengerCode)
    : null;

  useEffect(() => {
    const routeId = activeDeliveryJob?.deliveryRoute?.id;
    if (activeDeliveryRole === 'co') return;
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
    activeDeliveryRole,
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
      ? activeRouteJobs
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

  // จุดรับเป็น checkpoint เบา ๆ: คนขับกดครั้งเดียวแล้วระบบเลื่อนไปจุดส่งที่ผูกไว้
  // GPS แนบได้เมื่อมี แต่ไม่ใช้เป็นเงื่อนไขบล็อกการบันทึก
  const handlePickupCheckpoint = useCallback(
    async (order: Order) => {
      try {
        await submitDelivery(order.id, {
          photoCount: 0,
          photos: [],
          signatureCaptured: false,
          otpVerified: false,
          editorRole: 'messenger',
          location: liveLocation
            ? {
                lat: liveLocation.lat,
                lng: liveLocation.lng,
                label:
                  liveLocation.accuracy != null
                    ? `พิกัด GPS ขณะรับของ (±${Math.round(liveLocation.accuracy)} ม.)`
                    : 'พิกัด GPS ขณะรับของ',
              }
            : undefined,
        });
        setDeliverySheetExpanded(false);
        setTab('in_transit', { replace: true });
        toast.success('บันทึกรับของแล้ว — ไปยังจุดส่งถัดไป');
      } catch (error) {
        if (isMessengerAuthError(error)) {
          toast.error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
          return;
        }
        const message = error instanceof Error ? error.message : 'บันทึกรับของไม่สำเร็จ';
        setJobsError(message);
        toast.error(`บันทึกรับของไม่สำเร็จ — ${message}`);
      }
    },
    [liveLocation, setTab, submitDelivery],
  );

  const handleViewOrderMap = useCallback((order: Order) => {
    setMapFocusOrderId(order.id);
    setMapGroupKey(groupKeyOf(order));
    setAssignedView('map');
  }, []);
  const handleViewTripMap = useCallback((order: Order) => {
    setMapFocusOrderId(null);
    setMapGroupKey(groupKeyOf(order));
    setAssignedView('map');
  }, []);
  const mapOrder = mapOrderId ? (myJobs.find((order) => order.id === mapOrderId) ?? null) : null;

  if (authChecking) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          กำลังตรวจสอบเครื่องนี้
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <MessengerLogin
        onLogin={(session: MessengerSession) => {
          resetSessionUi();
          setMessengerCode(session.rider.code);
          setTab('assigned', { replace: true });
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

        <div
          ref={swipeContainerRef}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {showAssignedMap || showTrackingMap ? (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {showAssignedMap &&
                (focusOrder ? (
                  /* โฟกัสปลายทางเดียว: บอกชัดว่ากำลังดูงานไหน + กลับไปดูทั้ง Route ได้ */
                  <div className="flex items-center gap-2 border-b bg-info/5 px-3 py-2">
                    <MapPin className="h-4 w-4 shrink-0 text-info" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {focusOrder.customer.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {focusOrder.deliveryRoute
                          ? `รอบ ${shortRouteCode(focusOrder.deliveryRoute.code)} · จุดที่ ${focusOrder.deliveryRoute.sequence}`
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
                          {group.routeCode && (
                            <span className="opacity-70">
                              · รอบ {shortRouteCode(group.routeCode)}
                            </span>
                          )}
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
                        {selectedGroup.routeCode &&
                          ` · รอบ ${shortRouteCode(selectedGroup.routeCode)}`}{' '}
                        · {selectedGroup.jobs.length} จุด — แตะ “ดูแผนที่” ในการ์ดเพื่อดูทีละปลายทาง
                      </span>
                    </div>
                  )
                ))}
              <div className="relative min-h-0 flex-1">
                {!suspendMap && (
                  <MessengerRouteMap
                    stops={routeStops}
                    nowMs={nowMs}
                    // แผนที่งานใหม่ใช้ stream เดียวกับหน้ากำลังส่ง — ถ้ามี tracking session
                    // จะได้ตำแหน่งจาก session (รวม GPS จากเครื่องที่เริ่ม Route) แทนการเปิด
                    // watchPosition ของตัวเองซ้ำซึ่งเจอ permission denied ได้ทั้งที่ session มีตำแหน่งอยู่แล้ว
                    locationSource={liveLocationSource}
                    // แท็บงานใหม่ก็ต้องเห็นเส้นทางตามถนน + ระยะ กม. แบบเดียวกับหน้ากำลังส่ง
                    showRemainingDistance
                  />
                )}
              </div>
              {showTrackingMap && activeDeliveryJob && !closingJobOpen && !profileOpen && (
                <InTransitJobSheet
                  order={activeDeliveryJob}
                  relatedOrders={myJobs}
                  nowMs={nowMs}
                  role={getMessengerOrderRole(activeDeliveryJob, messengerCode) ?? 'main'}
                  expanded={deliverySheetExpanded}
                  onExpandedChange={setDeliverySheetExpanded}
                  onClose={() => {
                    if (activeDeliveryJob.metadataJson?.dispatch?.routeLeg === 'pickup') {
                      void handlePickupCheckpoint(activeDeliveryJob);
                      return;
                    }
                    setCloseTargetId(activeDeliveryJob.id);
                  }}
                />
              )}
            </div>
          ) : (
            /* job list — padding ล่างเผื่อ floating tab bar ให้การ์ดสุดท้ายเลื่อนพ้น dock */
            <div
              ref={pullToRefresh.scrollRef}
              className="app-scroll min-h-0 flex-1 space-y-2.5 overflow-auto p-3 pb-[calc(max(env(safe-area-inset-bottom),0.75rem)+5.5rem)]"
            >
              {/* pull-to-refresh: ตัวหมุนโผล่บนสุดตามระยะที่ดึงลง */}
              <div
                className="flex items-center justify-center overflow-hidden text-muted-foreground"
                style={{
                  height: pullToRefresh.refreshing
                    ? pullToRefresh.threshold
                    : pullToRefresh.distance,
                  transition: pullToRefresh.dragging ? 'none' : 'height 200ms ease-out',
                }}
              >
                <Loader2
                  className={cn(
                    'h-5 w-5',
                    (pullToRefresh.refreshing ||
                      pullToRefresh.distance >= pullToRefresh.threshold) &&
                      'animate-spin',
                  )}
                  style={{
                    opacity: pullToRefresh.refreshing
                      ? 1
                      : Math.min(1, pullToRefresh.distance / pullToRefresh.threshold),
                    transform: pullToRefresh.refreshing
                      ? undefined
                      : `rotate(${pullToRefresh.distance * 3}deg)`,
                  }}
                />
              </div>
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
                    มี {overdueCount} งานถึงเวลาเริ่มส่งแล้ว
                  </div>
                </div>
              )}
              {activeTab === 'in_transit' && counts.assigned > 0 && (
                <div className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-warning">
                    <ClipboardList className="h-4 w-4" />
                    มีงานใหม่รอเริ่มส่ง {counts.assigned} งาน
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full rounded-full border-warning/25 bg-background text-warning hover:bg-warning/10"
                    onClick={() => setTab('assigned')}
                  >
                    ไปเริ่มส่งงาน
                  </Button>
                </div>
              )}
              {!jobsLoading && activeTab === 'delivered' && messenger ? (
                // tab สำเร็จ: ดึงรายการที่ส่งสำเร็จจาก backend โดยตรง (privacy-minimal, ไม่มี PII ลูกค้า)
                <MessengerCompletedList messengerCode={messenger.id} />
              ) : (
                <>
                  {activeTab === 'assigned'
                    ? tabTrips.map((trip, index) => {
                        const first = trip.orders[0];
                        const showDate =
                          first.deliveryPlan?.plannedDate !==
                          tabTrips[index - 1]?.orders[0]?.deliveryPlan?.plannedDate;
                        return (
                          <div key={trip.key}>
                            {showDate && first.deliveryPlan?.plannedDate && (
                              <div className="mb-2 mt-3 text-xs font-semibold text-muted-foreground first:mt-0">
                                เที่ยววันที่{' '}
                                {new Date(
                                  `${first.deliveryPlan.plannedDate}T00:00:00`,
                                ).toLocaleDateString('th-TH', { dateStyle: 'full' })}
                              </div>
                            )}
                            {isMessengerPlannedPreview(first, messengerCode) ||
                            isMultiStopMessengerTrip(trip) ? (
                              <MessengerTripCard
                                trip={trip}
                                nowMs={nowMs}
                                role={getMessengerOrderRole(first, messengerCode) ?? 'main'}
                                starting={startingTripKey === trip.key}
                                accepting={acceptingTripKey === trip.key}
                                onAccept={() => void handleAcceptTrip(trip)}
                                onStart={() => void handleStartTrip(trip)}
                                onViewMap={() => handleViewTripMap(first)}
                              />
                            ) : (
                              <JobCard
                                order={first}
                                relatedOrders={myJobs}
                                nowMs={nowMs}
                                role={getMessengerOrderRole(first, messengerCode) ?? 'main'}
                                starting={startingJobId === first.id}
                                accepting={acceptingJobId === first.id}
                                onAccept={() => void handleAcceptJob(first)}
                                onStart={() => void handleStartJob(first)}
                                onClose={() => setCloseTargetId(first.id)}
                                onViewMap={() => handleViewOrderMap(first)}
                              />
                            )}
                          </div>
                        );
                      })
                    : tabJobs.map((order) => (
                        <JobCard
                          key={order.id}
                          order={order}
                          relatedOrders={myJobs}
                          nowMs={nowMs}
                          role={getMessengerOrderRole(order, messengerCode) ?? 'main'}
                          starting={startingJobId === order.id}
                          accepting={acceptingJobId === order.id}
                          onAccept={() => void handleAcceptJob(order)}
                          onStart={() => void handleStartJob(order)}
                          onClose={() => setCloseTargetId(order.id)}
                          onViewMap={
                            activeTab === 'pending_confirmation'
                              ? () => openOrderMap(order.id)
                              : undefined
                          }
                        />
                      ))}
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
        </div>

        <MessengerTabBar activeTab={activeTab} counts={counts} onSelect={handleSelectTab} />

        {messenger && profileOpen && (
          <MessengerProfileSheet
            messenger={messenger}
            effectiveStatus={effectiveMessengerStatus}
            activeOrders={openCustomerJobCount}
            onClose={() => setProfileOpen(false)}
            onUpdated={() => {
              if (messengerCode) void refreshMessengerJobs(messengerCode);
            }}
            onExit={() => {
              void logoutMessenger().finally(() => {
                resetSessionUi();
                setAuthenticated(false);
                setJobsLoading(false);
                setTab('assigned', { replace: true });
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
          const submittedOrder = orders.find((order) => order.id === submittedOrderId) ?? null;
          const isPickupCheckpoint = submittedOrder?.metadataJson?.dispatch?.routeLeg === 'pickup';
          const shouldStopTracking =
            tracking.session?.type === 'delivery' &&
            tracking.isOwner &&
            !myJobs.some(
              (order) =>
                order.id !== submittedOrderId && ['assigned', 'in_transit'].includes(order.status),
            );
          await submitDelivery(submittedOrderId, input);
          // อย่าอิง myJobs ก่อน submit เพื่อเลือกแท็บ เพราะ iOS อาจยังถือ snapshot
          // in_transit เดิมอยู่ชั่วคราว ทำให้ผู้ใช้ค้างที่หน้า “กำลังส่ง” หลังบันทึกสำเร็จ
          // จุดรับที่บันทึกแล้วต้องพาไปยัง stop ถัดไปในเที่ยว; ส่วนจุดส่งเข้าสู่รอตรวจสอบ
          setCloseTargetId(null);
          setDeliverySheetExpanded(false);
          setTab(isPickupCheckpoint ? 'in_transit' : 'pending_confirmation', { replace: true });
          if (shouldStopTracking) {
            try {
              await tracking.end();
            } catch (error) {
              if (isMessengerAuthError(error)) return;
              setJobsError(
                error instanceof Error
                  ? `ส่งตรวจสอบสำเร็จ แต่หยุด GPS ไม่สำเร็จ — ${error.message}`
                  : 'ส่งตรวจสอบสำเร็จ แต่หยุด GPS ไม่สำเร็จ',
              );
            }
          }
        }}
      />
    </div>
  );
}
