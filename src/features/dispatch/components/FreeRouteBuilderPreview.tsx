import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CirclePlus,
  Clock3,
  GripVertical,
  Loader2,
  MapPin,
  MapPinned,
  PackagePlus,
  Play,
  Plus,
  Route,
  Send,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { DriverAvatar } from '@/components/DriverAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Driver } from '@/data/orderTypes';
import { RouteStopsMap } from '@/features/dispatch/components/RouteStopsMap';
import type { RouteStop, RouteStopKind, RouteTemplate } from '@/features/dispatch/types';
import { createAdHocRouteRun, geocodeAddress } from '@/lib/retailApi';

type LibraryAddress = RouteStop & {
  source: string;
  pairedAddressId?: string;
};

type BuilderStop = RouteStop & {
  sourceLabel: string;
};

type DispatchMode = 'planning' | 'immediate';

const SILOM_PICKUP: LibraryAddress = {
  id: 'shortcut-silom-pickup',
  kind: 'pickup',
  name: 'สีลมคอมเพล็กซ์',
  address: '191 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500',
  lat: 13.72831,
  lng: 100.53517,
  source: 'ทางลัดสีลม → วังบูรพา',
  pairedAddressId: 'shortcut-wangburapha-dropoff',
};

const WANGBURAPHA_DROPOFF: LibraryAddress = {
  id: 'shortcut-wangburapha-dropoff',
  kind: 'dropoff',
  name: 'ร้านทองออสสิริส สาขาวังบูรพา',
  address: '857 ถนนมหาไชย แขวงวังบูรพาภิรมย์ เขตพระนคร กรุงเทพฯ 10200 (ติดร้านบ้านช่างทอง)',
  lat: 13.74442,
  lng: 100.50117,
  source: 'ทางลัดสีลม → วังบูรพา',
};

const SAMPLE_PICKUP: LibraryAddress = {
  id: 'sample-nearby-pickup',
  kind: 'pickup',
  name: 'ไปรษณีย์กลาง บางรัก',
  address: '1160 ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพฯ 10500',
  lat: 13.72769,
  lng: 100.51412,
  source: 'ตัวอย่างจุดรับงานที่ 2',
  pairedAddressId: 'sample-nearby-dropoff',
};

const SAMPLE_DROPOFF: LibraryAddress = {
  id: 'sample-nearby-dropoff',
  kind: 'dropoff',
  name: 'ดิโอลด์สยาม พลาซ่า',
  address: '12 ถนนตรีเพชร แขวงวังบูรพาภิรมย์ เขตพระนคร กรุงเทพฯ 10200',
  lat: 13.74486,
  lng: 100.49963,
  source: 'ตัวอย่างจุดส่งงานที่ 2',
};

const BASE_ADDRESSES = [SILOM_PICKUP, WANGBURAPHA_DROPOFF, SAMPLE_PICKUP, SAMPLE_DROPOFF];

function seedStops(): BuilderStop[] {
  return [
    {
      ...SILOM_PICKUP,
      deliverToStopId: WANGBURAPHA_DROPOFF.id,
      sourceLabel: SILOM_PICKUP.source,
    },
    { ...WANGBURAPHA_DROPOFF, sourceLabel: WANGBURAPHA_DROPOFF.source },
  ];
}

