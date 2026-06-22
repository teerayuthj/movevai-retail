import { useState } from 'react';
import {
  type FailNextAction,
  type FailReason,
  failNextActionLabel,
  failReasonLabel,
} from '@/data/mock';
import { useRetailStore } from '@/state/retailStore';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { DriverCard } from './components/DriverCard';
import { Button } from '@/components/ui/button';
import { upsertRiderAccount } from '@/lib/retailApi';

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

function temporaryPin() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, '0');
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
          const driverOrders = orders.filter(
            (order) =>
              order.assignedDriverId === d.id && ['assigned', 'in_transit'].includes(order.status),
          );

          return (
            <div key={d.id} className="space-y-2">
              <DriverCard
                driver={d}
                driverOrders={driverOrders}
                onSetStatus={setDriverStatus}
                onStartDelivery={startDelivery}
                onCompleteDelivery={completeDelivery}
                onFailDelivery={setFailTargetId}
              />
              <Button
                className="w-full"
                variant="outline"
                size="sm"
                onClick={() => {
                  const phone = window.prompt('เบอร์โทรสำหรับ Rider Login', d.phone)?.trim();
                  if (!phone) return;
                  const pin = temporaryPin();
                  void upsertRiderAccount(d.id, { phone, pin }).then(() => {
                    window.alert(
                      `PIN ชั่วคราวของ ${d.name}: ${pin}\nกรุณาบันทึกตอนนี้ ระบบจะไม่แสดงซ้ำ`,
                    );
                  });
                }}
              >
                สร้าง / รีเซ็ต Rider PIN
              </Button>
            </div>
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
