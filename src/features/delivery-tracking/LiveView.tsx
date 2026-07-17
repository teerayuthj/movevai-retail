import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Order } from '@/data/orderTypes';
import { getAssignedOrderOverdueMinutes } from '@/lib/deliveryPlanning';
import { getInTransitElapsedMinutes } from '@/lib/deliveryExecution';
import {
  fetchAppOrder,
  fetchDeliveryTrackingCounts,
  fetchDeliveryTrackingOrders,
  type DeliveryTrackingCounts,
} from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  Loader2,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Truck,
  Undo2,
} from 'lucide-react';
import { TrackingCard } from './components/TrackingCard';
import { TrackingRouteCard } from './components/TrackingRouteCard';
import { TrackingDetailDrawer } from './components/TrackingDetailDrawer';
import type { TrackingView } from './utils/trackingSearch';
import { FleetMap } from './components/FleetMap';

type TrackingChip = {
  view: TrackingView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count: number;
};

const PAGE_SIZE = 20;
const EMPTY_COUNTS: DeliveryTrackingCounts = {
  all_open: 0,
  planned: 0,
  awaiting_acceptance: 0,
  overdue: 0,
  in_transit: 0,
  pending: 0,
  returning: 0,
  closed: 0,
};

/**
 * หน้าดูสถานะจัดส่งแบบอ่านอย่างเดียว สำหรับคนในทีมที่ไม่ใช่ CS/admin
 * ใช้ข้อมูลและ component ชุดเดียวกับหน้า "ติดตามการจัดส่ง" แต่ตัด action ที่แก้ข้อมูลออกทั้งหมด
 * (ไม่มีปิดงาน/ตีกลับ/ดึงงานกลับ/แก้หลักฐาน) — ห้ามเพิ่ม mutation ในหน้านี้
 * เพื่อให้อนาคตผูกเป็นหน้า default ของ role "viewer" ได้โดยไม่ต้อง audit ซ้ำ
 */
