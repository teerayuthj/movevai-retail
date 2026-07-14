import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Play,
  Plus,
  Timer,
  Trash2,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Driver } from '@/data/orderTypes';
import { RouteStopsMap } from '@/features/dispatch/components/RouteStopsMap';
import { FreeRouteBuilderPreview } from '@/features/dispatch/components/FreeRouteBuilderPreview';
import {
  getRoutePickupTasks,
  stopsForSelectedPickupTasks,
} from '@/features/dispatch/routeTemplateStops';
import type {
  DispatchStartPolicy,
  RouteRunDispatchMode,
  RouteStop,
  RouteStopKind,
  RouteTemplate,
} from '@/features/dispatch/types';
import {
  createRouteTemplate,
  createRouteTemplateRun,
  deleteRouteTemplate,
  fetchRouteTemplates,
  geocodeAddress,
  updateRouteTemplate,
} from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';

type Props = { onOpenDispatch: (search?: string) => void };

const WEEKDAYS = [
  { value: 1, label: 'จ' },
  { value: 2, label: 'อ' },
  { value: 3, label: 'พ' },
  { value: 4, label: 'พฤ' },
  { value: 5, label: 'ศ' },
  { value: 6, label: 'ส' },
  { value: 0, label: 'อา' },
];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function weekdayLabel(days: number[]) {
  if (EVERY_DAY.every((day) => days.includes(day)) && days.length === 7) return 'ทุกวัน';
  if ([1, 2, 3, 4, 5].every((day) => days.includes(day)) && days.length === 5) return 'จ–ศ';
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(', ');
}

function newStopId() {
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `stop-${uuid}`;
}

function bangkokDateKey(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

function runDateLabel(offsetDays: number) {
  const text = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.now() + offsetDays * 86_400_000));
  return offsetDays === 0 ? `วันนี้ (${text})` : `พรุ่งนี้ (${text})`;
}

function stopCounts(stops: RouteStop[]) {
  const pickups = stops.filter((stop) => stop.kind === 'pickup').length;
  return { pickups, dropoffs: stops.length - pickups };
}

// กติกาเดียวกับ backend: จุดรับทุกจุดต้องชี้จุดส่งที่อยู่ "หลัง" ตัวเอง
// และจุดส่งทุกจุดต้องมีของชี้เข้าอย่างน้อย 1 ชิ้น
function validateStops(stops: RouteStop[]): string | null {
  if (stops.length < 2) return 'ต้องมีจุดแวะอย่างน้อย 2 จุด (รับ 1 + ส่ง 1)';
  for (const [index, stop] of stops.entries()) {
    if (!stop.name.trim() || !stop.address.trim())
      return `จุดที่ ${index + 1}: กรุณาระบุชื่อสถานที่และที่อยู่`;
  }
  if (!stops.some((stop) => stop.kind === 'pickup')) return 'ต้องมีจุดรับอย่างน้อย 1 จุด';
  if (!stops.some((stop) => stop.kind === 'dropoff')) return 'ต้องมีจุดส่งอย่างน้อย 1 จุด';
  const indexById = new Map(stops.map((stop, index) => [stop.id, index]));
  for (const [index, stop] of stops.entries()) {
    if (stop.kind === 'pickup') {
      if (!stop.deliverToStopId)
        return `จุดที่ ${index + 1} (${stop.name}): ยังไม่ระบุว่าส่งที่จุดไหน`;
      const target = indexById.get(stop.deliverToStopId);
      if (target === undefined || stops[target].kind !== 'dropoff')
        return `จุดที่ ${index + 1} (${stop.name}): จุดส่งปลายทางไม่ถูกต้อง`;
      if (target <= index)
        return `จุดที่ ${index + 1} (${stop.name}): จุดส่งต้องอยู่หลังจุดรับในลำดับวิ่ง`;
    } else if (
      !stops.some((other) => other.kind === 'pickup' && other.deliverToStopId === stop.id)
    ) {
      return `จุดที่ ${index + 1} (${stop.name}): เป็นจุดส่งที่ไม่มีของจากจุดรับใดชี้เข้า`;
    }
  }
  return null;
}

