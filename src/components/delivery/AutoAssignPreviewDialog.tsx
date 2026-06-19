import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import { VehicleIcon } from '@/components/delivery/DeliveryExecutionShared';
import { cn } from '@/lib/utils';
import { formatTHB, type Driver } from '@/data/mock';
import type { AutoAssignProposal } from '@/lib/deliveryExecution';
import { ArrowRight, Check, MapPin, Pause, Sparkles, Users, X } from 'lucide-react';

type Props = {
  open: boolean;
  proposals: AutoAssignProposal[];
  drivers: Driver[];
  onCancel: () => void;
  onConfirm: (orderIds: string[]) => void;
  /** หน่วงเวลานับถอยหลังก่อนจ่ายงานอัตโนมัติ (วินาที) — 0 = ปิด auto, ให้กดยืนยันเอง */
  autoConfirmSeconds?: number;
};

export function AutoAssignPreviewDialog({
  open,
  proposals,
  drivers,
  onCancel,
  onConfirm,
  autoConfirmSeconds = 3,
}: Props) {
  const assignable = useMemo(() => proposals.filter((p) => p.driverId), [proposals]);
  const blocked = useMemo(() => proposals.filter((p) => !p.driverId), [proposals]);
  const driverById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // โหมดนับถอยหลังจ่ายงานอัตโนมัติ — ยกเลิกทันทีเมื่อผู้ใช้แตะอะไรก็ตาม
  const autoEnabled = autoConfirmSeconds > 0 && assignable.length > 0;
  const [counting, setCounting] = useState(false);
  const [remaining, setRemaining] = useState(autoConfirmSeconds);

  useEffect(() => {
    if (open) {
      setSelected(new Set(assignable.map((p) => p.order.id)));
      setCounting(autoEnabled);
      setRemaining(autoConfirmSeconds);
    }
  }, [open, assignable, autoEnabled, autoConfirmSeconds]);

  // ตัวจับเวลา: ลดทีละวินาที พอถึง 0 ก็จ่ายงานทั้งหมดให้เอง
  useEffect(() => {
    if (!open || !counting) return;
    if (remaining <= 0) {
      onConfirm(assignable.map((p) => p.order.id));
      return;
    }
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [open, counting, remaining, assignable, onConfirm]);

  if (!open) return null;

  const stopCountdown = () => setCounting(false);

  const toggle = (orderId: string) => {
    stopCountdown(); // ผู้ใช้เข้ามาแก้เอง → หยุดนับถอยหลัง
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectedCount = selected.size;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              ระบบเลือกคนขับให้อัตโนมัติ
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {assignable.length} ออเดอร์ · จับคู่ทีละใบ (1 ออเดอร์ = คนขับ 1 คน) เรียงตามความสำคัญ
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-auto px-5 py-4">
          {assignable.length === 0 && blocked.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              ไม่มีออเดอร์ที่รอมอบหมายในขณะนี้
            </div>
          )}

          {assignable.map((proposal) => {
            const driver = driverById.get(proposal.driverId!);
            const isOn = selected.has(proposal.order.id);
            if (!driver) return null;

            return (
              <button
                key={proposal.order.id}
                type="button"
                onClick={() => toggle(proposal.order.id)}
                className={cn(
                  'flex w-full items-stretch gap-3 rounded-lg border p-3 text-left transition-colors',
                  isOn ? 'border-primary bg-primary/5' : 'opacity-60 hover:opacity-100',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                    isOn
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {isOn && <Check className="h-3.5 w-3.5" />}
                </span>

                {/* ออเดอร์ */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      #{proposal.rank}
                    </span>
                    <span className="font-mono text-xs font-medium">{proposal.order.code}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {proposal.order.customer.name}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-start gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-1">{proposal.order.customer.address}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-semibold tabular-nums text-warning">
                    {formatTHB(proposal.order.totalValue)}
                  </div>
                </div>

                <ArrowRight className="mt-3 h-4 w-4 shrink-0 self-start text-muted-foreground" />

                {/* คนขับ + เหตุผล */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <DriverAvatar driver={driver} className="h-7 w-7" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{driver.name}</div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <VehicleIcon v={driver.vehicle} />
                        <span className="truncate">{driver.zone}</span>
                      </div>
                    </div>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">
                    {proposal.reasons.map((reason, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-1 text-[11px] text-muted-foreground"
                      >
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}

          {blocked.length > 0 && (
            <div className="mt-3 space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-warning">
                <Users className="h-3.5 w-3.5" />
                จ่ายงานอัตโนมัติไม่ได้ ({blocked.length}) — ต้องมอบหมายเอง
              </div>
              {blocked.map((proposal) => (
                <div
                  key={proposal.order.id}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-medium">{proposal.order.code}</span>
                    <span className="text-muted-foreground">{proposal.order.customer.name}</span>
                  </span>
                  <Badge variant="warning" className="shrink-0 text-[10px]">
                    {proposal.blockedReason}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* แถบนับถอยหลังขณะ auto */}
        {counting && (
          <div className="h-1 w-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${(remaining / autoConfirmSeconds) * 100}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-5 py-3">
          {counting ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              จ่ายงานให้อัตโนมัติใน {remaining} วินาที
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              เลือกจ่ายงาน {selectedCount}/{assignable.length} รายการ
            </span>
          )}

          <div className="flex gap-2">
            {counting ? (
              <>
                <Button variant="outline" size="sm" onClick={stopCountdown}>
                  <Pause className="h-4 w-4" />
                  ตรวจสอบเอง
                </Button>
                <Button size="sm" onClick={() => onConfirm(assignable.map((p) => p.order.id))}>
                  <Sparkles className="h-4 w-4" />
                  จ่ายเลย
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onCancel}>
                  ยกเลิก
                </Button>
                <Button
                  size="sm"
                  disabled={selectedCount === 0}
                  onClick={() => onConfirm(Array.from(selected))}
                >
                  <Sparkles className="h-4 w-4" />
                  ยืนยันจ่ายงาน {selectedCount} รายการ
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
