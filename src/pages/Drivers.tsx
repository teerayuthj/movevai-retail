import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { DriverAvatar } from '@/components/DriverAvatar';
import {
  Bike,
  Car,
  Truck as TruckIcon,
  Phone,
  Star,
  Package,
  Play,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  Driver,
  FailNextAction,
  FailReason,
  failNextActionLabel,
  failReasonLabel,
  formatTHB,
  statusLabel,
} from '@/data/mock';
import { useRetailStore } from '@/state/retailStore';
import { ResolutionDialog } from '@/components/ResolutionDialog';

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

function VehicleIcon({ v }: { v: Driver['vehicle'] }) {
  if (v === 'motorcycle') return <Bike className="h-4 w-4" />;
  if (v === 'van') return <Car className="h-4 w-4" />;
  return <TruckIcon className="h-4 w-4" />;
}

export function DriversPage() {
  const { drivers, orders, startDelivery, completeDelivery, setDriverStatus, failDelivery } =
    useRetailStore();
  const [failTargetId, setFailTargetId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">คนขับ</h1>
        <p className="text-sm text-muted-foreground">ทีมจัดส่ง {drivers.length} คน</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drivers.map((d) => {
          const pct = (d.activeOrders / d.capacity) * 100;
          const driverOrders = orders.filter(
            (order) =>
              order.assignedDriverId === d.id && ['assigned', 'in_transit'].includes(order.status),
          );
          const canToggleOffDuty = driverOrders.length === 0;

          return (
            <Card key={d.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <DriverAvatar driver={d} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{d.name}</span>
                      <Badge
                        variant={
                          d.status === 'available'
                            ? 'success'
                            : d.status === 'on_delivery'
                              ? 'muted'
                              : 'muted'
                        }
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {d.status === 'available'
                          ? 'ว่าง'
                          : d.status === 'on_delivery'
                            ? 'กำลังส่ง'
                            : 'หยุด'}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {d.phone}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">ยานพาหนะ</span>
                    <span className="flex items-center gap-1 font-medium">
                      <VehicleIcon v={d.vehicle} />
                      {d.vehicle === 'motorcycle'
                        ? 'จักรยานยนต์'
                        : d.vehicle === 'van'
                          ? 'รถตู้'
                          : 'รถกระบะ'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">โซน</span>
                    <span className="font-medium">{d.zone}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">คะแนน</span>
                    <span className="flex items-center gap-0.5 font-medium">
                      <Star className="h-3 w-3 fill-warning text-warning" />
                      {d.rating}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">ภาระงาน</span>
                    <span className="tabular-nums font-medium">
                      {d.activeOrders}/{d.capacity}
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant={d.status === 'available' ? 'secondary' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setDriverStatus(d.id, 'available')}
                    disabled={d.status === 'available' || driverOrders.length > 0}
                  >
                    เปิดรับงาน
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => setDriverStatus(d.id, 'off_duty')}
                    disabled={!canToggleOffDuty || d.status === 'off_duty'}
                  >
                    หยุดงาน
                  </Button>
                </div>
                {driverOrders.length > 0 && (
                  <div className="mt-4 space-y-2 border-t pt-3">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      งานที่รับอยู่ ({driverOrders.length})
                    </div>
                    {driverOrders.map((order) => (
                      <div key={order.id} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-mono text-xs font-medium">{order.code}</div>
                            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                              {order.customer.name}
                            </div>
                          </div>
                          <Badge variant="muted" className="h-5 shrink-0 px-1.5 text-[10px]">
                            {statusLabel[order.status]}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {order.items.length} รายการ
                          </span>
                          <span className="font-medium text-warning">
                            {formatTHB(order.totalValue)}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          {order.status === 'assigned' ? (
                            <Button
                              size="sm"
                              className="h-7 flex-1 text-[11px]"
                              onClick={() => startDelivery(order.id)}
                            >
                              <Play className="h-3 w-3" />
                              เริ่มส่ง
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                className="h-7 flex-1 text-[11px]"
                                onClick={() => completeDelivery(order.id, true)}
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                สำเร็จ
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 flex-1 text-[11px]"
                                onClick={() => setFailTargetId(order.id)}
                              >
                                <XCircle className="h-3 w-3" />
                                ไม่สำเร็จ
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${orders.find((o) => o.id === failTargetId)?.code ?? ''} — ระบุเหตุผลและขั้นตอนต่อไป`
            : undefined
        }
        reasons={FAIL_REASONS}
        actions={{
          label: 'ขั้นตอนต่อไป',
          options: FAIL_ACTIONS,
          defaultValue: 'retry',
          helpText: (v) =>
            v === 'retry'
              ? 'กลับไปสถานะมอบหมาย ออกส่งรอบใหม่'
              : v === 'return'
                ? 'ย้ายไปแท็บส่งกลับ รอรับคืนสาขา'
                : 'ปิดงานเป็นส่งไม่สำเร็จ',
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
          }
          setFailTargetId(null);
        }}
      />
    </div>
  );
}