function StopKindBadge({ kind }: { kind: RouteStopKind }) {
  return kind === 'pickup' ? (
    <Badge className="border-info/30 bg-info/10 text-info" variant="outline">
      รับ
    </Badge>
  ) : (
    <Badge className="border-success/30 bg-success/10 text-success" variant="outline">
      ส่ง
    </Badge>
  );
}

function StopOrderCircle({ order, kind }: { order: number; kind: RouteStopKind }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${kind === 'pickup' ? 'bg-info' : 'bg-success'}`}
    >
      {order}
    </span>
  );
}

function PickupTaskText({
  pickupName,
  dropoffName,
  className = '',
}: {
  pickupName: string;
  dropoffName: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <span className="truncate text-info">รับ {pickupName || '(ยังไม่มีชื่อ)'}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate text-success">ส่ง {dropoffName || '(ยังไม่มีชื่อ)'}</span>
    </span>
  );
}

type GeoStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error';

function StopGeoIndicator({
  status,
  hasGeo,
  onLocate,
}: {
  status: GeoStatus;
  hasGeo: boolean;
  onLocate: () => void;
}) {
  if (status === 'loading')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> กำลังค้นหาพิกัด…
      </span>
    );
  if (hasGeo)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-success">
        <CheckCircle2 className="h-3 w-3" /> ปักหมุดแล้ว
      </span>
    );
  if (status === 'not_found' || status === 'error')
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-warning">
        <AlertCircle className="h-3 w-3" />
        {status === 'not_found' ? 'หาพิกัดไม่เจอ — ระบุย่าน/เขตให้ชัดขึ้น' : 'ค้นหาพิกัดไม่สำเร็จ'}
        <button type="button" className="underline" onClick={onLocate}>
          ลองอีกครั้ง
        </button>
      </span>
    );
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-[11px] text-info underline"
      onClick={onLocate}
    >
      <MapPin className="h-3 w-3" /> ค้นหาพิกัดจากที่อยู่
    </button>
  );
}

function TemplateDialog({
  open,
  template,
  drivers,
  onClose,
  onSave,
}: {
  open: boolean;
  template: RouteTemplate | null;
  drivers: Driver[];
  onClose: () => void;
  onSave: (template: Omit<RouteTemplate, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}) {
  const [routeGroup, setRouteGroup] = useState('');
  const [name, setName] = useState('');
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [geoStatus, setGeoStatus] = useState<Record<string, GeoStatus>>({});
  const [weekdays, setWeekdays] = useState<number[]>(EVERY_DAY);
  const [plannedTime, setPlannedTime] = useState('');
  const [defaultDriverId, setDefaultDriverId] = useState('');
  const [acceptWithinMinutes, setAcceptWithinMinutes] = useState(15);
  const [startWithinMinutes, setStartWithinMinutes] = useState(10);
  const [startPolicy, setStartPolicy] = useState<DispatchStartPolicy>('manual');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRouteGroup(template?.routeGroup ?? '');
    setName(template?.name ?? '');
    if (template) {
      setStops(template.stops.map((stop) => ({ ...stop })));
    } else {
      const dropoffId = newStopId();
      setStops([
        { id: newStopId(), kind: 'pickup', name: '', address: '', deliverToStopId: dropoffId },
        { id: dropoffId, kind: 'dropoff', name: '', address: '' },
      ]);
    }
    setGeoStatus({});
    setWeekdays(template?.weekdays ?? EVERY_DAY);
    setPlannedTime(template?.plannedTime ?? '');
    setDefaultDriverId(template?.defaultDriverId ?? '');
    setAcceptWithinMinutes(template?.acceptWithinMinutes ?? 15);
    setStartWithinMinutes(template?.startWithinMinutes ?? 10);
    setStartPolicy(template?.startPolicy ?? 'manual');
  }, [open, template]);

  const dropoffOptions = useMemo(
    () =>
      stops
        .map((stop, index) => ({ stop, index }))
        .filter((entry) => entry.stop.kind === 'dropoff'),
    [stops],
  );
  const pickupTasks = useMemo(() => getRoutePickupTasks(stops), [stops]);

  if (!open) return null;

  const patchStop = (stopId: string, patch: Partial<RouteStop>) => {
    setStops((current) =>
      current.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop)),
    );
  };

  const changeKind = (stopId: string, kind: RouteStopKind) => {
    setStops((current) => {
      return current.map((stop) => {
        if (stop.id === stopId) {
          if (kind === 'dropoff') return { ...stop, kind, deliverToStopId: undefined };
          // ไม่เดาปลายทางให้เอง — admin เป็นผู้เลือกความสัมพันธ์รับ → ส่งทุกครั้ง
          return { ...stop, kind, deliverToStopId: undefined };
        }
        // จุดที่เคยชี้เข้าจุดนี้ตอนมันเป็นจุดส่ง ต้องหลุดเมื่อมันกลายเป็นจุดรับ
        if (kind === 'pickup' && stop.deliverToStopId === stopId)
          return { ...stop, deliverToStopId: undefined };
        return stop;
      });
    });
  };

  const moveStop = (stopId: string, direction: -1 | 1) => {
    setStops((current) => {
      const index = current.findIndex((stop) => stop.id === stopId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeStop = (stopId: string) => {
    setStops((current) =>
      current
        .filter((stop) => stop.id !== stopId)
        .map((stop) =>
          stop.deliverToStopId === stopId ? { ...stop, deliverToStopId: undefined } : stop,
        ),
    );
  };

  const addStop = (kind: RouteStopKind) => {
    setStops((current) => [...current, { id: newStopId(), kind, name: '', address: '' }]);
  };

  const addPickupDropoffPair = () => {
    const dropoffId = newStopId();
    setStops((current) => [
      ...current,
      { id: newStopId(), kind: 'pickup', name: '', address: '', deliverToStopId: dropoffId },
      { id: dropoffId, kind: 'dropoff', name: '', address: '' },
    ]);
  };

  const locateStop = async (stop: RouteStop) => {
    const address = stop.address.trim();
    if (!address) return;
    setGeoStatus((current) => ({ ...current, [stop.id]: 'loading' }));
    try {
      const coords = await geocodeAddress(address);
      patchStop(stop.id, { lat: coords?.lat, lng: coords?.lng });
      setGeoStatus((current) => ({ ...current, [stop.id]: coords ? 'found' : 'not_found' }));
    } catch {
      setGeoStatus((current) => ({ ...current, [stop.id]: 'error' }));
    }
  };

  const save = async () => {
    if (!routeGroup.trim() || !name.trim()) return toast.error('กรุณาระบุสายและชื่อสาย');
    const cleaned = stops.map((stop) => ({
      ...stop,
      name: stop.name.trim(),
      contact: stop.kind === 'pickup' ? stop.contact?.trim() || undefined : undefined,
      phone: stop.phone?.trim() || undefined,
      address: stop.address.trim(),
      deliverToStopId: stop.kind === 'pickup' ? stop.deliverToStopId : undefined,
    }));
    const stopError = validateStops(cleaned);
    if (stopError) return toast.error(stopError);
    if (weekdays.length === 0) return toast.error('กรุณาเลือกวันที่ต้องวิ่ง');
    setSaving(true);
    try {
      await onSave({
        routeGroup: routeGroup.trim(),
        name: name.trim(),
        stops: cleaned,
        weekdays,
        plannedTime: plannedTime || undefined,
        defaultDriverId: defaultDriverId || undefined,
        jobType: 'document',
        acceptWithinMinutes,
        startWithinMinutes,
        startPolicy,
        active: template?.active ?? true,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="app-scroll max-h-[95dvh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border bg-background shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{template ? 'แก้สายวิ่ง' : 'สร้างสายวิ่ง'}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              จัดลำดับจุดแวะเอง — แต่ละจุดเลือกได้ว่ารับหรือส่ง
              และจุดรับทุกจุดต้องระบุว่าส่งที่จุดไหน
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
            <span className="sr-only">ปิด</span>
          </Button>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              สาย / กลุ่ม
              <Input
                className="mt-1"
                value={routeGroup}
                onChange={(event) => setRouteGroup(event.target.value)}
                placeholder="เช่น รังสิต"
              />
            </label>
            <label className="text-xs font-medium">
              ชื่อสาย
              <Input
                className="mt-1"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="เช่น สายรังสิต"
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">ลำดับจุดแวะ</div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" size="sm" onClick={addPickupDropoffPair}>
                    <Plus className="h-3.5 w-3.5" /> คู่รับ → ส่ง
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addStop('pickup')}
                  >
                    <Plus className="h-3.5 w-3.5" /> จุดรับ
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addStop('dropoff')}
                  >
                    <Plus className="h-3.5 w-3.5" /> จุดส่ง
                  </Button>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-info/20 bg-info/5 p-2.5">
                <div className="text-[11px] font-medium text-muted-foreground">
                  งานรับ → ส่งที่กำหนดแล้ว {pickupTasks.length} คู่
                </div>
                {pickupTasks.length > 0 ? (
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {pickupTasks.map((task) => (
                      <PickupTaskText
                        key={task.pickup.id}
                        pickupName={`จุด ${task.pickupIndex + 1} ${task.pickup.name}`}
                        dropoffName={`จุด ${task.dropoffIndex + 1} ${task.dropoff.name}`}
                        className="rounded-md bg-background px-2 py-1 text-[11px]"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-[11px] text-warning">
                    ยังไม่มีคู่ที่สมบูรณ์ — ที่จุดรับ ให้เลือกช่อง “ส่งที่” อย่างชัดเจน
                  </p>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {stops.map((stop, index) => (
                  <section key={stop.id} className="rounded-xl border p-3">
                    <div className="flex items-center gap-2">
                      <StopOrderCircle order={index + 1} kind={stop.kind} />
                      <Select
                        containerClassName="w-24"
                        value={stop.kind}
                        onChange={(event) =>
                          changeKind(stop.id, event.target.value as RouteStopKind)
                        }
                      >
                        <option value="pickup">รับ</option>
                        <option value="dropoff">ส่ง</option>
                      </Select>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === 0}
                          onClick={() => moveStop(stop.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                          <span className="sr-only">เลื่อนขึ้น</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={index === stops.length - 1}
                          onClick={() => moveStop(stop.id, 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                          <span className="sr-only">เลื่อนลง</span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeStop(stop.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">ลบจุดนี้</span>
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="text-[11px] font-medium">
                        ชื่อสถานที่ / บริษัท
                        <Input
                          className="mt-1"
                          value={stop.name}
                          onChange={(event) => patchStop(stop.id, { name: event.target.value })}
                        />
                      </label>
                      {stop.kind === 'pickup' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[11px] font-medium">
                            ผู้ติดต่อ
                            <Input
                              className="mt-1"
                              value={stop.contact ?? ''}
                              onChange={(event) =>
                                patchStop(stop.id, { contact: event.target.value })
                              }
                            />
                          </label>
                          <label className="text-[11px] font-medium">
                            เบอร์โทร
                            <Input
                              className="mt-1"
                              value={stop.phone ?? ''}
                              onChange={(event) =>
                                patchStop(stop.id, { phone: event.target.value })
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="text-[11px] font-medium">
                          เบอร์โทร (ถ้ามี)
                          <Input
                            className="mt-1"
                            value={stop.phone ?? ''}
                            onChange={(event) => patchStop(stop.id, { phone: event.target.value })}
                          />
                        </label>
                      )}
                      <label className="text-[11px] font-medium sm:col-span-2">
                        ที่อยู่
                        <Input
                          className="mt-1"
                          value={stop.address}
                          onChange={(event) =>
                            // ที่อยู่เปลี่ยน = พิกัดเดิมใช้ไม่ได้แล้ว
                            patchStop(stop.id, {
                              address: event.target.value,
                              lat: undefined,
                              lng: undefined,
                            })
                          }
                          onBlur={() => {
                            if (stop.address.trim() && stop.lat === undefined)
                              void locateStop(stop);
                          }}
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <StopGeoIndicator
                        status={geoStatus[stop.id] ?? 'idle'}
                        hasGeo={stop.lat !== undefined && stop.lng !== undefined}
                        onLocate={() => void locateStop(stop)}
                      />
                      {stop.kind === 'pickup' && (
                        <label className="flex items-center gap-1.5 text-[11px] font-medium">
                          ส่งที่
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Select
                            containerClassName="w-52"
                            value={stop.deliverToStopId ?? ''}
                            onChange={(event) =>
                              patchStop(stop.id, {
                                deliverToStopId: event.target.value || undefined,
                              })
                            }
                          >
                            <option value="">— เลือกจุดส่ง —</option>
                            {dropoffOptions.map((entry) => (
                              <option
                                key={entry.stop.id}
                                value={entry.stop.id}
                                disabled={entry.index <= index}
                              >
                                จุด {entry.index + 1} — {entry.stop.name || '(ยังไม่มีชื่อ)'}
                                {entry.index <= index ? ' · อยู่ก่อนจุดนี้' : ''}
                              </option>
                            ))}
                          </Select>
                        </label>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <div className="lg:sticky lg:top-20 lg:self-start">
              <div className="text-xs font-medium">แผนที่เส้นทางที่ messenger ต้องวิ่ง</div>
              <RouteStopsMap stops={stops} className="mt-2 h-72" />
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-info" /> จุดรับ
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-success" /> จุดส่ง
                </span>
                <span>เส้นประ = ลำดับวิ่งตามที่จัดไว้</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium">วันที่ต้องวิ่ง</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={weekdays.includes(day.value)}
                    onChange={() =>
                      setWeekdays((current) =>
                        current.includes(day.value)
                          ? current.filter((value) => value !== day.value)
                          : [...current, day.value],
                      )
                    }
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              เวลาออก
              <Input
                type="time"
                className="mt-1"
                value={plannedTime}
                onChange={(event) => setPlannedTime(event.target.value)}
              />
              <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                เว้นว่างได้ หากไม่มีเวลาออกที่ fix
              </span>
            </label>
            <label className="text-xs font-medium">
              คนขับประจำ
              <Select
                className="mt-1"
                value={defaultDriverId}
                onChange={(event) => setDefaultDriverId(event.target.value)}
              >
                <option value="">เลือกตอนสั่งวิ่ง</option>
                {drivers
                  .filter((driver) => driver.status !== 'off_duty')
                  .map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
              </Select>
            </label>
            <label className="text-xs font-medium">
              ต้องรับงานภายใน
              <Select
                className="mt-1"
                value={acceptWithinMinutes}
                onChange={(event) => setAcceptWithinMinutes(Number(event.target.value))}
              >
                {[5, 10, 15, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} นาที
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium">
              ต้องเริ่มภายใน
              <Select
                className="mt-1"
                value={startWithinMinutes}
                onChange={(event) => setStartWithinMinutes(Number(event.target.value))}
              >
                {[5, 10, 15, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} นาทีหลังรับ
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium sm:col-span-2">
              วิธีเริ่มงาน
              <Select
                className="mt-1"
                value={startPolicy}
                onChange={(event) => setStartPolicy(event.target.value as DispatchStartPolicy)}
              >
                <option value="manual">Messenger กดรับ แล้วกดเริ่มเอง</option>
                <option value="accept_starts">กดรับแล้วเริ่มทันที</option>
              </Select>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึกสายวิ่ง'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function driverStatusLabel(driver: Driver) {
  if (driver.status === 'available') return 'ว่าง';
  if (driver.status === 'on_delivery')
    return driver.activeOrders > 0 ? `กำลังส่ง ${driver.activeOrders} งาน` : 'กำลังส่งงาน';
  return 'พักงาน';
}

function RunPanel({
  template,
  drivers,
  onDone,
}: {
  template: RouteTemplate;
  drivers: Driver[];
  onDone: () => void;
}) {
  const [dateOffset, setDateOffset] = useState(0);
  const [driverId, setDriverId] = useState(template.defaultDriverId ?? '');
  const [mode, setMode] = useState<RouteRunDispatchMode>('immediate');
  const [selectedPickupStopIds, setSelectedPickupStopIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDriverId(template.defaultDriverId ?? '');
    setDateOffset(0);
    // จงใจไม่เลือกทั้งหมดให้เอง — admin ต้องยืนยันงานของเที่ยวนี้
    setSelectedPickupStopIds([]);
  }, [template.id, template.defaultDriverId]);

  const tasks = useMemo(() => getRoutePickupTasks(template.stops), [template.stops]);
  const selectedStops = useMemo(
    () => stopsForSelectedPickupTasks(template.stops, selectedPickupStopIds),
    [selectedPickupStopIds, template.stops],
  );
  const selectedCounts = stopCounts(selectedStops);
  const availableDrivers = drivers.filter((driver) => driver.status !== 'off_duty');
  const selectedDriver = availableDrivers.find((driver) => driver.id === driverId);

  const submit = async () => {
    if (selectedPickupStopIds.length === 0)
      return toast.error('เลือกอย่างน้อย 1 คู่รับ → ส่งสำหรับเที่ยวนี้');
    if (mode === 'immediate' && !driverId) return toast.error('โหมดส่งทันทีต้องเลือกคนขับก่อน');
    setSubmitting(true);
    try {
      const run = await createRouteTemplateRun(template.id, {
        selectedPickupStopIds,
        plannedDate: bangkokDateKey(dateOffset),
        driverId: driverId || undefined,
        dispatchMode: mode,
      });
      if (run.status === 'dispatched') {
        toast.success(
          `ส่งงาน ${template.name} ให้ ${selectedDriver?.name ?? 'คนขับ'} แล้ว — รอกดรับใน ${template.acceptWithinMinutes} นาที`,
        );
      } else {
        toast.success(`สร้าง Route Run ของ ${template.name} เข้า Planning แล้ว`);
      }
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'สั่งวิ่งไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Play className="h-4 w-4" /> สั่งวิ่งเที่ยวนี้
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            เลือกเฉพาะงานที่ต้องทำจริง — ระบบจะไม่ส่งทุกจุดในสายให้อัตโนมัติ
          </p>
        </div>
        <span className="text-xs font-medium text-info">
          เลือกแล้ว {selectedPickupStopIds.length}/{tasks.length} งาน
        </span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-medium">1. เลือกคู่รับ → ส่ง</div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                className="text-info underline"
                onClick={() => setSelectedPickupStopIds(tasks.map((task) => task.pickup.id))}
              >
                เลือกทั้งหมด
              </button>
              <button
                type="button"
                className="text-muted-foreground underline"
                onClick={() => setSelectedPickupStopIds([])}
              >
                ล้าง
              </button>
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {tasks.map((task) => {
              const checked = selectedPickupStopIds.includes(task.pickup.id);
              return (
                <label
                  key={task.pickup.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 transition-colors ${checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={checked}
                    onChange={() =>
                      setSelectedPickupStopIds((current) =>
                        current.includes(task.pickup.id)
                          ? current.filter((id) => id !== task.pickup.id)
                          : [...current, task.pickup.id],
                      )
                    }
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-info">รับ {task.pickup.name}</div>
                    <div className="mt-0.5 flex items-start gap-1 text-xs font-medium text-success">
                      <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                      <span>ส่ง {task.dropoff.name}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      จุด {task.pickupIndex + 1} → จุด {task.dropoffIndex + 1}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium">แผนที่เที่ยวที่เลือก</div>
          <RouteStopsMap stops={selectedStops} className="mt-2 h-56" />
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            ไม่มีจุดเริ่มต้น — messenger เริ่มจากตำแหน่งปัจจุบัน แล้วไปจุดหมายเลข 1
          </p>
        </div>
      </div>
      <div className="mt-4 text-xs font-medium">2. วันที่ คนขับ และวิธีส่งงาน</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          วันที่
          <Select
            className="mt-1"
            value={dateOffset}
            onChange={(event) => setDateOffset(Number(event.target.value))}
          >
            <option value={0}>{runDateLabel(0)}</option>
            <option value={1}>{runDateLabel(1)}</option>
          </Select>
        </label>
        <label className="text-xs font-medium">
          คนขับ (เปลี่ยนจากคนประจำได้)
          <Select
            className="mt-1"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">— ยังไม่เลือก (จัดตอน Planning) —</option>
            {availableDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
                {driver.id === template.defaultDriverId ? ' — คนขับประจำ' : ''} ·{' '}
                {driverStatusLabel(driver)}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('immediate')}
          className={`rounded-lg border p-3 text-left transition-colors ${mode === 'immediate' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
        >
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Zap className="h-3.5 w-3.5 text-warning" /> ส่งให้ messenger ทันที
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            งานเด้งเข้ามือถือเลย · ต้องกดรับใน {template.acceptWithinMinutes} นาที
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode('planning')}
          className={`rounded-lg border p-3 text-left transition-colors ${mode === 'planning' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
        >
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <CalendarDays className="h-3.5 w-3.5 text-info" /> เข้า Planning ก่อน
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            ยังไม่แจ้งคนขับ · ไปจัดรวมกับรอบอื่นเอง
          </div>
        </button>
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          disabled={
            submitting ||
            !template.active ||
            selectedPickupStopIds.length === 0 ||
            (mode === 'immediate' && !driverId)
          }
          onClick={() => void submit()}
        >
          <Play className="h-4 w-4" />
          {submitting
            ? 'กำลังสั่งวิ่ง…'
            : `สั่งวิ่ง ${selectedPickupStopIds.length} งาน · ${selectedStops.length} จุด (รับ ${selectedCounts.pickups} · ส่ง ${selectedCounts.dropoffs})`}
        </Button>
      </div>
    </div>
  );
}

export function RouteTemplates({ onOpenDispatch }: Props) {
  const { drivers, syncFromBackend } = useRetailStore();
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RouteTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await fetchRouteTemplates();
      setTemplates(next);
      setSelectedId((current) =>
        current && next.some((template) => template.id === current)
          ? current
          : (next[0]?.id ?? null),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลด Route Templates ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const saveTemplate = async (input: Omit<RouteTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const saved = editing
        ? await updateRouteTemplate(editing.id, input)
        : await createRouteTemplate(input);
      await refresh();
      setSelectedId(saved.id);
      toast.success('บันทึกสายวิ่งแล้ว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกสายวิ่งไม่สำเร็จ');
      throw error;
    }
  };

  const selectedStopIndexById = useMemo(
    () => new Map((selected?.stops ?? []).map((stop, index) => [stop.id, index])),
    [selected],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Builder — จัดเที่ยววิ่ง</h1>
          <p className="text-sm text-muted-foreground">
            จัดจุดรับ–ส่งอิสระจากทุกแม่แบบ โดยไม่ต้องเลือกสายที่ใช้งานก่อน
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> สร้างสายใหม่
        </Button>
      </div>
      <FreeRouteBuilderPreview templates={templates} />
      {loading ? (
        <Card className="p-8 text-sm text-muted-foreground">กำลังโหลด Route Templates…</Card>
      ) : templates.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีสายวิ่ง</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="overflow-hidden self-start">
            <div className="border-b px-4 py-3 text-sm font-semibold">
              แม่แบบที่อยู่เดิม{' '}
              <Badge variant="secondary" className="ml-1">
                {templates.filter((template) => template.active).length}
              </Badge>
            </div>
            {templates.map((template) => {
              const counts = stopCounts(template.stops);
              const tasks = getRoutePickupTasks(template.stops);
              return (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => setSelectedId(template.id)}
                  className={`w-full border-b px-4 py-3 text-left hover:bg-muted/40 ${selected?.id === template.id ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{template.name}</span>
                    {!template.active && <Badge variant="secondary">ปิด</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    สาย {template.routeGroup} · {weekdayLabel(template.weekdays)}
                    {template.plannedTime ? ` ${template.plannedTime}` : ''}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {counts.pickups} รับ · {counts.dropoffs} ส่ง
                    {tasks[0]
                      ? ` · ${tasks[0].pickup.name} → ${tasks[0].dropoff.name}${tasks.length > 1 ? ` +${tasks.length - 1}` : ''}`
                      : ''}
                  </div>
                </button>
              );
            })}
          </Card>
          {selected && (
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    <Badge variant={selected.active ? 'success' : 'secondary'}>
                      {selected.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </Badge>
                    <Badge variant="outline">{selected.routeGroup}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    สายนี้เป็นแม่แบบเท่านั้น — ตอนสั่งวิ่ง แอดมินเลือกเฉพาะคู่รับ →
                    ส่งที่ต้องทำในเที่ยวนั้น
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(selected);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> แก้ไข
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={async () => {
                      if (!window.confirm(`ลบสาย ${selected.name}?`)) return;
                      try {
                        await deleteRouteTemplate(selected.id);
                        await refresh();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : 'ลบสายไม่สำเร็จ');
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">ลบ</span>
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                <ol className="space-y-2">
                  {selected.stops.map((stop, index) => {
                    const deliverToIndex = stop.deliverToStopId
                      ? selectedStopIndexById.get(stop.deliverToStopId)
                      : undefined;
                    const deliverToStop =
                      deliverToIndex !== undefined ? selected.stops[deliverToIndex] : undefined;
                    const inbound =
                      stop.kind === 'dropoff'
                        ? selected.stops.filter(
                            (other) => other.kind === 'pickup' && other.deliverToStopId === stop.id,
                          )
                        : [];
                    return (
                      <li key={stop.id} className="rounded-xl border bg-muted/20 p-3">
                        <div className="flex items-start gap-2.5">
                          <StopOrderCircle order={index + 1} kind={stop.kind} />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StopKindBadge kind={stop.kind} />
                              <span className="text-sm font-medium">{stop.name}</span>
                            </div>
                            {(stop.contact || stop.phone) && (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {[stop.contact, stop.phone].filter(Boolean).join(' · ')}
                              </div>
                            )}
                            <div className="mt-1 flex gap-1 text-xs text-muted-foreground">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                              {stop.address}
                            </div>
                            {stop.kind === 'pickup' && deliverToStop && (
                              <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-info">
                                <ArrowRight className="h-3 w-3" />
                                ส่งที่ จุด {(deliverToIndex ?? 0) + 1} — {deliverToStop.name}
                              </div>
                            )}
                            {stop.kind === 'dropoff' && inbound.length > 0 && (
                              <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-success">
                                <Package className="h-3 w-3" />
                                รับของจาก: {inbound.map((other) => other.name).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
                <div className="lg:sticky lg:top-20 lg:self-start">
                  <RouteStopsMap stops={selected.stops} className="h-72" />
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-info" /> จุดรับ
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-success" /> จุดส่ง
                    </span>
                    <span>เส้นประ = ลำดับวิ่ง</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Info
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="ตาราง"
                  value={`${weekdayLabel(selected.weekdays)} · ${selected.plannedTime || 'ไม่กำหนดเวลา'}`}
                />
                <Info
                  icon={<UserRound className="h-3.5 w-3.5" />}
                  label="คนขับประจำ"
                  value={
                    drivers.find((driver) => driver.id === selected.defaultDriverId)?.name ??
                    'เลือกตอนสั่งวิ่ง'
                  }
                />
                <Info
                  icon={<Timer className="h-3.5 w-3.5" />}
                  label="SLA"
                  value={`รับ ${selected.acceptWithinMinutes} · เริ่ม ${selected.startWithinMinutes} นาที`}
                />
              </div>

              <RunPanel
                template={selected}
                drivers={drivers}
                onDone={() => {
                  void syncFromBackend();
                  onOpenDispatch();
                }}
              />
            </Card>
          )}
        </div>
      )}
      <TemplateDialog
        open={dialogOpen}
        template={editing}
        drivers={drivers}
        onClose={() => setDialogOpen(false)}
        onSave={saveTemplate}
      />
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
