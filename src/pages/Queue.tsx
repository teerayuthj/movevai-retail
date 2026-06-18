import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { AutoAssignPreviewDialog } from '@/components/delivery/AutoAssignPreviewDialog';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  DriverCard,
  DriverSummary,
  EmptyState,
  OrderSummary,
  QueueAiAssessment,
  QueueOrderCard,
} from '@/components/delivery/DeliveryExecutionShared';
import { DriverAvatar } from '@/components/DriverAvatar';
import { type CancelReason, cancelReasonLabel, statusLabel } from '@/data/mock';
import { isVisibleInExecutionQueue } from '@/lib/deliveryPlanning';
import {
  compareOrderPriority,
  driverQueueTabLabels,
  getDriverQueueTab,
  planAutoAssignments,
  recommendDriverForOrder,
  type DriverQueueTab,
} from '@/lib/deliveryExecution';
import { useRetailStore } from '@/state/retailStore';
import { Ban, CheckCircle2, Route, Search, Sparkles } from 'lucide-react';

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({ value, label: cancelReasonLabel[value] }));

type QueuePageProps = {
  locationSearch: string;
  onOpenTracking: (search?: string) => void;
};

function parseQueueSearch(locationSearch: string) {
  const params = new URLSearchParams(locationSearch);
  const tab = params.get('tab');
  const orderId = params.get('order');

  return {
    tab: tab === 'ready' || tab === 'assigned' ? (tab as DriverQueueTab) : null,
    orderId: orderId || null,
  };
}

function buildTrackingSearch(orderId?: string) {
  const params = new URLSearchParams({ tab: 'in_transit' });
  if (orderId) params.set('order', orderId);
  return `?${params.toString()}`;
}

