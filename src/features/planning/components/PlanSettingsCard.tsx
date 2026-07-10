import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { DriverWorkloadChips } from '@/components/delivery/DeliveryExecutionShared';
import {
  dispatchReadinessLabel,
  type DispatchReadiness,
  type Driver,
  type Order,
} from '@/data/orderTypes';
import { getDriverWorkloadSummary } from '@/lib/deliveryExecution';
import { AlertTriangle, CalendarClock, XCircle } from 'lucide-react';

type PlanSettingsCardProps = {
  drivers: Driver[];
  orders: Order[];
  selectedCount: number;
  planDate: string;
  onPlanDate: (value: string) => void;
  planTime: string;
  onPlanTime: (value: string) => void;
  plannedDriverIds: string[];
  onPlannedDriverIds: (value: string[]) => void;
  readiness: DispatchReadiness;
  onReadiness: (value: DispatchReadiness) => void;
  planNote: string;
  onPlanNote: (value: string) => void;
  onApply: () => void;
  onCancelPlans: () => void;
  cancelDisabled: boolean;
};

export function PlanSettingsCard({
  drivers,
  orders,
  selectedCount,
  planDate,
  onPlanDate,
  planTime,
  onPlanTime,
  plannedDriverIds,
  onPlannedDriverIds,
  readiness,
  onReadiness,
  planNote,
  onPlanNote,
  onApply,
  onCancelPlans,
  cancelDisabled,
}: PlanSettingsCardProps) {
  const selectedDriverWorkloads = plannedDriverIds
    .map((driverId) => drivers.find((driver) => driver.id === driverId))
    .filter((driver): driver is Driver => Boolean(driver))
    .map((driver) => ({
      driver,
      workload: getDriverWorkloadSummary(driver, orders, { plannedDate: planDate }),
    }));
  const selectedDriversWithExistingWork = selectedDriverWorkloads.filter(
    ({ workload }) =>
      workload.waitingToStart > 0 ||
      workload.inTransit > 0 ||
      workload.pendingReview > 0 ||
      workload.returning > 0 ||
      workload.plannedForDate > 0,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">ตั้งค่าแผน</CardTitle>
        <CardDescription>
          {selectedCount > 0
            ? `กำลังแก้ไข ${selectedCount} รายการ`
            : 'เลือก order จากรายการด้านซ้ายก่อน'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <label className="text-[11px] font-medium text-muted-foreground">วันจัดส่งตามแผน</label>
            <DatePicker value={planDate} onChange={onPlanDate} className="w-full" />
          </div>
          <div className="grid gap-2">
            <label className="text-[11px] font-medium text-muted-foreground">เวลาจัดส่ง</label>
            <div className="flex items-center gap-1">
              <input
                type="time"
                value={planTime}
                onChange={(event) => onPlanTime(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              />
              {planTime && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-8 shrink-0 text-muted-foreground"
                  onClick={() => onPlanTime('')}
                  aria-label="ล้างเวลา"
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-medium text-muted-foreground">
              Messenger ที่เลือก
            </label>
            {plannedDriverIds.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={() => onPlannedDriverIds([])}
              >
                ล้าง Messenger
              </Button>
            )}
          </div>
          {selectedDriverWorkloads.length > 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {selectedDriverWorkloads.map(({ driver }) => (
                  <span
                    key={driver.id}
                    className="rounded-md bg-background px-2 py-1 text-xs font-medium shadow-xs"
                  >
                    {driver.name}
                  </span>
                ))}
              </div>
              {selectedDriverWorkloads.length > 1 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  ระบบจะกระจายรายการที่เลือกเป็น Route แยกตาม Messenger
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-[11px] text-muted-foreground">
              เลือกคนขับจากกล่อง “งานคนขับของวัน” ทางซ้าย
            </div>
          )}
        </div>

        {selectedDriversWithExistingWork.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              Messenger ที่เลือกมีงานค้างอยู่
            </div>
            <div className="mt-1 text-[11px] text-warning/90">
              ตรวจสอบลำดับส่งก่อนบันทึกแผนหรือ Publish รอบส่ง
            </div>
            <div className="mt-2 space-y-1.5">
              {selectedDriversWithExistingWork.map(({ driver, workload }) => (
                <div key={driver.id} className="rounded-md bg-background/70 px-2 py-1.5">
                  <div className="font-medium text-foreground">{driver.name}</div>
                  <DriverWorkloadChips
                    workload={workload}
                    plannedLabel="แผนวันนั้น"
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">ความพร้อมสินค้า</label>
          <Select
            value={readiness}
            onChange={(event) => onReadiness(event.target.value as DispatchReadiness)}
            className="h-10"
          >
            <option value="ready">{dispatchReadinessLabel.ready}</option>
            <option value="awaiting_items">{dispatchReadinessLabel.awaiting_items}</option>
            <option value="on_hold">{dispatchReadinessLabel.on_hold}</option>
          </Select>
          {readiness !== 'ready' && (
            <p className="text-[11px] text-warning">
              สถานะนี้จะถูกกันไว้ไม่ให้ Publish จนกว่าจะปรับกลับเป็น “{dispatchReadinessLabel.ready}
              ”
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">หมายเหตุแผน</label>
          <textarea
            value={planNote}
            onChange={(event) => onPlanNote(event.target.value)}
            rows={3}
            placeholder="เช่น รอทองครบ lot ช่วงบ่าย / นัดส่งพร้อมใบกำกับ"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onApply} disabled={selectedCount === 0}>
            <CalendarClock className="h-4 w-4" />
            บันทึกแผน
          </Button>
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/5"
            onClick={onCancelPlans}
            disabled={cancelDisabled}
          >
            <XCircle className="h-4 w-4" />
            ยกเลิกงานที่เลือก
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
