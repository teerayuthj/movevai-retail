import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { dispatchReadinessLabel, type DispatchReadiness, type Driver } from '@/data/mock';
import { CalendarClock, XCircle } from 'lucide-react';

type PlanSettingsCardProps = {
  drivers: Driver[];
  selectedCount: number;
  planDate: string;
  onPlanDate: (value: string) => void;
  plannedDriverId: string;
  onPlannedDriverId: (value: string) => void;
  readiness: DispatchReadiness;
  onReadiness: (value: DispatchReadiness) => void;
  planNote: string;
  onPlanNote: (value: string) => void;
  onApply: () => void;
  onClearPlans: () => void;
  clearDisabled: boolean;
};

export function PlanSettingsCard({
  drivers,
  selectedCount,
  planDate,
  onPlanDate,
  plannedDriverId,
  onPlannedDriverId,
  readiness,
  onReadiness,
  planNote,
  onPlanNote,
  onApply,
  onClearPlans,
  clearDisabled,
}: PlanSettingsCardProps) {
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
        <div className="grid gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">วันจัดส่งตามแผน</label>
          <DatePicker value={planDate} onChange={onPlanDate} className="w-full" />
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">คนขับตามแผน</label>
          <select
            value={plannedDriverId}
            onChange={(event) => onPlannedDriverId(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">ยังไม่เลือกคนขับ</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} · {driver.zone}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">ความพร้อมสินค้า</label>
          <select
            value={readiness}
            onChange={(event) => onReadiness(event.target.value as DispatchReadiness)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="ready">{dispatchReadinessLabel.ready}</option>
            <option value="awaiting_items">{dispatchReadinessLabel.awaiting_items}</option>
          </select>
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
          <Button variant="outline" onClick={onClearPlans} disabled={clearDisabled}>
            <XCircle className="h-4 w-4" />
            ล้างแผนที่เลือก
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