export function QueuePage({ locationSearch, onOpenTracking }: QueuePageProps) {
  const { orders, drivers, assignOrder, autoAssignReadyOrders, startDelivery, cancelOrder } =
    useRetailStore();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [autoPreviewOpen, setAutoPreviewOpen] = useState(false);

  const workflowOrders = orders.filter(
    (order) => getDriverQueueTab(order) && isVisibleInExecutionQueue(order),
  );
  const readyOrders = workflowOrders.filter((order) => order.status === 'ready');
  const assignedOrders = workflowOrders.filter((order) => order.status === 'assigned');
  const defaultTab: DriverQueueTab =
    readyOrders.length > 0 || assignedOrders.length === 0 ? 'ready' : 'assigned';
  const parsedSearch = useMemo(() => parseQueueSearch(locationSearch), [locationSearch]);

  const [activeTab, setActiveTab] = useState<DriverQueueTab>(parsedSearch.tab ?? defaultTab);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    parsedSearch.orderId ?? readyOrders[0]?.id ?? assignedOrders[0]?.id ?? null,
  );
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? null;

  // คนขับที่ระบบแนะนำสำหรับออเดอร์ที่เลือก (โซน + capacity + ใบรับรอง)
  const recommendedDriverId =
    selectedOrder?.status === 'ready'
      ? (recommendDriverForOrder(selectedOrder, drivers)?.id ?? null)
      : null;

  // แผนจ่ายงานอัตโนมัติ (dry-run) สำหรับ preview ก่อนยืนยัน
  const autoAssignProposals = useMemo(
    () => planAutoAssignments(orders, drivers),
    [orders, drivers],
  );

  const filteredOrders = workflowOrders
    .filter((order) => {
      const tab = getDriverQueueTab(order);
      const normalizedQuery = query.trim().toLowerCase();
      const assignedDriverName = order.assignedDriverId
        ? (drivers.find((driver) => driver.id === order.assignedDriverId)?.name ?? '')
        : '';
      const matchesQuery =
        !normalizedQuery ||
        [
          order.code,
          order.customer.name,
          order.customer.phone,
          order.customer.address,
          assignedDriverName,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return tab === activeTab && matchesQuery;
    })
    // แท็บ "รอมอบหมาย" เรียงตามความสำคัญ — งานด่วน/มูลค่าสูง/ค้างนานขึ้นก่อน
    .sort((a, b) => (activeTab === 'ready' ? compareOrderPriority(a, b) : 0));

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
    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? null);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    setSelectedDriverId(selectedOrder?.assignedDriverId ?? null);
  }, [selectedOrder?.assignedDriverId, selectedOrder?.id]);

  const canAssign =
    selectedOrder?.status === 'ready' &&
    selectedDriver &&
    selectedDriver.status !== 'off_duty' &&
    selectedDriver.activeOrders < selectedDriver.capacity;

  const tabCounts: Record<DriverQueueTab, number> = {
    ready: readyOrders.length,
    assigned: assignedOrders.length,
  };

  const assignedReadyToStart = assignedOrders.length > 0;

  const handleStartRoute = (orderIds: string[], selectedOrderForFocus?: string) => {
    orderIds.forEach((orderId) => startDelivery(orderId));
    onOpenTracking(buildTrackingSearch(selectedOrderForFocus));
  };

  const routeTargetOrders =
    activeTab === 'assigned' && selectedOrder?.status === 'assigned'
      ? [selectedOrder]
      : assignedOrders;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">คิวจัดส่ง</h1>
          <p className="text-sm text-muted-foreground">
            มอบหมาย driver สำหรับออเดอร์ที่พร้อมส่ง และปล่อยงานเข้ารอบ Route ก่อนออกจัดส่ง
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!assignedReadyToStart}
            onClick={() =>
              handleStartRoute(
                routeTargetOrders.map((order) => order.id),
                routeTargetOrders.length === 1 ? routeTargetOrders[0]?.id : undefined,
              )
            }
          >
            <Route className="h-4 w-4" />
            สร้าง Route
          </Button>
          <Button onClick={() => setAutoPreviewOpen(true)} disabled={readyOrders.length === 0}>
            <Sparkles className="h-4 w-4" /> Auto-assign ทั้งหมด
          </Button>
        </div>
      </div>

      <AutoAssignPreviewDialog
        open={autoPreviewOpen}
        proposals={autoAssignProposals}
        drivers={drivers}
        onCancel={() => setAutoPreviewOpen(false)}
        onConfirm={(orderIds) => {
          autoAssignReadyOrders(orderIds);
          setAutoPreviewOpen(false);
          setActiveTab('assigned');
        }}
      />

      <ResolutionDialog
        open={!!cancelTargetId}
        title="ยกเลิกออเดอร์"
        description={
          cancelTargetId
            ? `${orders.find((order) => order.id === cancelTargetId)?.code ?? ''} — เลือกเหตุผล`
            : undefined
        }
        reasons={CANCEL_REASONS}
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => setCancelTargetId(null)}
        onConfirm={({ reason, note }) => {
          if (cancelTargetId) cancelOrder(cancelTargetId, { reason, note });
          setCancelTargetId(null);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px_380px]">
        <Card className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <div className="space-y-3">
              <CardTitle className="text-sm">คิวจัดส่ง</CardTitle>
              <div className="flex flex-col gap-3">
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as DriverQueueTab)}
                  className="w-full"
                >
                  <div className="w-full">
                    <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 rounded-2xl bg-muted/70 p-1.5">
                      {(Object.keys(driverQueueTabLabels) as DriverQueueTab[]).map((tab) => (
                        <TabsTrigger
                          key={tab}
                          value={tab}
                          className="h-10 shrink-0 gap-2 rounded-xl px-3.5 text-sm text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                        >
                          <span>{driverQueueTabLabels[tab]}</span>
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-background/80 px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {tabCounts[tab]}
                          </span>
                        </TabsTrigger>
                      ))}
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
          <CardContent className="flex-1 space-y-2 overflow-auto">
            {filteredOrders.map((order, index) => (
              <QueueOrderCard
                key={order.id}
                order={order}
                selected={selectedOrderId === order.id}
                onClick={() => setSelectedOrderId(order.id)}
                statusText={statusLabel[order.status]}
                rank={activeTab === 'ready' ? index + 1 : undefined}
              />
            ))}
            {filteredOrders.length === 0 && <EmptyState />}
          </CardContent>
        </Card>

        <Card className="flex h-[calc(100vh-12rem)] flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">เลือกคนขับ</CardTitle>
            <CardDescription>
              {selectedOrder
                ? selectedOrder.status === 'ready'
                  ? `สำหรับ ${selectedOrder.code}`
                  : `${selectedOrder.code} · ${statusLabel[selectedOrder.status]}`
                : 'เลือก order ก่อน'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 space-y-2 overflow-auto">
            {drivers.map((driver) => (
              <DriverCard
                key={driver.id}
                driver={driver}
                selected={selectedDriverId === driver.id}
                onSelect={() => setSelectedDriverId(driver.id)}
                recommended={driver.id === recommendedDriverId}
              />
            ))}
          </CardContent>
        </Card>

        <div className="h-[calc(100vh-12rem)] space-y-4 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">ยืนยันการมอบหมาย</CardTitle>
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

                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">คนขับ</div>
                    <div className="mt-1">
                      {selectedDriver ? (
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center gap-3">
                            <DriverAvatar driver={selectedDriver} />
                            <div>
                              <div className="text-sm font-medium">{selectedDriver.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {selectedDriver.zone} · ⭐ {selectedDriver.rating}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <DriverSummary driver={null} order={selectedOrder} />
                      )}
                    </div>
                  </div>

                  <QueueAiAssessment />

                  {selectedOrder.status === 'ready' && (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        disabled={!canAssign}
                        onClick={() => {
                          if (!selectedOrder || !selectedDriverId) return;
                          void assignOrder(selectedOrder.id, selectedDriverId);
                          setActiveTab('assigned');
                          setSelectedOrderId(selectedOrder.id);
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        มอบหมาย
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setCancelTargetId(selectedOrder.id)}
                      >
                        <Ban className="h-4 w-4" />
                        ยกเลิก
                      </Button>
                    </div>
                  )}

                  {selectedOrder.status === 'assigned' && (
                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        onClick={() => handleStartRoute([selectedOrder.id], selectedOrder.id)}
                      >
                        <Route className="h-4 w-4" />
                        สร้าง Route และเริ่มจัดส่ง
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setCancelTargetId(selectedOrder.id)}
                      >
                        <Ban className="h-4 w-4" />
                        ยกเลิกออเดอร์
                      </Button>
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
