import { useEffect, useState } from 'react';
import { Navigation2, Users, X } from 'lucide-react';
import { DriverAvatar } from '@/components/DriverAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Driver, Order } from '@/data/orderTypes';
import { formatDriverActiveJobs } from '@/lib/deliveryExecution';
import { cn } from '@/lib/utils';

const MAX_ROUTE_DRIVERS = 4;

type Props = {
  open: boolean;
  title: string;
  description?: string;
  error?: string;
  drivers: Driver[];
  orders: Order[];
  initialDriverIds: string[];
  onCancel: () => void;
  onConfirm: (input: { driverCode: string; coDriverCodes: string[]; note?: string }) => void;
};

/** แก้ทีมจัดส่งของ Route — ลำดับแรกคือคนขับหลัก ที่เหลือเป็นคนขับร่วม */
export function ReassignRouteDialog({
  open,
  title,
  description,
  error,
  drivers,
  orders,
  initialDriverIds,
  onCancel,
  onConfirm,
}: Props) {
  const initialDriverKey = initialDriverIds.join('|');
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [selectionError, setSelectionError] = useState('');

  useEffect(() => {
    if (!open) return;
    const initialIds = initialDriverKey
      .split('|')
      .filter((id) => id && drivers.some((driver) => driver.id === id));
    setSelectedDriverIds([...new Set(initialIds)].slice(0, MAX_ROUTE_DRIVERS));
    setNote('');
    setSelectionError('');
  }, [open, initialDriverKey, drivers]);

  if (!open) return null;

  const toggleDriver = (driver: Driver) => {
    setSelectedDriverIds((current) => {
      if (current.includes(driver.id)) {
        setSelectionError('');
        return current.filter((id) => id !== driver.id);
      }
      if (driver.status === 'off_duty') return current;
      if (current.length >= MAX_ROUTE_DRIVERS) {
        setSelectionError(`เลือกทีมจัดส่งได้สูงสุด ${MAX_ROUTE_DRIVERS} คน`);
        return current;
      }
      setSelectionError('');
      return [...current, driver.id];
    });
  };

  const setAsPrimary = (driverId: string) => {
    setSelectedDriverIds((current) => [driverId, ...current.filter((id) => id !== driverId)]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[min(90vh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
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

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium text-muted-foreground">
              <span>ทีมคนขับใหม่</span>
              <span>เลือกได้สูงสุด {MAX_ROUTE_DRIVERS} คน</span>
            </div>
            <div className="grid gap-1.5">
              {drivers.map((driver) => {
                const rank = selectedDriverIds.indexOf(driver.id);
                const selected = rank !== -1;
                const isPrimary = rank === 0;
                const disabled = driver.status === 'off_duty' && !selected;
                return (
                  <div
                    key={driver.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 transition-colors',
                      selected
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:bg-muted/60',
                      disabled && 'opacity-50',
                    )}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleDriver(driver)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          selected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40',
                        )}
                      >
                        {selected && <span className="text-[10px] leading-none">✓</span>}
                      </span>
                      <DriverAvatar driver={driver} className="h-9 w-9" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{driver.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {driver.phone} · {formatDriverActiveJobs(driver, orders)}
                        </span>
                      </span>
                    </button>
                    {isPrimary ? (
                      <Badge variant="info" className="shrink-0 gap-1">
                        <Navigation2 className="h-3 w-3" />
                        คนขับหลัก
                      </Badge>
                    ) : selected ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant="muted" className="gap-1">
                          <Users className="h-3 w-3" />
                          คนขับร่วม
                        </Badge>
                        <button
                          type="button"
                          className="text-[10px] text-primary hover:underline"
                          onClick={() => setAsPrimary(driver.id)}
                        >
                          ตั้งเป็นหลัก
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {(selectionError || selectedDriverIds.length === 0) && (
              <p className="mt-1.5 text-[11px] text-destructive">
                {selectionError || 'กรุณาเลือกคนขับหลักอย่างน้อย 1 คน'}
              </p>
            )}
            {selectedDriverIds.length > 1 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                คนขับหลักเป็นผู้เริ่มและปิดงาน ส่วนคนขับร่วมจะเห็นงานบนมือถือของตนเอง
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น ปรับทีมจัดส่งให้เหมาะกับสินค้า"
              className="mt-1"
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            disabled={selectedDriverIds.length === 0}
            onClick={() => {
              const [driverCode, ...coDriverCodes] = selectedDriverIds;
              if (!driverCode) return;
              onConfirm({
                driverCode,
                coDriverCodes,
                note: note.trim() || undefined,
              });
            }}
          >
            ยืนยันเปลี่ยนทีม
          </Button>
        </div>
      </div>
    </div>
  );
}
