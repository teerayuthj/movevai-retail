import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DriverAvatar } from '@/components/DriverAvatar';
import {
  DriverSummary,
  OrderSummary,
  QueueAiAssessment,
} from '@/components/delivery/DeliveryExecutionShared';
import type { Driver, Order } from '@/data/mock';

type AssignmentPanelProps = {
  order: Order | null;
  driver: Driver | null;
  actions: ReactNode;
};

/** คอลัมน์ขวา (เดสก์ท็อป) — สรุป order + คนขับที่เลือก + ปุ่มยืนยันมอบหมาย */
export function AssignmentPanel({ order, driver, actions }: AssignmentPanelProps) {
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
            </div>

            <div>
              <div className="text-[11px] font-medium text-muted-foreground">คนขับ</div>
              <div className="mt-1">
                {driver ? (
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <DriverAvatar driver={driver} />
                      <div>
                        <div className="text-sm font-medium">{driver.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {driver.zone} · ⭐ {driver.rating}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <DriverSummary driver={null} order={order} />
                )}
              </div>
            </div>

            <QueueAiAssessment />

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
