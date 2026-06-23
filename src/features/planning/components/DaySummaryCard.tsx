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
  onHoldCount: number;
  selectedCount: number;
  releasableSelectedCount: number;
  releasableAllCount: number;
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
  onHoldCount,
  selectedCount,
  releasableSelectedCount,
  releasableAllCount,
  onReleaseSelected,
  releaseSelectedDisabled,
  onReleaseAll,
  releaseAllDisabled,
}: DaySummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">
          ภาพรวมทั้งวัน · {formatPlanningDate(selectedDate)}
        </CardTitle>
        <CardDescription>
          ตัวเลขส่วนนี้รวมทุก order ของวันที่เลือก ไม่ใช่เฉพาะงานที่เลือกอยู่
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-info/30 bg-info/5 px-3 py-2.5 text-xs">
          <div className="font-medium text-info">กำลังเลือก {selectedCount} รายการ</div>
          <div className="mt-0.5 text-muted-foreground">
            {selectedCount === 0
              ? 'เลือก order จากรายการก่อน Publish'
              : releasableSelectedCount === selectedCount
                ? `ปุ่ม Publish เฉพาะที่เลือกจะส่ง ${releasableSelectedCount} รายการนี้เท่านั้น`
                : `พร้อม Publish ${releasableSelectedCount} จาก ${selectedCount} รายการที่เลือก`}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-[11px] text-muted-foreground">งานทั้งหมดของวันที่เลือก</div>
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
          <div
            className={
              awaitingItemsCount > 0
                ? 'rounded-xl border border-warning/40 bg-warning/10 p-3'
                : 'rounded-xl border bg-muted/20 p-3'
            }
          >
            <div className="text-[11px] text-muted-foreground">รอสินค้ามาครบ</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{awaitingItemsCount}</div>
          </div>
          <div
            className={
              onHoldCount > 0
                ? 'rounded-xl border border-warning/40 bg-warning/10 p-3'
                : 'rounded-xl border bg-muted/20 p-3'
            }
          >
            <div className="text-[11px] text-muted-foreground">พักงานไว้ก่อน</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{onHoldCount}</div>
          </div>
        </div>

        {awaitingItemsCount + onHoldCount > 0 && (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            งานที่รอสินค้ามาครบหรือพักไว้ ยัง Publish ไม่ได้ ต้องเปลี่ยนเป็น “พร้อมปล่อยงาน” ก่อน
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onReleaseSelected} disabled={releaseSelectedDisabled}>
            <Route className="h-4 w-4" />
            Publish เฉพาะที่เลือก ({releasableSelectedCount})
          </Button>
          <Button variant="outline" onClick={onReleaseAll} disabled={releaseAllDisabled}>
            <Truck className="h-4 w-4" />
            Publish งานพร้อมทั้งหมด ({releasableAllCount})
          </Button>
        </div>

        <div className="rounded-xl border bg-background px-3 py-2 text-xs text-muted-foreground">
          {isToday
            ? 'งานวันนี้จะเริ่มได้ทันทีหลัง Publish'
            : `Rider จะเห็นงานวันที่ ${formatPlanningDate(selectedDate)} ล่วงหน้า แต่เริ่มงานก่อนวันไม่ได้`}
        </div>
      </CardContent>
    </Card>
  );
}
