import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { DetailDrawer } from '@/components/DetailDrawer';
import { CustomerTrackingQrCard } from '@/components/CustomerTrackingQrCard';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  DriverSummary,
  OrderSummary,
  ProofOfDeliveryInfo,
  ResolutionInfo,
} from '@/components/delivery/DeliveryExecutionShared';
import { type Driver, type Order, statusLabel } from '@/data/mock';
import {
  formatElapsedDuration,
  getInTransitElapsedMinutes,
  getInTransitElapsedTone,
} from '@/lib/deliveryExecution';
import { Clock3, Loader2 } from 'lucide-react';

type TrackingDetailDrawerProps = {
  order: Order | null;
  driver: Driver | null;
  isDetailLoading: boolean;
  onClose: () => void;
  actions?: ReactNode;
  /** เวลาปัจจุบันจากหน้าแม่ (tick ทุกนาที) — ใช้คำนวณ "ส่งมาแล้ว X นาที" */
  nowMs?: number;
};

/** รายละเอียดเชิงลึก — drawer ขวา (เดสก์ท็อป) / เต็มจอ (มือถือ) เปิดเมื่อเลือก order */
export function TrackingDetailDrawer({
  order,
  driver,
  isDetailLoading,
  onClose,
  actions,
  nowMs,
}: TrackingDetailDrawerProps) {
  const inTransitMinutes = order ? getInTransitElapsedMinutes(order, nowMs) : null;
  return (
    <DetailDrawer
      open={!!order}
      title={<span className="font-mono">{order?.code}</span>}
      subtitle={order ? statusLabel[order.status] : undefined}
      onClose={onClose}
      footer={order ? actions : undefined}
      widthClassName="lg:w-[600px] xl:w-[720px]"
    >
      {order && (
        <>
          <div>
            <div className="text-[11px] font-medium text-muted-foreground">Order</div>
            <div className="mt-1">
              <OrderSummary order={order} />
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            <Badge
              variant={
                order.status === 'in_transit'
                  ? 'info'
                  : order.status === 'pending_confirmation' || order.status === 'returning'
                    ? 'warning'
                    : 'muted'
              }
            >
              {statusLabel[order.status]}
            </Badge>
            {inTransitMinutes != null && (
              <Badge
                variant={
                  getInTransitElapsedTone(inTransitMinutes) === 'critical'
                    ? 'destructive'
                    : getInTransitElapsedTone(inTransitMinutes) === 'slow'
                      ? 'warning'
                      : 'info'
                }
                className="gap-1"
              >
                <Clock3 className="h-3 w-3" />
                ส่งมาแล้ว {formatElapsedDuration(inTransitMinutes)}
              </Badge>
            )}
            {order.deliveryPlan?.releaseState === 'released' &&
              order.deliveryRoute?.dispatchMode !== 'urgent' && (
                <Badge variant="info">จาก Planning</Badge>
              )}
            {order.deliveryRoute?.dispatchMode === 'urgent' && (
              <Badge variant="info">ส่งทันที</Badge>
            )}
            {driver && <Badge variant="muted">คนขับ: {driver.name}</Badge>}
            {order.coDriverIds && order.coDriverIds.length > 0 && (
              <Badge variant="info">+{order.coDriverIds.length} ร่วมส่ง</Badge>
            )}
            {isDetailLoading && (
              <Badge variant="muted" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                กำลังโหลด
              </Badge>
            )}
          </div>

          <CustomerTrackingQrCard order={order} />

          {!isDetailLoading && order.proofOfDelivery && (
            <ProofOfDeliveryInfo order={order} driverName={driver?.name} />
          )}

          {(order.status === 'returning' ||
            order.status === 'failed' ||
            order.status === 'cancelled' ||
            order.status === 'returned') &&
            order.resolution && <ResolutionInfo order={order} />}

          <div>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">ข้อมูลคนขับ</div>
            <DriverSummary driver={driver} order={order} />
          </div>

          <OrderTimeline order={order} description="กิจกรรมที่เกิดขึ้นกับออเดอร์นี้" compact />
        </>
      )}
    </DetailDrawer>
  );
}
