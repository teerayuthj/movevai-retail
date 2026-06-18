import { useEffect, useMemo, useState } from 'react';
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
import { isVisibleInExecutionQueue } from '@/lib/deliveryPlanning';
import {
  deliveryTrackingTabLabels,
  getDeliveryTrackingTab,
  requiresDeliveryReview,
  type DeliveryTrackingTab,
} from '@/lib/deliveryExecution';
import { useRetailStore } from '@/state/retailStore';
import { CheckCircle2, PackageCheck, Search, Truck, XCircle } from 'lucide-react';

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

  const workflowOrders = orders.filter(
    (order) => getDeliveryTrackingTab(order) && isVisibleInExecutionQueue(order),
  );
  const inTransitOrders = workflowOrders.filter((order) => order.status === 'in_transit');
  const pendingOrders = workflowOrders.filter((order) => order.status === 'pending_confirmation');
  const returningOrders = workflowOrders.filter((order) => order.status === 'returning');
  const closedOrders = workflowOrders.filter((order) =>
    ['delivered', 'failed', 'cancelled', 'returned'].includes(order.status),
  );
  const defaultTab: DeliveryTrackingTab =
    pendingOrders.length > 0
      ? 'pending'
      : inTransitOrders.length > 0
        ? 'in_transit'
        : returningOrders.length > 0
          ? 'returning'
          : 'closed';
  const parsedSearch = useMemo(() => parseTrackingSearch(locationSearch), [locationSearch]);

  const [activeTab, setActiveTab] = useState<DeliveryTrackingTab>(parsedSearch.tab ?? defaultTab);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    parsedSearch.orderId ??
      pendingOrders[0]?.id ??
      inTransitOrders[0]?.id ??
      returningOrders[0]?.id ??
      closedOrders[0]?.id ??
      null,
  );

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedDriver =
    drivers.find((driver) => driver.id === selectedOrder?.assignedDriverId) ?? null;

  const filteredOrders = workflowOrders.filter((order) => {
    const tab = getDeliveryTrackingTab(order);
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
  });

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

  const tabCounts: Record<DeliveryTrackingTab, number> = {
    in_transit: inTransitOrders.length,
    pending: pendingOrders.length,
    returning: returningOrders.length,
    closed: closedOrders.length,
  };

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
            ? `${orders.find((order) => order.id === failTargetId)?.code ?? ''} — เลือกเหตุผลและขั้นตอนต่อไป`
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
        order={orders.find((order) => order.id === riderCloseTargetId) ?? null}
        onCancel={() => setRiderCloseTargetId(null)}
        onSubmit={async (input) => {
          if (!riderCloseTargetId) return;
          const target = orders.find((order) => order.id === riderCloseTargetId);
          await submitDelivery(riderCloseTargetId, input);
          setSelectedOrderId(riderCloseTargetId);
          // งานเสี่ยงสูง → ไปแท็บรอยืนยัน, งานทั่วไป → ปิดเลยไปแท็บปิดงาน
          setActiveTab(target && requiresDeliveryReview(target) ? 'pending' : 'closed');
          setRiderCloseTargetId(null);
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
                  onValueChange={(value) => setActiveTab(value as DeliveryTrackingTab)}
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
                              {tabCounts[tab]}
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
          <CardContent className="flex-1 space-y-2 overflow-auto">
            {filteredOrders.map((order) => (
              <QueueOrderCard
                key={order.id}
                order={order}
                selected={selectedOrderId === order.id}
                onClick={() => setSelectedOrderId(order.id)}
                statusText={statusLabel[order.status]}
              />
            ))}
            {filteredOrders.length === 0 && <EmptyState />}
          </CardContent>
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
            <DriverSummary driver={selectedDriver} order={selectedOrder} />
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
                  </div>

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
                      {selectedOrder.proofOfDelivery && (
                        <ProofOfDeliveryInfo
                          order={selectedOrder}
                          driverName={selectedDriver?.name}
                        />
                      )}
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={async () => {
                            await confirmDelivery(selectedOrder.id);
                            setSelectedOrderId(selectedOrder.id);
                            setActiveTab('closed');
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
