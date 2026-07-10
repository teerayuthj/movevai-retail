import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DriverAvatar } from '@/components/DriverAvatar';
import { CheckCircle2, IdCard, Package, Phone, XCircle } from 'lucide-react';
import { type Driver, type Order, formatTHB, statusLabel } from '@/data/orderTypes';
import { VehicleIcon } from './VehicleIcon';

type DriverCardProps = {
  driver: Driver;
  driverOrders: Order[];
  onSetStatus: (driverId: string, status: Driver['status']) => void;
  onCompleteDelivery: (orderId: string, success: boolean) => void;
  onFailDelivery: (orderId: string) => void;
};

export function DriverCard({
  driver: d,
  driverOrders,
  onSetStatus,
  onCompleteDelivery,
  onFailDelivery,
}: DriverCardProps) {
  const canToggleOffDuty = driverOrders.length === 0;
  const approvalStatus = d.approvalStatus ?? 'approved';

  return (
    <Card>
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
              {approvalStatus !== 'approved' && (
                <Badge
                  variant={approvalStatus === 'pending' ? 'warning' : 'destructive'}
                  className="h-5 px-1.5 text-[10px]"
                >
                  {approvalStatus === 'pending' ? 'รออนุมัติ' : 'ไม่อนุมัติ'}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {d.phone}
            </div>
          </div>
          {d.licensePlate && (
            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <IdCard className="h-3 w-3" />
              {d.licensePlate}
            </div>
          )}
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
              {d.vehicleColor ? ` · ${d.vehicleColor}` : ''}
            </span>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">งานที่รับอยู่</span>
            <span className="tabular-nums font-medium">{d.activeOrders}</span>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant={d.status === 'available' ? 'secondary' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => onSetStatus(d.id, 'available')}
            disabled={d.status === 'available' || driverOrders.length > 0}
          >
            เปิดรับงาน
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onSetStatus(d.id, 'off_duty')}
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
                    <div className="font-mono text-xs font-medium">{order.orderNo}</div>
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
                  <span className="font-medium text-warning">{formatTHB(order.totalValue)}</span>
                </div>
                {order.status !== 'assigned' && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 flex-1 text-[11px]"
                      onClick={() => onCompleteDelivery(order.id, true)}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      สำเร็จ
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 flex-1 text-[11px]"
                      onClick={() => onFailDelivery(order.id)}
                    >
                      <XCircle className="h-3 w-3" />
                      ไม่สำเร็จ
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
