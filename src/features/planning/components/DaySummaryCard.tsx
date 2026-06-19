import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPlanningDate } from '@/lib/deliveryPlanning';
import { Route, Truck } from 'lucide-react';

type DaySummaryCardProps = {
  selectedDate: string;
  isToday: boolean;
  plannedCount: number;
  assignedCount: number;
  unassignedCount: number;
  awaitingItemsCount: number;
  onReleaseSelected: () => void;
  releaseSelectedDisabled: boolean;
  onReleaseAll: () => void;
  releaseAllDisabled: boolean;
};

export function DaySummaryCard({
  selectedDate,
  isToday,
  plannedCount,
  assignedCount,
  unassignedCount,
  awaitingItemsCount,
  onReleaseSelected,
  releaseSelectedDisabled,
  onReleaseAll,
  releaseAllDisabled,
}: DaySummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">สรุปของวันที่ {formatPlanningDate(selectedDate)}</CardTitle>
        <CardDescription>
          ดู load ของวันนั้นและปล่อยงานเข้าคิวจริงเมื่อถึงวันปฏิบัติงาน
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">ตามแผนทั้งหมด</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{plannedCount}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">มีคนขับแล้ว</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{assignedCount}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">ยังไม่เลือกคนขับ</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{unassignedCount}</div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">รอสินค้ามาครบ</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{awaitingItemsCount}</div>
          </div>
        </div>

        {awaitingItemsCount > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            งานที่รอสินค้ามาครบยังปล่อยเข้าคิวได้ แต่ควรตรวจของก่อนปล่อยงานจริง
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onReleaseSelected} disabled={releaseSelectedDisabled}>
            <Route className="h-4 w-4" />
            ปล่อยที่เลือกเข้าคิว
          </Button>
          <Button variant="outline" onClick={onReleaseAll} disabled={releaseAllDisabled}>
            <Truck className="h-4 w-4" />
            ปล่อยทั้งหมดของวันนี้
          </Button>
        </div>

        <div className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
          {isToday
            ? 'วันนี้สามารถปล่อยแผนเข้าคิวจริงได้'
            : `จะปล่อยเข้าคิวได้เมื่อถึงวันที่ ${formatPlanningDate(selectedDate)}`}
        </div>
      </CardContent>
    </Card>
  );
}
