import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderTimeline } from '@/components/OrderTimeline';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { RiderCloseJobDialog } from '@/components/delivery/RiderCloseJobDialog';
import {
  DriverSummary,
  EmptyState,
  OrderSummary,
  ProofOfDeliveryInfo,
  QueueOrderCard,
  ResolutionInfo,
} from '@/components/delivery/DeliveryExecutionShared';
import {
  type FailNextAction,
  type FailReason,
  failNextActionLabel,
  failReasonLabel,
  statusLabel,
} from '@/data/mock';
import {
  deliveryTrackingTabLabels,
  requiresDeliveryReview,
  type DeliveryTrackingTab,
} from '@/lib/deliveryExecution';
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
  Loader2,
  PackageCheck,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';

const PAGE_SIZE = 20;
const EMPTY_COUNTS: DeliveryTrackingCounts = {
  in_transit: 0,
  pending: 0,
  returning: 0,
  closed: 0,
};

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

type DeliveryTrackingPageProps = {
  locationSearch: string;
  onOpenQueue: (search?: string) => void;
};

function parseTrackingSearch(locationSearch: string) {
  const params = new URLSearchParams(locationSearch);
  const tab = params.get('tab');
  const orderId = params.get('order');

  return {
    tab:
      tab === 'in_transit' || tab === 'pending' || tab === 'returning' || tab === 'closed'
        ? (tab as DeliveryTrackingTab)
        : null,
    orderId: orderId || null,
  };
}

function buildQueueSearch(orderId?: string) {
  const params = new URLSearchParams({ tab: 'assigned' });
  if (orderId) params.set('order', orderId);
  return `?${params.toString()}`;
}

