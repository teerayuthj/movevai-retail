import { useEffect, useState } from 'react';
import { Ban, CalendarClock, FileSpreadsheet, MapPin, RotateCcw, Undo2, Zap } from 'lucide-react';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import { LineOrderSource } from '@/components/LineOrderSource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  cancelReasonLabel,
  formatTHB,
  planningCancelReasonLabel,
  type CancelReason,
} from '@/data/orderTypes';
import type {
  ReturnedDeliveryCenterGroup,
  ReturnedDeliveryCenterOrder,
} from '@/features/delivery-workspace/returnedDeliveryCenterOrders';
import { hasCsvImportSource } from '@/lib/orderSourceLink';
import { shortRouteCode } from '@/lib/routeCode';
import { cn } from '@/lib/utils';

type ReturnResolution = 'replan' | 'immediate' | 'awaiting_decision';

type Props = {
  groups: ReturnedDeliveryCenterGroup[];
  canImmediate: boolean;
  canPlanning: boolean;
  onResolve: (item: ReturnedDeliveryCenterOrder, resolution: ReturnResolution) => Promise<void>;
  onCancel: (
    item: ReturnedDeliveryCenterOrder,
    reason: CancelReason,
    note?: string,
  ) => Promise<void>;
};

const cancelReasons = (Object.keys(cancelReasonLabel) as CancelReason[]).map((value) => ({
  value,
  label: cancelReasonLabel[value],
}));

function formatReturnedAt(value?: string) {
  if (!value) return 'ไม่พบเวลาที่ดึงกลับ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

export function ReturnedDeliveryCenterOrders({
  groups,
  canImmediate,
  canPlanning,
  onResolve,
  onCancel,
}: Props) {
  const items = groups.flatMap((group) => group.orders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(items[0]?.order.id ?? null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedOrderId && items.some((item) => item.order.id === selectedOrderId)) return;
    setSelectedOrderId(items[0]?.order.id ?? null);
  }, [items, selectedOrderId]);

  const selected = items.find((item) => item.order.id === selectedOrderId) ?? items[0] ?? null;

  const runAction = async (action: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success">
            <RotateCcw className="h-5 w-5" />
          </span>
          <div className="font-medium">ไม่มี Order ที่รอจัดการหลังดึง Route กลับ</div>
          <p className="max-w-lg text-sm text-muted-foreground">
            งานจาก LINE/CSV ที่ถูกถอนออกจาก Route จะแสดงที่นี่ ส่วนเที่ยวที่สร้างเองจะกลับไป Route
            Builder
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="rounded-xl border border-info/25 bg-info/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Order ต้นฉบับที่ถูกดึงกลับจากรอบ</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              จัดกลุ่มตาม Route เดิมเพื่อดูบริบท แต่เลือกดำเนินการเป็นราย Order และคงข้อมูลจาก
              LINE/CSV เดิมทั้งหมด
            </p>
          </div>
          <Badge variant="warning" className="shrink-0">
            {items.length} งาน
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm">งานที่ต้องจัดใหม่</CardTitle>
                <CardDescription>{groups.length} รอบเดิม · ล่าสุดอยู่ด้านบน</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((group) => (
              <section key={group.id}>
                <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    รอบเดิม <span className="font-mono">{shortRouteCode(group.routeCode)}</span>
                  </span>
                  <span>{group.orders.length} งาน</span>
                </div>
                <div className="space-y-2">
                  {group.orders.map((item) => {
                    const order = item.order;
                    const active = order.id === selected?.order.id;
                    return (
                      <button
                        key={order.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedOrderId(order.id)}
                        className={cn(
                          'w-full rounded-xl border p-3 text-left transition-all',
                          active
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'bg-card hover:border-primary/40',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs font-medium">
                            {order.orderNo ?? order.code}
                          </span>
                          {hasCsvImportSource(order) ? (
                            <Badge variant="warning" className="h-5 gap-1 px-1.5 text-[10px]">
                              <FileSpreadsheet className="h-3 w-3" /> CSV
                            </Badge>
                          ) : (
                            <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                              LINE
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm font-medium">
                          {order.customer.name}
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {item.reason
                            ? planningCancelReasonLabel[item.reason]
                            : 'ดึง Route กลับเพื่อจัดใหม่'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="font-mono text-sm">
                      {selected.order.orderNo ?? selected.order.code}
                    </CardTitle>
                    <CopyOrderNoButton orderNo={selected.order.orderNo} />
                    <Badge variant="warning">ดึงกลับ</Badge>
                  </div>
                  <CardDescription className="mt-1">{selected.order.customer.name}</CardDescription>
                  <LineOrderSource order={selected.order} className="mt-1" />
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  <div>{formatReturnedAt(selected.returnedAt)}</div>
                  <div className="mt-1 font-medium text-warning">
                    {formatTHB(selected.order.totalValue)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{selected.order.customer.address}</span>
              </div>

              <dl className="grid gap-3 rounded-xl border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">ดึงกลับจากรอบ</dt>
                  <dd className="mt-0.5 font-mono font-medium">
                    {shortRouteCode(selected.routeCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Messenger เดิม</dt>
                  <dd className="mt-0.5 font-medium">{selected.driverName ?? 'ไม่พบข้อมูล'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">เหตุผล</dt>
                  <dd className="mt-0.5 font-medium">
                    {selected.reason
                      ? planningCancelReasonLabel[selected.reason]
                      : 'ดึง Route กลับเพื่อจัดใหม่'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">หมายเหตุ</dt>
                  <dd className="mt-0.5 font-medium">{selected.note || '—'}</dd>
                </div>
              </dl>

              <section>
                <div className="mb-2 text-xs font-medium text-muted-foreground">สินค้า</div>
                <div className="text-sm">
                  {selected.order.items.map((item) => `${item.name} × ${item.qty}`).join(', ')}
                </div>
              </section>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="border-t pt-4">
                <div className="mb-2 text-xs text-muted-foreground">
                  เลือกสิ่งที่จะทำกับ Order นี้
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={saving || !canPlanning}
                    onClick={() => void runAction(() => onResolve(selected, 'replan'))}
                  >
                    <CalendarClock className="h-4 w-4" /> จัดรอบใหม่
                  </Button>
                  <Button
                    variant="outline"
                    disabled={saving || !canImmediate}
                    onClick={() => void runAction(() => onResolve(selected, 'immediate'))}
                  >
                    <Zap className="h-4 w-4" /> ส่งทันที
                  </Button>
                  <Button
                    variant="outline"
                    disabled={saving}
                    onClick={() => void runAction(() => onResolve(selected, 'awaiting_decision'))}
                  >
                    <Undo2 className="h-4 w-4" /> กลับไปรอตัดสินใจ
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={saving}
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelOpen(true)}
                  >
                    <Ban className="h-4 w-4" /> ยกเลิก Order
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {selected && (
        <ResolutionDialog
          open={cancelOpen}
          title={`ยกเลิก ${selected.order.orderNo ?? selected.order.code}`}
          description="ยกเลิกเฉพาะ Order นี้ โดยไม่กระทบงานอื่นจาก Route เดิม"
          reasons={cancelReasons}
          noteLabel="หมายเหตุ (ไม่บังคับ)"
          confirmLabel="ยืนยันยกเลิก Order"
          confirmVariant="destructive"
          error={error}
          onCancel={() => setCancelOpen(false)}
          onConfirm={({ reason, note }) => {
            void runAction(async () => {
              await onCancel(selected, reason, note);
              setCancelOpen(false);
            });
          }}
        />
      )}
    </>
  );
}