export function LiveViewPage() {
  const { orders, drivers } = useRetailStore();
  const [view, setView] = useState<TrackingView>('all_open');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [trackingOrders, setTrackingOrders] = useState<Order[]>([]);
  const [trackingCounts, setTrackingCounts] = useState<DeliveryTrackingCounts>(EMPTY_COUNTS);
  const [trackingTotal, setTrackingTotal] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [mapFocusVersion, setMapFocusVersion] = useState(0);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  // order id ที่โหลดรายละเอียดสำเร็จแล้ว — ใช้แยก "เปิดใหม่" (โชว์ loading) ออกจาก "รีเฟรชเบื้องหลัง" (อัปเดตเงียบ)
  const loadedDetailIdRef = useRef<string | null>(null);

  const selectedOrder =
    (selectedOrderDetail?.id === selectedOrderId ? selectedOrderDetail : null) ??
    trackingOrders.find((order) => order.id === selectedOrderId) ??
    orders.find((order) => order.id === selectedOrderId) ??
    null;
  const selectedDriver =
    drivers.find((driver) => driver.id === selectedOrder?.assignedDriverId) ?? null;

  const totalPages = Math.max(1, Math.ceil(trackingTotal / PAGE_SIZE));

  // นำเสนอเป็น "เที่ยว" เหมือนหน้าติดตามหลัก — งานที่ไม่มี Route แสดงเดี่ยว
  const trackingListGroups = useMemo(() => {
    const groups = new Map<string, Order[]>();
    for (const order of trackingOrders) {
      const key = order.deliveryRoute?.id ? `route:${order.deliveryRoute.id}` : `order:${order.id}`;
      const current = groups.get(key);
      if (current) current.push(order);
      else groups.set(key, [order]);
    }
    return [...groups.values()];
  }, [trackingOrders]);
  const routeGroupsOnPage = trackingListGroups.filter(
    (group) => group[0]?.deliveryRoute?.id,
  ).length;
  const selectedRouteOrders = useMemo(() => {
    if (!selectedOrder) return [];
    const group = trackingListGroups.find((ordersInGroup) =>
      ordersInGroup.some((order) => order.id === selectedOrder.id),
    );
    if (!group) return [selectedOrder];
    return group.map((order) => (order.id === selectedOrder.id ? selectedOrder : order));
  }, [selectedOrder, trackingListGroups]);

  function openLiveRoute(order: Order) {
    setSelectedOrderId(order.id);
    setMapFocusVersion((current) => current + 1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const minuteId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    const refreshId = window.setInterval(() => setRefreshKey((current) => current + 1), 30_000);
    return () => {
      window.clearInterval(minuteId);
      window.clearInterval(refreshId);
    };
  }, []);

  useEffect(() => {
    const requestId = ++listRequestId.current;
    setIsListLoading(true);
    setLoadError(null);

    void fetchDeliveryTrackingOrders({
      tab: view,
      query: debouncedQuery,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    })
      .then((result) => {
        if (requestId !== listRequestId.current) return;
        setTrackingOrders(result.orders);
        setTrackingTotal(result.total);
      })
      .catch((error: unknown) => {
        if (requestId !== listRequestId.current) return;
        setLoadError(error instanceof Error ? error.message : 'โหลดรายการติดตามไม่สำเร็จ');
      })
      .finally(() => {
        if (requestId === listRequestId.current) setIsListLoading(false);
      });
  }, [view, debouncedQuery, page, refreshKey]);

  useEffect(() => {
    void fetchDeliveryTrackingCounts()
      // รองรับ server เวอร์ชันเก่าระหว่าง rollout ที่ยังไม่มี key `planned`
      .then((counts) => setTrackingCounts({ ...EMPTY_COUNTS, ...counts }))
      .catch(() => undefined);
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrderDetail(null);
      setIsDetailLoading(false);
      loadedDetailIdRef.current = null;
      return;
    }
    const requestId = ++detailRequestId.current;
    const isInitialLoad = loadedDetailIdRef.current !== selectedOrderId;
    if (isInitialLoad) setIsDetailLoading(true);
    void fetchAppOrder(selectedOrderId)
      .then((order) => {
        if (requestId !== detailRequestId.current) return;
        setSelectedOrderDetail(order);
        loadedDetailIdRef.current = selectedOrderId;
      })
      .catch(() => {
        if (requestId !== detailRequestId.current) return;
        if (isInitialLoad) setSelectedOrderDetail(null);
      })
      .finally(() => {
        if (requestId === detailRequestId.current && isInitialLoad) setIsDetailLoading(false);
      });
  }, [selectedOrderId, refreshKey]);

  function changeView(next: TrackingView) {
    setView(next);
    setPage(1);
    setSelectedOrderId(null);
  }

  const tabs: TrackingChip[] = [
    {
      view: 'all_open',
      label: 'งานยังไม่ปิด',
      icon: ClipboardList,
      count: trackingCounts.all_open,
    },
    { view: 'planned', label: 'แผนล่วงหน้า', icon: Clock3, count: trackingCounts.planned },
    { view: 'overdue', label: 'เลยกำหนด', icon: AlertCircle, count: trackingCounts.overdue },
    {
      view: 'awaiting_acceptance',
      label: 'รอคนขับรับ',
      icon: Truck,
      count: trackingCounts.awaiting_acceptance,
    },
    { view: 'in_transit', label: 'กำลังจัดส่ง', icon: Truck, count: trackingCounts.in_transit },
    { view: 'pending', label: 'รอยืนยัน', icon: CheckCircle2, count: trackingCounts.pending },
    { view: 'returning', label: 'ส่งกลับ', icon: Undo2, count: trackingCounts.returning },
    { view: 'closed', label: 'ปิดล่าสุด', icon: PackageCheck, count: trackingCounts.closed },
  ];
  const currentTabLabel = tabs.find((tab) => tab.view === view)?.label ?? 'งานยังไม่ปิด';

  return (
    // full-bleed map-first: หักล้าง padding ของ <main> แล้วกินความสูงที่เหลือใต้ topbar (h-14) พอดีจอ
    <div className="relative -m-4 h-[calc(100dvh-3.5rem)] overflow-hidden sm:-m-6">
      <FleetMap
        focusOrder={selectedOrder}
        onFocusOrder={setSelectedOrderId}
        focusVersion={mapFocusVersion}
      />

      {/* แถบบนลอยเหนือแผนที่ — chip สถานะ + ป้ายบอกว่าเป็นโหมดดูอย่างเดียว */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-2xl border bg-background/90 p-1 shadow-sm backdrop-blur">
          {tabs.map((tab) => {
            const active = view === tab.view;
            const Icon = tab.icon;
            const overdueTone = tab.view === 'overdue' && tab.count > 0;
            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => changeView(tab.view)}
                className={cn(
                  'flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors',
                  active
                    ? overdueTone
                      ? 'bg-destructive text-destructive-foreground'
                      : 'bg-foreground text-background'
                    : cn(
                        'text-muted-foreground hover:bg-muted hover:text-foreground',
                        overdueTone && 'text-destructive',
                      ),
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                    active ? 'bg-background/25' : 'bg-muted',
                  )}
                >
                  {tab.count.toLocaleString('th-TH')}
                </span>
              </button>
            );
          })}
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 rounded-xl border bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur sm:flex">
          <Eye className="h-3.5 w-3.5" />
          โหมดดูอย่างเดียว
        </div>
      </div>

      {/* panel รายการงานลอยซ้าย — ย่อเก็บได้เพื่อดูแผนที่เต็มตา */}
      {!isPanelOpen && (
        <Button
          variant="outline"
          className="absolute left-3 top-[3.75rem] z-10 bg-background/95 shadow-lg backdrop-blur"
          onClick={() => setIsPanelOpen(true)}
        >
          <PanelLeftOpen className="h-4 w-4" />
          รายการงาน
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums">
            {trackingTotal.toLocaleString('th-TH')}
          </span>
        </Button>
      )}
      {isPanelOpen && (
        <section
          aria-label="รายการงานติดตาม"
          className="absolute bottom-3 left-3 top-[3.75rem] z-10 flex w-[min(380px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur"
        >
          <div className="flex flex-col gap-2 border-b px-3 pb-3 pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">
                {currentTabLabel}
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  {trackingTotal.toLocaleString('th-TH')} จุด
                  {routeGroupsOnPage > 0 && ` · ${routeGroupsOnPage} เที่ยวในหน้านี้`}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsPanelOpen(false)}
                aria-label="ย่อรายการงาน"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหา Route, order, ลูกค้า, เบอร์โทร, คนขับ..."
                className="h-9 rounded-lg pl-9"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              ดูสถานะและตำแหน่งการจัดส่งแบบสด — หน้านี้ดูได้อย่างเดียว จัดการงานได้ที่หน้า
              ติดตามการจัดส่ง
            </div>
          </div>

          <div className="relative flex-1 space-y-2 overflow-y-auto p-2 [scrollbar-gutter:stable]">
            {trackingListGroups.map((group) => {
              const first = group[0];
              const isRoute = Boolean(first.deliveryRoute?.id);
              if (isRoute) {
                return (
                  <TrackingRouteCard
                    key={first.deliveryRoute!.id}
                    orders={group}
                    selectedOrderId={selectedOrderId}
                    onSelectStop={(order) => setSelectedOrderId(order.id)}
                    onViewLive={openLiveRoute}
                    nowMs={nowMs}
                  />
                );
              }
              return (
                <TrackingCard
                  key={first.id}
                  order={first}
                  selected={selectedOrderId === first.id}
                  onSelect={() => setSelectedOrderId(first.id)}
                  overdueMinutes={getAssignedOrderOverdueMinutes(first, nowMs)}
                  inTransitMinutes={getInTransitElapsedMinutes(first, nowMs)}
                  nowMs={nowMs}
                />
              );
            })}

            {!isListLoading && !loadError && trackingOrders.length === 0 && (
              <div className="py-16 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
                {view === 'closed'
                  ? 'ยังไม่มีงานที่ปิดใน 24 ชั่วโมงล่าสุด'
                  : 'ไม่มีรายการในสถานะนี้'}
              </div>
            )}

            {isListLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {loadError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-xs text-destructive">
                <AlertCircle className="mx-auto mb-2 h-4 w-4" />
                <div>{loadError}</div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setRefreshKey((current) => current + 1)}
                >
                  ลองใหม่
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              {trackingTotal === 0
                ? '0 รายการ'
                : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, trackingTotal)} จาก ${trackingTotal.toLocaleString('th-TH')}`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1 || isListLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="หน้าก่อนหน้า"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-16 text-center tabular-nums">
                {page}/{totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages || isListLoading}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                aria-label="หน้าถัดไป"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      )}

      <TrackingDetailDrawer
        order={selectedOrder}
        driver={selectedDriver}
        drivers={drivers}
        routeOrders={selectedRouteOrders}
        isDetailLoading={isDetailLoading}
        onClose={() => setSelectedOrderId(null)}
        onSelectStop={(order) => setSelectedOrderId(order.id)}
        nowMs={nowMs}
      />
    </div>
  );
}