function templateAddresses(templates: RouteTemplate[]): LibraryAddress[] {
  return templates.flatMap((template) =>
    template.stops.map((stop) => ({
      ...stop,
      id: `template:${template.id}:${stop.id}`,
      deliverToStopId: undefined,
      pairedAddressId: stop.deliverToStopId
        ? `template:${template.id}:${stop.deliverToStopId}`
        : undefined,
      source: `แม่แบบ ${template.name}`,
    })),
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= items.length)
    return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function stopError(stops: BuilderStop[]) {
  if (!stops.some((stop) => stop.kind === 'pickup')) return 'เพิ่มจุดรับอย่างน้อย 1 จุด';
  if (!stops.some((stop) => stop.kind === 'dropoff')) return 'เพิ่มจุดส่งอย่างน้อย 1 จุด';
  const indexById = new Map(stops.map((stop, index) => [stop.id, index]));
  for (const stop of stops) {
    if (stop.kind !== 'pickup') continue;
    if (!stop.deliverToStopId) return `จุดรับ “${stop.name}” ยังไม่ได้เลือกจุดส่ง`;
    const destinationIndex = indexById.get(stop.deliverToStopId);
    const pickupIndex = indexById.get(stop.id) ?? -1;
    if (destinationIndex === undefined) return `จุดส่งของ “${stop.name}” ไม่อยู่ในเที่ยวนี้`;
    if (destinationIndex <= pickupIndex) return `จุดส่งของ “${stop.name}” ต้องอยู่หลังจุดรับ`;
  }
  const orphanDropoff = stops.find(
    (stop) =>
      stop.kind === 'dropoff' &&
      !stops.some((pickup) => pickup.kind === 'pickup' && pickup.deliverToStopId === stop.id),
  );
  if (orphanDropoff) return `จุดส่ง “${orphanDropoff.name}” ยังไม่มีจุดรับที่ส่งมาที่นี่`;
  return null;
}

function todayDateKey(offset = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

function driverStatus(driver: Driver) {
  if (driver.status === 'available') return 'ว่าง พร้อมรับงาน';
  if (driver.status === 'on_delivery') return `กำลังส่ง ${driver.activeOrders || 1} งาน`;
  return 'พักงาน';
}

function vehicleLabel(driver: Driver) {
  if (driver.vehicle === 'motorcycle') return 'มอเตอร์ไซค์';
  if (driver.vehicle === 'van') return 'รถตู้';
  return 'รถกระบะ';
}

export function FreeRouteBuilderPreview({
  templates,
  drivers,
  onCreated,
}: {
  templates: RouteTemplate[];
  drivers: Driver[];
  onCreated: () => Promise<void> | void;
}) {
  const [customAddresses, setCustomAddresses] = useState<LibraryAddress[]>([]);
  const [stops, setStops] = useState<BuilderStop[]>(seedStops);
  const [dropActive, setDropActive] = useState(false);
  const [addingKind, setAddingKind] = useState<RouteStopKind | null>(null);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [locating, setLocating] = useState(false);
  const [plannedDate, setPlannedDate] = useState(todayDateKey());
  const [plannedTime, setPlannedTime] = useState('');
  const [driverId, setDriverId] = useState('');
  const [mode, setMode] = useState<DispatchMode>('planning');
  const [submitting, setSubmitting] = useState(false);

  const addresses = useMemo(
    () => [...BASE_ADDRESSES, ...customAddresses, ...templateAddresses(templates)],
    [customAddresses, templates],
  );
  const usedAddressIds = useMemo(() => new Set(stops.map((stop) => stop.id)), [stops]);
  const dropoffStops = stops.filter((stop) => stop.kind === 'dropoff');
  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const availableDrivers = drivers.filter((driver) => driver.status !== 'off_duty');
  const validationError = stopError(stops);

  const addAddress = (addressId: string) => {
    const address = addresses.find((entry) => entry.id === addressId);
    if (!address || usedAddressIds.has(addressId)) return;
    setStops((current) => {
      const nextStop: BuilderStop = {
        ...address,
        deliverToStopId:
          address.kind === 'pickup' && address.pairedAddressId
            ? current.find((stop) => stop.id === address.pairedAddressId)?.id
            : undefined,
        sourceLabel: address.source,
      };
      const next = [...current, nextStop];
      if (address.kind === 'dropoff') {
        return next.map((stop) =>
          stop.kind === 'pickup' &&
          !stop.deliverToStopId &&
          addresses.find((entry) => entry.id === stop.id)?.pairedAddressId === address.id
            ? { ...stop, deliverToStopId: address.id }
            : stop,
        );
      }
      return next;
    });
  };

  const addShortcut = () => {
    setStops((current) => {
      const withoutShortcut = current.filter(
        (stop) => stop.id !== SILOM_PICKUP.id && stop.id !== WANGBURAPHA_DROPOFF.id,
      );
      return [...seedStops(), ...withoutShortcut];
    });
  };

  const patchStop = (stopId: string, patch: Partial<BuilderStop>) => {
    setStops((current) =>
      current.map((stop) => (stop.id === stopId ? { ...stop, ...patch } : stop)),
    );
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

  const moveStop = (stopId: string, direction: -1 | 1) => {
    setStops((current) => {
      const index = current.findIndex((stop) => stop.id === stopId);
      return moveItem(current, index, index + direction);
    });
  };

  const moveStopBefore = (draggedId: string, targetId: string) => {
    setStops((current) => {
      const from = current.findIndex((stop) => stop.id === draggedId);
      const target = current.findIndex((stop) => stop.id === targetId);
      if (from < 0 || target < 0 || from === target) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(from < target ? target - 1 : target, 0, moved);
      return next;
    });
  };

  const addManualAddress = async () => {
    if (!addingKind || !newName.trim() || !newAddress.trim()) {
      return toast.error('ระบุชื่อสถานที่และที่อยู่ให้ครบ');
    }
    setLocating(true);
    try {
      const geo = await geocodeAddress(newAddress.trim()).catch(() => null);
      const id = `adhoc-${addingKind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const entry: LibraryAddress = {
        id,
        kind: addingKind,
        name: newName.trim(),
        address: newAddress.trim(),
        phone: newPhone.trim() || undefined,
        lat: geo?.lat,
        lng: geo?.lng,
        source: 'เพิ่มสำหรับเที่ยวนี้',
      };
      setCustomAddresses((current) => [...current, entry]);
      setStops((current) => [...current, { ...entry, sourceLabel: entry.source }]);
      setNewName('');
      setNewAddress('');
      setNewPhone('');
      setAddingKind(null);
    } finally {
      setLocating(false);
    }
  };

  const dropAddress = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    addAddress(event.dataTransfer.getData('application/x-movevai-address'));
  };

  const submit = async () => {
    if (validationError) return toast.error(validationError);
    if (mode === 'immediate' && !selectedDriver) return toast.error('เลือกคนขับก่อนส่งงานทันที');
    setSubmitting(true);
    try {
      const first = stops[0]?.name ?? 'จุดรับ';
      const last = stops[stops.length - 1]?.name ?? 'จุดส่ง';
      const result = await createAdHocRouteRun({
        name: `เที่ยว ${first} → ${last}`,
        stops: stops.map(({ sourceLabel: _sourceLabel, ...stop }) => stop),
        plannedDate,
        plannedTime: plannedTime || undefined,
        driverId: driverId || undefined,
        dispatchMode: mode,
        acceptWithinMinutes: 15,
        startWithinMinutes: 10,
        startPolicy: 'manual',
      });
      await onCreated();
      toast.success(
        result.status === 'dispatched'
          ? `ส่งเที่ยวให้ ${selectedDriver?.name ?? 'Messenger'} แล้ว · ${result.orderIds.length} จุด`
          : `สร้าง ${result.orderIds.length} จุดเข้า Planning แล้ว`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'สร้างเที่ยวไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid="free-route-builder"
      className="overflow-hidden rounded-2xl border bg-background shadow-sm"
    >
      <div className="grid min-h-[620px] xl:grid-cols-[310px_minmax(390px,0.95fr)_minmax(390px,1.05fr)]">
        <div className="border-b bg-muted/15 p-4 xl:border-r xl:border-b-0">
          <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <Zap className="h-3.5 w-3.5 text-warning" /> ทางลัดที่ใช้ประจำ
            </div>
            <div className="mt-2 flex items-start gap-2 text-[11px]">
              <Badge className="border-info/30 text-info" variant="outline">
                รับ
              </Badge>
              <span>สีลมคอมเพล็กซ์</span>
            </div>
            <div className="ml-4 my-1 h-2 border-l border-dashed" />
            <div className="flex items-start gap-2 text-[11px]">
              <Badge className="border-success/30 text-success" variant="outline">
                ส่ง
              </Badge>
              <span>ออสสิริส สาขาวังบูรพา</span>
            </div>
            <Button
              className="mt-2 h-7 w-full text-[11px]"
              size="sm"
              variant="outline"
              onClick={addShortcut}
            >
              <PackagePlus className="h-3.5 w-3.5" /> เพิ่มทั้งคู่แบบเร็ว
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">1. คลังที่อยู่แยกประเภท</div>
              <div className="text-[10px] text-muted-foreground">ลากทีละจุดหรือกดเพิ่ม</div>
            </div>
            <Badge variant="secondary">{addresses.length} จุด</Badge>
          </div>

          {(['pickup', 'dropoff'] as RouteStopKind[]).map((kind) => {
            const entries = addresses.filter((entry) => entry.kind === kind);
            return (
              <div key={kind} className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <div
                    className={`text-xs font-semibold ${kind === 'pickup' ? 'text-info' : 'text-success'}`}
                  >
                    {kind === 'pickup' ? 'จุดรับของ' : 'จุดส่งของ'} · {entries.length}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[10px] text-primary underline"
                    onClick={() => setAddingKind(kind)}
                  >
                    <Plus className="h-3 w-3" /> เพิ่มใหม่
                  </button>
                </div>
                <div className="app-scroll mt-1.5 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                  {entries.map((entry) => {
                    const used = usedAddressIds.has(entry.id);
                    return (
                      <article
                        key={entry.id}
                        draggable={!used}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'copy';
                          event.dataTransfer.setData('application/x-movevai-address', entry.id);
                        }}
                        className={`flex items-start gap-2 rounded-lg border bg-background p-2 ${used ? 'opacity-60' : 'cursor-grab hover:border-primary/40'}`}
                      >
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold">{entry.name}</div>
                          <div className="line-clamp-2 text-[10px] text-muted-foreground">
                            {entry.address}
                          </div>
                          <div className="mt-0.5 truncate text-[9px] text-muted-foreground/70">
                            {entry.source}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={used}
                          onClick={() => addAddress(entry.id)}
                        >
                          {used ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <CirclePlus className="h-3.5 w-3.5" />
                          )}
                          <span className="sr-only">เพิ่ม {entry.name}</span>
                        </Button>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {addingKind && (
            <div className="mt-3 rounded-xl border bg-background p-3">
              <div className="text-xs font-semibold">
                เพิ่ม{addingKind === 'pickup' ? 'จุดรับ' : 'จุดส่ง'}ใหม่
              </div>
              <Input
                className="mt-2"
                placeholder="ชื่อสถานที่"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <Input
                className="mt-2"
                placeholder="ที่อยู่"
                value={newAddress}
                onChange={(event) => setNewAddress(event.target.value)}
              />
              <Input
                className="mt-2"
                placeholder="เบอร์โทร (ถ้ามี)"
                value={newPhone}
                onChange={(event) => setNewPhone(event.target.value)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAddingKind(null)}>
                  ยกเลิก
                </Button>
                <Button size="sm" disabled={locating} onClick={() => void addManualAddress()}>
                  {locating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MapPin className="h-3.5 w-3.5" />
                  )}
                  เพิ่มและปักหมุด
                </Button>
              </div>
            </div>
          )}
        </div>

        <div
          className={`border-b p-4 transition-colors xl:border-r xl:border-b-0 ${dropActive ? 'bg-primary/5' : ''}`}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes('application/x-movevai-address'))
              setDropActive(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-movevai-address')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDropActive(false);
          }}
          onDrop={dropAddress}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">2. ลำดับเที่ยวและคู่รับ–ส่ง</div>
              <div className="text-[10px] text-muted-foreground">
                ลากสลับลำดับ และเลือกปลายทางของแต่ละจุดรับ
              </div>
            </div>
            <Badge variant="outline">{stops.length} จุด</Badge>
          </div>

          {stops.length === 0 ? (
            <div className="mt-3 flex min-h-96 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 text-center">
              <PackagePlus className="h-8 w-8 text-muted-foreground/50" />
              <div className="mt-2 text-sm font-medium">ลากจุดรับหรือจุดส่งมาวาง</div>
              <div className="mt-1 text-xs text-muted-foreground">
                เพิ่มกี่จุดก็ได้ แล้วค่อยจับคู่กันในเที่ยวนี้
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {stops.map((stop, index) => (
                <div
                  key={stop.id}
                  data-route-stop-id={stop.id}
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-movevai-route-stop', stop.id);
                  }}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('application/x-movevai-route-stop'))
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    const draggedId = event.dataTransfer.getData(
                      'application/x-movevai-route-stop',
                    );
                    if (!draggedId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    moveStopBefore(draggedId, stop.id);
                  }}
                  className="rounded-xl border bg-background p-2.5 shadow-xs hover:border-primary/30"
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${stop.kind === 'pickup' ? 'bg-info' : 'bg-success'}`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            stop.kind === 'pickup'
                              ? 'border-info/30 text-info'
                              : 'border-success/30 text-success'
                          }
                        >
                          {stop.kind === 'pickup' ? 'รับของ' : 'ส่งของ'}
                        </Badge>
                        <span className="text-xs font-semibold">{stop.name}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                        {stop.address}
                      </div>
                      {stop.kind === 'pickup' && (
                        <label className="mt-2 flex items-center gap-1.5 text-[10px] font-medium">
                          <ArrowRight className="h-3 w-3 text-info" /> ส่งไปที่
                          <Select
                            containerClassName="min-w-0 flex-1"
                            className="h-7 text-[11px]"
                            value={stop.deliverToStopId ?? ''}
                            onChange={(event) =>
                              patchStop(stop.id, {
                                deliverToStopId: event.target.value || undefined,
                              })
                            }
                          >
                            <option value="">— เลือกจุดส่ง —</option>
                            {dropoffStops.map((dropoff) => (
                              <option key={dropoff.id} value={dropoff.id}>
                                {dropoff.name}
                              </option>
                            ))}
                          </Select>
                        </label>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button
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
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => removeStop(stop.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">นำจุดออก</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${validationError ? 'border-warning/30 bg-warning/8 text-warning' : 'border-success/30 bg-success/8 text-success'}`}
          >
            {validationError ? (
              validationError
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> คู่รับ–ส่งและลำดับถูกต้อง พร้อมสร้างงาน
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <MapPinned className="h-4 w-4" /> 3. แผนที่และการส่งงาน
              </div>
              <div className="text-[10px] text-muted-foreground">
                เส้นทางถนนเปลี่ยนตามลำดับที่ลาก
              </div>
            </div>
            <Badge className="gap-1" variant="secondary">
              <Route className="h-3 w-3" /> {stops.length} จุด
            </Badge>
          </div>
          <RouteStopsMap stops={stops} className="mt-3 h-72" />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> วันที่
              </span>
              <Input
                type="date"
                className="mt-1"
                min={todayDateKey()}
                value={plannedDate}
                onChange={(event) => setPlannedDate(event.target.value)}
              />
            </label>
            <label className="text-xs font-medium">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" /> เวลา
              </span>
              <Input
                type="time"
                className="mt-1"
                value={plannedTime}
                onChange={(event) => setPlannedTime(event.target.value)}
              />
            </label>
          </div>

          <label className="mt-3 block text-xs font-medium">
            <span className="inline-flex items-center gap-1">
              <UserRound className="h-3.5 w-3.5" /> คนขับ (เปลี่ยนได้)
            </span>
            <Select
              className="mt-1"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
            >
              <option value="">— ยังไม่เลือก (จัดตอน Planning) —</option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} · {driverStatus(driver)}
                </option>
              ))}
            </Select>
          </label>

          {selectedDriver ? (
            <div className="mt-2 flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
              <DriverAvatar driver={selectedDriver} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{selectedDriver.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {vehicleLabel(selectedDriver)} · {selectedDriver.phone}
                </div>
                <div
                  className={`mt-1 text-[10px] ${selectedDriver.status === 'available' ? 'text-success' : 'text-warning'}`}
                >
                  {driverStatus(selectedDriver)}
                </div>
              </div>
              <Badge variant="outline">{selectedDriver.zone || 'ไม่ระบุโซน'}</Badge>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
              <UserRound className="h-4 w-4" /> เลือกคนขับเพื่อดูรูป โปรไฟล์ รถ และสถานะงาน
            </div>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              data-testid="dispatch-immediate"
              onClick={() => setMode('immediate')}
              className={`rounded-xl border p-3 text-left transition-colors ${mode === 'immediate' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Send className="h-3.5 w-3.5 text-warning" /> ส่งให้ messenger ทันที
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                งานเด้งเข้ามือถือเลย · ต้องกดรับใน 15 นาที
              </div>
            </button>
            <button
              type="button"
              data-testid="dispatch-planning"
              onClick={() => setMode('planning')}
              className={`rounded-xl border p-3 text-left transition-colors ${mode === 'planning' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="h-3.5 w-3.5 text-info" /> เข้า Planning ก่อน
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                ยังไม่แจ้งคนขับ · ไปจัดรวมกับรอบอื่นเอง
              </div>
            </button>
          </div>

          <Button
            data-testid="create-route-run"
            className="mt-3 w-full"
            disabled={
              submitting || Boolean(validationError) || (mode === 'immediate' && !selectedDriver)
            }
            onClick={() => void submit()}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {submitting
              ? 'กำลังสร้างเที่ยว…'
              : mode === 'immediate'
                ? `ส่ง ${stops.length} จุดให้ Messenger`
                : `สร้าง ${stops.length} จุดเข้า Planning`}
          </Button>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            {mode === 'immediate'
              ? 'ส่งทันทีจะเริ่มวันนี้ โดยใช้คนขับที่เลือก'
              : 'วันที่ เวลา และคนขับสามารถแก้ต่อได้ใน Planning'}
          </p>
        </div>
      </div>
    </section>
  );
}
