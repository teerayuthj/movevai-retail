import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DriverAvatar } from '@/components/DriverAvatar';
import { Button } from '@/components/ui/button';
import {
  DriverSummary,
  DriverWorkloadChips,
  OrderSummary,
} from '@/components/delivery/DeliveryExecutionShared';
import type { Driver, Order } from '@/data/orderTypes';
import { getDriverWorkloadSummary } from '@/lib/deliveryExecution';
import { hasCsvImportSource } from '@/lib/orderSourceLink';
import { AlertTriangle, FileSpreadsheet } from 'lucide-react';

type AssignmentPanelProps = {
  order: Order | null;
  /** คนขับที่เลือก (co-delivery) — index 0 = คนขับหลัก, ที่เหลือ = คนขับร่วม */
  drivers: Driver[];
  orders: Order[];
  onEditOrderSource?: (order: Order) => void;
  actions: ReactNode;
};

/** คอลัมน์ขวา (เดสก์ท็อป) — สรุป order + คนขับที่เลือก + ปุ่มยืนยันมอบหมาย */
export function AssignmentPanel({
  order,
  drivers,
  orders,
  onEditOrderSource,
  actions,
}: AssignmentPanelProps) {
  const selectedWorkloads = drivers.map((driver) => ({
    driver,
    workload: getDriverWorkloadSummary(driver, orders),
  }));
  const driversWithExistingWork = selectedWorkloads.filter(
    ({ workload }) =>
      workload.waitingToStart > 0 ||
      workload.inTransit > 0 ||
      workload.pendingReview > 0 ||
      workload.returning > 0 ||
      workload.plannedForDate > 0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">ยืนยันการมอบหมาย</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {order ? (
          <>
            <div>
              <div className="text-[11px] font-medium text-muted-foreground">Order</div>
              <div className="mt-1">
                <OrderSummary order={order} />
              </div>
              {hasCsvImportSource(order) && onEditOrderSource && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full justify-center"
                  onClick={() => onEditOrderSource(order)}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  แก้ไขข้อมูลจาก CSV
                </Button>
              )}
            </div>

            <div>
              <div className="text-[11px] font-medium text-muted-foreground">
                คนขับ{drivers.length > 1 ? ` · ส่งร่วม ${drivers.length} คน` : ''}
              </div>
              <div className="mt-1 space-y-2">
                {drivers.length > 0 ? (
                  selectedWorkloads.map(({ driver, workload }, index) => (
                    <div key={driver.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <DriverAvatar driver={driver} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{driver.name}</span>
                            <Badge
                              variant={index === 0 ? 'info' : 'muted'}
                              className="h-4 shrink-0 px-1.5 text-[9px]"
                            >
                              {index === 0 ? 'คนขับหลัก' : 'ร่วมส่ง'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{driver.phone}</div>
                          <DriverWorkloadChips workload={workload} className="mt-2" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <DriverSummary driver={null} order={order} orders={orders} />
                )}
              </div>
            </div>

            {driversWithExistingWork.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  คนขับที่เลือกมีงานค้างอยู่
                </div>
                <div className="mt-1 text-[11px] text-warning/90">
                  ตรวจสอบลำดับส่งก่อนจ่ายงานเพิ่ม
                </div>
                <div className="mt-2 space-y-1.5">
                  {driversWithExistingWork.map(({ driver, workload }) => (
                    <div key={driver.id} className="rounded-md bg-background/70 px-2 py-1.5">
                      <div className="font-medium text-foreground">{driver.name}</div>
                      <DriverWorkloadChips workload={workload} className="mt-1" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {actions}
          </>
        ) : (
          <div className="py-8 text-center text-sm text-muted-foreground">
            เลือก order จากคอลัมน์ซ้าย
          </div>
        )}
      </CardContent>
    </Card>
  );
}
