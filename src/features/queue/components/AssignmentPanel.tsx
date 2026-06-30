import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DriverAvatar } from '@/components/DriverAvatar';
import { DriverSummary, OrderSummary } from '@/components/delivery/DeliveryExecutionShared';
import type { Driver, Order } from '@/data/mock';

type AssignmentPanelProps = {
  order: Order | null;
  /** คนขับที่เลือก (co-delivery) — index 0 = คนขับหลัก, ที่เหลือ = คนขับร่วม */
  drivers: Driver[];
  actions: ReactNode;
};

/** คอลัมน์ขวา (เดสก์ท็อป) — สรุป order + คนขับที่เลือก + ปุ่มยืนยันมอบหมาย */
export function AssignmentPanel({ order, drivers, actions }: AssignmentPanelProps) {
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
              <div className="text-[11px] font-medium text-muted-foreground">
                คนขับ{drivers.length > 1 ? ` · ส่งร่วม ${drivers.length} คน` : ''}
              </div>
              <div className="mt-1 space-y-2">
                {drivers.length > 0 ? (
                  drivers.map((driver, index) => (
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
                          <div className="text-xs text-muted-foreground">
                            {driver.zone} · ⭐ {driver.rating}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <DriverSummary driver={null} order={order} />
                )}
              </div>
            </div>

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
