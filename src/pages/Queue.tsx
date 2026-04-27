import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriverAvatar } from "@/components/DriverAvatar";
import {
  MapPin,
  Phone,
  Package,
  Clock,
  Search,
  Bike,
  Car,
  Truck as TruckIcon,
  CheckCircle2,
  XCircle,
  Sparkles,
  ShieldCheck,
  Coins,
  IdCard,
  Route,
  Ban,
  PackageCheck,
} from "lucide-react";
import {
  CancelReason,
  Driver,
  FailNextAction,
  FailReason,
  Order,
  cancelReasonLabel,
  failNextActionLabel,
  failReasonLabel,
  formatTHB,
  paymentLabel,
  statusLabel,
} from "@/data/mock";
import { cn } from "@/lib/utils";
import { useRetailStore } from "@/state/retailStore";
import { ResolutionDialog } from "@/components/ResolutionDialog";

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({ value, label: cancelReasonLabel[value] }));

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));


function VehicleIcon({ v }: { v: Driver["vehicle"] }) {
  if (v === "motorcycle") return <Bike className="h-3.5 w-3.5" />;
  if (v === "van") return <Car className="h-3.5 w-3.5" />;
  return <TruckIcon className="h-3.5 w-3.5" />;
}

function DriverCard({
  driver,
  selected,
  onSelect,
  recommended,
}: {
  driver: Driver;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
}) {
  const pct = (driver.activeOrders / driver.capacity) * 100;
  const remainingCapacity = Math.max(0, driver.capacity - driver.activeOrders);
  return (
    <button
      onClick={onSelect}
      disabled={driver.status === "off_duty"}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-all",
        selected && "border-primary bg-primary/5 ring-1 ring-primary",
        !selected && driver.status !== "off_duty" && "hover:border-primary/40 hover:bg-muted/40",
        driver.status === "off_duty" && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="flex items-start gap-3">
        <DriverAvatar driver={driver} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{driver.name}</span>
            {recommended && (
              <Badge variant="muted" className="h-4 gap-0.5 px-1 text-[9px]">
                <Sparkles className="h-2.5 w-2.5" />
                แนะนำ
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <VehicleIcon v={driver.vehicle} />
            <span>{driver.zone}</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>งาน {driver.activeOrders}/{driver.capacity}</span>
              <span>ว่างอีก {remainingCapacity}</span>
            </div>
            <Progress value={pct} className="h-1" />
          </div>
        </div>
        <Badge
          variant={
            driver.status === "available"
              ? "success"
              : driver.status === "on_delivery"
              ? "muted"
              : "muted"
          }
          className="h-5 shrink-0 px-1.5 text-[10px]"
        >
          {driver.status === "available"
            ? "ว่าง"
            : driver.status === "on_delivery"
            ? "กำลังส่ง"
            : "หยุด"}
        </Badge>
      </div>
    </button>
  );
}

function QueueOrderCard({
  order,
  selected,
  onClick,
  statusText = "พร้อมส่ง",
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
  statusText?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border bg-card p-4 text-left transition-all",
        selected ? "border-primary ring-1 ring-primary shadow-sm" : "hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.code}</span>
            <Badge
              variant={order.status === "ready" ? "success" : "muted"}
              className="h-5 px-1.5 text-[10px]"
            >
              {statusText}
            </Badge>
            {order.totalValue >= 500000 && (
              <Badge variant="warning" className="h-5 gap-0.5 border-red-300 bg-red-50 px-1.5 text-[10px] text-red-700">
                <ShieldCheck className="h-2.5 w-2.5" />
                High-value
              </Badge>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
        </div>
        <Badge variant="muted" className="shrink-0">
          <Package className="h-3 w-3" /> {order.items.length}
        </Badge>
      </div>
      <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-1">{order.customer.address}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3" />
          <span>{order.customer.phone}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-2">
        <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Coins className="h-3 w-3 text-amber-600" />
          {paymentLabel[order.payment]}
        </div>
        <span className="text-sm font-semibold tabular-nums text-amber-800">
          {formatTHB(order.totalValue)}
        </span>
      </div>
    </button>
  );
}

type QueueTab = "ready" | "assigned" | "in_transit" | "returning" | "closed";

const tabLabels: Record<QueueTab, string> = {
  ready: "รอมอบหมาย",
  assigned: "รอสร้าง Route",
  in_transit: "กำลังจัดส่ง",
  returning: "ส่งกลับ",
  closed: "ปิดงานแล้ว",
};

function getQueueTab(order: Order): QueueTab | null {
  if (order.status === "ready") return "ready";
  if (order.status === "assigned") return "assigned";
  if (order.status === "in_transit") return "in_transit";
  if (order.status === "returning") return "returning";
  if (
    order.status === "delivered" ||
    order.status === "failed" ||
    order.status === "cancelled" ||
    order.status === "returned"
  )
    return "closed";
  return null;
}

export function QueuePage() {
  const {
    orders,
    drivers,
    assignOrder,
    autoAssignReadyOrders,
    startDelivery,
    completeDelivery,
    cancelOrder,
    failDelivery,
    markReturned,
  } = useRetailStore();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const workflowOrders = orders.filter(
    (order) =>
      getQueueTab(order) &&
      (order.shippingMethod ?? "internal_driver") === "internal_driver"
  );
  const queueOrders = workflowOrders.filter((o) => o.status === "ready");
  const assignedOrders = workflowOrders.filter((o) => o.status === "assigned");
  const inTransitOrders = workflowOrders.filter((o) => o.status === "in_transit");
  const returningOrders = workflowOrders.filter((o) => o.status === "returning");
  const closedOrders = workflowOrders.filter((o) =>
    ["delivered", "failed", "cancelled", "returned"].includes(o.status)
  );
  const [activeTab, setActiveTab] = useState<QueueTab>("ready");
  const [query, setQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    queueOrders[0]?.id ?? assignedOrders[0]?.id ?? inTransitOrders[0]?.id ?? null
  );
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  const selectedOrder = orders.find((o) => o.id === selectedOrderId);
  const selectedDriver = drivers.find((d) => d.id === selectedDriverId);
  const tabCounts: Record<QueueTab, number> = {
    ready: queueOrders.length,
    assigned: assignedOrders.length,
    in_transit: inTransitOrders.length,
    returning: returningOrders.length,
    closed: closedOrders.length,
  };
  const filteredOrders = workflowOrders.filter((order) => {
    const tab = getQueueTab(order);
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      [
        order.code,
        order.customer.name,
        order.customer.phone,
        order.customer.address,
        order.assignedDriverId
          ? drivers.find((d) => d.id === order.assignedDriverId)?.name
          : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);

    return tab === activeTab && matchesQuery;
  });

  useEffect(() => {
    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? null);
    }
  }, [filteredOrders, selectedOrderId]);

  useEffect(() => {
    setSelectedDriverId(selectedOrder?.assignedDriverId ?? null);
  }, [selectedOrder?.assignedDriverId, selectedOrder?.id]);

  const canAssign =
    selectedOrder?.status === "ready" &&
    selectedDriver &&
    selectedDriver.status !== "off_duty" &&
    selectedDriver.activeOrders < selectedDriver.capacity;

  const assignedReadyToStart = assignedOrders.length > 0;
  const routeTargetOrders =
    activeTab === "assigned" && selectedOrder?.status === "assigned"
      ? [selectedOrder]
      : assignedOrders;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">คิวจัดส่งทองคำ/เงิน</h1>
          <p className="text-sm text-muted-foreground">
            มอบหมาย driver สำหรับออเดอร์ที่พร้อมส่ง — AI แนะนำคนขับจากโซน ความพร้อม และ capacity ที่เหมาะสม
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!assignedReadyToStart}
            onClick={() => {
              routeTargetOrders.forEach((order) => startDelivery(order.id));
              setActiveTab("in_transit");
            }}
          >
            <Route className="h-4 w-4" />
            สร้าง Route
          </Button>
          <Button onClick={autoAssignReadyOrders} disabled={queueOrders.length === 0}>
            <Sparkles className="h-4 w-4" /> Auto-assign ทั้งหมด
          </Button>
        </div>
      </div>

      <ResolutionDialog
        open={!!cancelTargetId}
        title="ยกเลิกออเดอร์"
        description={
          cancelTargetId
            ? `${orders.find((o) => o.id === cancelTargetId)?.code ?? ""} — เลือกเหตุผล`
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

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${orders.find((o) => o.id === failTargetId)?.code ?? ""} — เลือกเหตุผลและขั้นตอนต่อไป`
            : undefined
        }
        reasons={FAIL_REASONS}
        actions={{
          label: "ขั้นตอนต่อไป",
          options: FAIL_ACTIONS,
          defaultValue: "retry",
          helpText: (v) =>
            v === "retry"
              ? "ออเดอร์จะกลับเป็นสถานะมอบหมาย คนขับเดิมรับไปส่งใหม่"
              : v === "return"
              ? "ออเดอร์จะถูกย้ายไปแท็บส่งกลับ รอรับคืนเข้าสาขา"
              : "ปิดงานเป็นส่งไม่สำเร็จ — ภายหลังยังกดส่งกลับสาขาได้",
        }}
        confirmLabel="บันทึก"
        onCancel={() => setFailTargetId(null)}
        onConfirm={({ reason, note, action }) => {
          if (failTargetId && action) {
            failDelivery(failTargetId, {
              reason,
              nextAction: action,
              note,
            });
            setActiveTab(
              action === "retry"
                ? "assigned"
                : action === "return"
                ? "returning"
                : "closed"
            );
          }
          setFailTargetId(null);
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px_380px]">
        <Card className="h-[calc(100vh-12rem)] overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">คิวจัดส่ง</CardTitle>
              </div>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as QueueTab)}>
                <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-5">
                  {(Object.keys(tabLabels) as QueueTab[]).map((tab) => (
                    <TabsTrigger key={tab} value={tab} className="gap-1 text-xs">
                      {tabLabels[tab]}
                      <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {tabCounts[tab]}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหา order, ลูกค้า, เบอร์โทร, คนขับ..."
                  className="h-8 pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-2">
            {filteredOrders.map((o) => (
              <QueueOrderCard
                key={o.id}
                order={o}
                selected={selectedOrderId === o.id}
                onClick={() => setSelectedOrderId(o.id)}
                statusText={statusLabel[o.status]}
              />
            ))}
            {filteredOrders.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                ไม่มีรายการในสถานะนี้
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-12rem)] overflow-hidden flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">เลือกคนขับ</CardTitle>
            <CardDescription>
              {selectedOrder
                ? selectedOrder.status === "ready"
                  ? `สำหรับ ${selectedOrder.code}`
                  : `${selectedOrder.code} · ${statusLabel[selectedOrder.status]}`
                : "เลือก order ก่อน"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto space-y-2">
            {drivers.map((d, i) => (
              <DriverCard
                key={d.id}
                driver={d}
                selected={selectedDriverId === d.id}
                onSelect={() => setSelectedDriverId(d.id)}
                recommended={i === 0}
              />
            ))}
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-12rem)] overflow-auto">
          <CardHeader>
            <CardTitle className="text-sm">ยืนยันการมอบหมาย</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedOrder ? (
              <>
                <div>
                  <div className="text-[11px] font-medium text-muted-foreground">Order</div>
                  <div className="mt-1 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium">{selectedOrder.code}</span>
                      <Badge variant="muted">{selectedOrder.items.length} รายการ</Badge>
                    </div>
                    <div className="mt-1 text-sm">{selectedOrder.customer.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {selectedOrder.customer.address}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t pt-2">
                      <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
                      <span className="text-sm font-semibold tabular-nums text-amber-800">
                        {formatTHB(selectedOrder.totalValue)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="muted" className="gap-1 text-[10px]">
                        <Coins className="h-2.5 w-2.5" />
                        {paymentLabel[selectedOrder.payment]}
                      </Badge>
                      {selectedOrder.requiresIdCheck && (
                        <Badge variant="warning" className="gap-1 text-[10px]">
                          <IdCard className="h-2.5 w-2.5" />
                          ตรวจบัตร
                        </Badge>
                      )}
                      {selectedOrder.insured && (
                        <Badge variant="muted" className="gap-1 text-[10px]">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          ประกันขนส่ง
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-muted-foreground">คนขับ</div>
                  {selectedDriverId ? (
                    <div className="mt-1 rounded-lg border p-3">
                      {selectedDriver && (
                        <div className="flex items-center gap-3">
                          <DriverAvatar driver={selectedDriver} />
                          <div>
                            <div className="text-sm font-medium">{selectedDriver.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {selectedDriver.zone} · ⭐ {selectedDriver.rating}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      ยังไม่ได้เลือกคนขับ
                    </div>
                  )}
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Sparkles className="h-3 w-3" />
                    AI ประเมิน
                  </div>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                      ประกันขนส่งครอบคลุม
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> ส่งถึงภายใน ~35 นาที
                    </li>
                    <li className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" /> อยู่ในโซนเดียวกับ order อื่น
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Package className="h-3 w-3" /> ยังเหลือ capacity 5/6
                    </li>
                  </ul>
                </div>

                {selectedOrder.status === "ready" && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={!canAssign}
                      onClick={() => {
                        if (selectedOrder && selectedDriverId) {
                          assignOrder(selectedOrder.id, selectedDriverId);
                          setActiveTab("assigned");
                        }
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      มอบหมาย
                    </Button>
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() => setCancelTargetId(selectedOrder.id)}
                    >
                      <Ban className="h-4 w-4" />
                      ยกเลิก
                    </Button>
                  </div>
                )}

                {selectedOrder.status === "assigned" && (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() => {
                        startDelivery(selectedOrder.id);
                        setActiveTab("in_transit");
                      }}
                    >
                      <Route className="h-4 w-4" />
                      สร้าง Route และเริ่มจัดส่ง
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                      onClick={() => setCancelTargetId(selectedOrder.id)}
                    >
                      <Ban className="h-4 w-4" />
                      ยกเลิกออเดอร์
                    </Button>
                  </div>
                )}

                {selectedOrder.status === "in_transit" && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => {
                        completeDelivery(selectedOrder.id, true);
                        setActiveTab("closed");
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      ส่งสำเร็จ
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

                {selectedOrder.status === "returning" && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      markReturned(selectedOrder.id);
                      setActiveTab("closed");
                    }}
                  >
                    <PackageCheck className="h-4 w-4" />
                    รับคืนเข้าสาขาแล้ว
                  </Button>
                )}

                {(selectedOrder.status === "cancelled" ||
                  selectedOrder.status === "failed" ||
                  selectedOrder.status === "returning" ||
                  selectedOrder.status === "returned") &&
                  selectedOrder.resolution && (
                    <ResolutionInfo order={selectedOrder} />
                  )}
              </>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                เลือก order จากคอลัมน์ซ้าย
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResolutionInfo({ order }: { order: Order }) {
  const r = order.resolution;
  if (!r) return null;
  const reasonText = r.reason
    ? failReasonLabel[r.reason as FailReason] ??
      cancelReasonLabel[r.reason as CancelReason]
    : undefined;
  const tone =
    r.type === "cancelled"
      ? "border-red-200 bg-red-50 text-red-900"
      : r.type === "failed"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : r.type === "returning"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  const title =
    r.type === "cancelled"
      ? "ยกเลิกแล้ว"
      : r.type === "failed"
      ? "ส่งไม่สำเร็จ"
      : r.type === "returning"
      ? "อยู่ระหว่างส่งกลับ"
      : "รับคืนแล้ว";

  return (
    <div className={cn("rounded-lg border p-3 text-xs", tone)}>
      <div className="flex items-center justify-between font-medium">
        <span>{title}</span>
        <span className="text-[10px] opacity-75">
          {new Date(r.recordedAt).toLocaleString("th", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      </div>
      {reasonText && <div className="mt-1">เหตุผล: {reasonText}</div>}
      {r.nextAction && (
        <div className="mt-0.5">
          ขั้นตอนต่อไป: {failNextActionLabel[r.nextAction]}
        </div>
      )}
      {r.note && <div className="mt-0.5">หมายเหตุ: {r.note}</div>}
      <div className="mt-1 text-[10px] opacity-75">
        บันทึกโดย {r.recordedBy.name} · {r.recordedBy.department}
      </div>
    </div>
  );
}