export function DeliveryTrackingPage({ locationSearch, onOpenQueue }: DeliveryTrackingPageProps) {
  const { orders, drivers, submitDelivery, confirmDelivery, failDelivery, markReturned } =
    useRetailStore();
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [riderCloseTargetId, setRiderCloseTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [trackingOrders, setTrackingOrders] = useState<typeof orders>([]);
  const [trackingCounts, setTrackingCounts] = useState<DeliveryTrackingCounts>(EMPTY_COUNTS);
  const [trackingTotal, setTrackingTotal] = useState(0);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<(typeof orders)[number] | null>(
    null,
  );
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const parsedSearch = useMemo(() => parseTrackingSearch(locationSearch), [locationSearch]);

  const [activeTab, setActiveTab] = useState<DeliveryTrackingTab>(parsedSearch.tab ?? 'in_transit');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(parsedSearch.orderId);

  const selectedOrder =
    (selectedOrderDetail?.id === selectedOrderId ? selectedOrderDetail : null) ??
    trackingOrders.find((order) => order.id === selectedOrderId) ??
    orders.find((order) => order.id === selectedOrderId) ??
    null;
  const selectedDriver =
    drivers.find((driver) => driver.id === selectedOrder?.assignedDriverId) ?? null;

  const totalPages = Math.max(1, Math.ceil(trackingTotal / PAGE_SIZE));

  useEffect(() => {
    if (parsedSearch.tab) {
      setActiveTab(parsedSearch.tab);
    }
  }, [parsedSearch.tab]);

  useEffect(() => {
    if (parsedSearch.orderId) {
      setSelectedOrderId(parsedSearch.orderId);
    }
  }, [parsedSearch.orderId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const requestId = ++listRequestId.current;
    setIsListLoading(true);
    setLoadError(null);
    void fetchDeliveryTrackingOrders({
      tab: activeTab,
      query: debouncedQuery,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    })
      .then((result) => {
        if (requestId !== listRequestId.current) return;
        setTrackingOrders(result.orders);
        setTrackingTotal(result.total);
        setSelectedOrderId((current) =>
          current &&
          (result.orders.some((order) => order.id === current) || current === parsedSearch.orderId)
            ? current
            : null,
        );
      })
      .catch((error: unknown) => {
        if (requestId !== listRequestId.current) return;
        setLoadError(error instanceof Error ? error.message : 'โหลดรายการติดตามไม่สำเร็จ');
      })
      .finally(() => {
        if (requestId === listRequestId.current) setIsListLoading(false);
      });
  }, [activeTab, debouncedQuery, page, parsedSearch.orderId, refreshKey]);

  useEffect(() => {
    void fetchDeliveryTrackingCounts()
      .then(setTrackingCounts)
      .catch(() => undefined);
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedOrderDetail(null);
      return;
    }
    const requestId = ++detailRequestId.current;
    setIsDetailLoading(true);
    void fetchAppOrder(selectedOrderId)
      .then((order) => {
        if (requestId === detailRequestId.current) setSelectedOrderDetail(order);
      })
      .catch(() => {
        if (requestId === detailRequestId.current) setSelectedOrderDetail(null);
      })
      .finally(() => {
        if (requestId === detailRequestId.current) setIsDetailLoading(false);
      });
  }, [selectedOrderId, refreshKey]);

  function changeTab(tab: DeliveryTrackingTab) {
    setActiveTab(tab);
    setPage(1);
    setSelectedOrderId(null);
  }

  function refreshTracking() {
    setRefreshKey((current) => current + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ติดตามการจัดส่ง</h1>
          <p className="text-sm text-muted-foreground">
            ติดตามงานที่กำลังวิ่ง ส่งกลับ และงานที่ปิดแล้ว โดยใช้สถานะจริงจาก workflow เดิม
          </p>
        </div>
      </div>

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${selectedOrder?.id === failTargetId ? selectedOrder.code : (orders.find((order) => order.id === failTargetId)?.code ?? '')} — เลือกเหตุผลและขั้นตอนต่อไป`
            : undefined
        }
        reasons={FAIL_REASONS}
        actions={{
          label: 'ขั้นตอนต่อไป',
          options: FAIL_ACTIONS,
          defaultValue: 'retry',
          helpText: (value) =>
            value === 'retry'
              ? 'ออเดอร์จะกลับเป็นสถานะมอบหมาย คนขับเดิมรับไปส่งใหม่'
              : value === 'return'
                ? 'ออเดอร์จะถูกย้ายไปแท็บส่งกลับ รอรับคืนเข้าสาขา'
                : 'ปิดงานเป็นส่งไม่สำเร็จ — ภายหลังยังกดส่งกลับสาขาได้',
        }}
        confirmLabel="บันทึก"
        onCancel={() => setFailTargetId(null)}
        onConfirm={({ reason, note, action }) => {
          if (!failTargetId || !action) return;

          failDelivery(failTargetId, {
            reason,
            nextAction: action,
            note,
          });

          if (action === 'retry') {
            onOpenQueue(buildQueueSearch(failTargetId));
            return;
          }

          setSelectedOrderId(failTargetId);
          setActiveTab(action === 'return' ? 'returning' : 'closed');
          setFailTargetId(null);
        }}
      />

      <RiderCloseJobDialog
        open={!!riderCloseTargetId}
        order={
          selectedOrder?.id === riderCloseTargetId
            ? selectedOrder
            : (orders.find((order) => order.id === riderCloseTargetId) ?? null)
        }
        onCancel={() => setRiderCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!riderCloseTargetId) return;
          const target =
            selectedOrder?.id === riderCloseTargetId
              ? selectedOrder
              : orders.find((order) => order.id === riderCloseTargetId);
          await submitDelivery(riderCloseTargetId, input);
          setSelectedOrderId(riderCloseTargetId);
          // งานเสี่ยงสูง → ไปแท็บรอยืนยัน, งานทั่วไป → ปิดเลยไปแท็บปิดงาน
          setActiveTab(target && requiresDeliveryReview(target) ? 'pending' : 'closed');
          setRiderCloseTargetId(null);
          refreshTracking();
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px_380px]">
        <Card className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <div className="space-y-3">
              <CardTitle className="text-sm">รายการติดตาม</CardTitle>
              <div className="flex flex-col gap-3">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => changeTab(value as DeliveryTrackingTab)}
                  className="w-full"
                >
                  <div className="w-full">
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-2xl bg-muted/70 p-1.5">
                      {(Object.keys(deliveryTrackingTabLabels) as DeliveryTrackingTab[]).map(
                        (tab) => (
                          <TabsTrigger
                            key={tab}
                            value={tab}
                            className="h-10 shrink-0 gap-2 rounded-xl px-3.5 text-sm text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                          >
                            <span>{deliveryTrackingTabLabels[tab]}</span>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/80 px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                              {trackingCounts[tab].toLocaleString('th-TH')}
                            </span>
                          </TabsTrigger>
                        ),
                      )}
                    </TabsList>
                  </div>
                </Tabs>
                <div className="relative w-full max-w-xl">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ค้นหา order, ลูกค้า, เบอร์โทร, คนขับ..."
                    className="h-10 rounded-xl pl-9"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="tracking-list-scroll relative flex-1 space-y-2 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            {trackingOrders.map((order) => (
              <QueueOrderCard
                key={order.id}
                order={order}
                selected={selectedOrderId === order.id}
                onClick={() => setSelectedOrderId(order.id)}
                statusText={statusLabel[order.status]}
              />
            ))}
            {!isListLoading && !loadError && trackingOrders.length === 0 && <EmptyState />}
            {isListLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {loadError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-xs text-destructive">
                <AlertCircle className="mx-auto mb-2 h-4 w-4" />
                <div>{loadError}</div>
                <Button variant="outline" size="sm" className="mt-3" onClick={refreshTracking}>
                  ลองใหม่
                </Button>
              </div>
            )}
          </CardContent>
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>
              {trackingTotal === 0
                ? '0 รายการ'
                : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, trackingTotal)} จาก ${trackingTotal.toLocaleString('th-TH')}`}
              <span className="ml-1 hidden text-[10px] sm:inline">· โหลดครั้งละ {PAGE_SIZE}</span>
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
        </Card>

        <Card className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">ข้อมูลคนขับ</CardTitle>
            <CardDescription>
              {selectedOrder
                ? `${selectedOrder.code} · ${statusLabel[selectedOrder.status]}`
                : 'เลือก order ก่อน'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {isDetailLoading && !selectedOrder ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <DriverSummary driver={selectedDriver} order={selectedOrder} />
            )}
          </CardContent>
        </Card>

        <div className="h-[calc(100vh-12rem)] space-y-4 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">สถานะและการดำเนินการ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedOrder ? (
                <>
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">Order</div>
                    <div className="mt-1">
                      <OrderSummary order={selectedOrder} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={
                        selectedOrder.status === 'in_transit'
                          ? 'info'
                          : selectedOrder.status === 'pending_confirmation' ||
                              selectedOrder.status === 'returning'
                            ? 'warning'
                            : 'muted'
                      }
                    >
                      {statusLabel[selectedOrder.status]}
                    </Badge>
                    {selectedOrder.deliveryPlan?.releaseState === 'released' && (
                      <Badge variant="info">จาก Planning</Badge>
                    )}
                    {selectedDriver && <Badge variant="muted">คนขับ: {selectedDriver.name}</Badge>}
                    {isDetailLoading && (
                      <Badge variant="muted" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        กำลังโหลดรายละเอียด
                      </Badge>
                    )}
                  </div>

                  {!isDetailLoading && selectedOrder.proofOfDelivery && (
                    <ProofOfDeliveryInfo order={selectedOrder} driverName={selectedDriver?.name} />
                  )}

                  {(selectedOrder.status === 'returning' ||
                    selectedOrder.status === 'failed' ||
                    selectedOrder.status === 'cancelled' ||
                    selectedOrder.status === 'returned') &&
                    selectedOrder.resolution && <ResolutionInfo order={selectedOrder} />}

                  {selectedOrder.status === 'in_transit' && (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => setRiderCloseTargetId(selectedOrder.id)}
                      >
                        <Truck className="h-4 w-4" />
                        rider ปิดงาน
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => setFailTargetId(selectedOrder.id)}
                      >
                        <XCircle className="h-4 w-4" />
                        ไม่สำเร็จ
                      </Button>
                    </div>
                  )}

                  {selectedOrder.status === 'pending_confirmation' && (
                    <>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={async () => {
                            await confirmDelivery(selectedOrder.id);
                            setSelectedOrderId(selectedOrder.id);
                            setActiveTab('closed');
                            setPage(1);
                            refreshTracking();
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          ยืนยันปิดงาน
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => setFailTargetId(selectedOrder.id)}
                        >
                          <XCircle className="h-4 w-4" />
                          ตีกลับ/ไม่สำเร็จ
                        </Button>
                      </div>
                    </>
                  )}

                  {selectedOrder.status === 'returning' && (
                    <Button
                      className="w-full"
                      onClick={() => {
                        markReturned(selectedOrder.id);
                        setSelectedOrderId(selectedOrder.id);
                        setActiveTab('closed');
                      }}
                    >
                      <PackageCheck className="h-4 w-4" />
                      รับคืนเข้าสาขาแล้ว
                    </Button>
                  )}

                  {(selectedOrder.status === 'delivered' ||
                    selectedOrder.status === 'failed' ||
                    selectedOrder.status === 'cancelled' ||
                    selectedOrder.status === 'returned') && (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      งานนี้ปิดแล้ว ไม่มี action เพิ่มเติมในหน้าติดตาม
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  เลือก order จากคอลัมน์ซ้าย
                </div>
              )}
            </CardContent>
          </Card>
          <OrderTimeline
            order={selectedOrder}
            description="กิจกรรมที่เกิดขึ้นกับออเดอร์นี้"
            compact
          />
        </div>
      </div>
    </div>
  );
}
