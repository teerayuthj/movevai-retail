import { Fragment, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CirclePlus,
  Clock3,
  GripVertical,
  Loader2,
  MapPin,
  MapPinned,
  Package,
  PackagePlus,
  Pencil,
  Play,
  Plus,
  Route,
  Search,
  Send,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DriverAvatar } from '@/components/DriverAvatar';
import {
  ConfirmDispatchDialog,
  DriverSummaryRow,
} from '@/components/delivery/ConfirmDispatchDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import type { Driver, Order } from '@/data/orderTypes';
import { deriveDriverDisplayStatus, formatDriverDispatchStatus } from '@/lib/deliveryExecution';
import { RouteStopsMap } from '@/features/dispatch/components/RouteStopsMap';
import type { RouteStop, RouteStopKind } from '@/features/dispatch/types';
import type { RouteTemplateRun } from '@/lib/retailApi';
import {
  createAdHocRouteRun,
  createRouteAddress,
  deleteRouteAddress,
  geocodePlace,
  reorderRouteAddresses,
  updateRouteAddress,
  type RouteAddress,
} from '@/lib/retailApi';

type LibraryAddress = RouteStop & {
  source: string;
  pairedAddressId?: string;
};

type BuilderStop = RouteStop & {
  sourceLabel: string;
};

// 1 งาน = รับ 1 จุด + ส่ง 1 จุด (จับคู่ในตัว ไม่ต้องมี dropdown เลือกปลายทาง)
// Messenger วิ่งเรียงตามลำดับงาน: รับ→ส่ง ของงานแรก แล้วต่อด้วยงานถัดไป
type BuilderJob = {
  id: string;
  pickup: BuilderStop | null;
  dropoff: BuilderStop | null;
};

type DispatchMode = 'scheduled' | 'immediate';
const ACCEPT_WITHIN_MINUTES_OPTIONS = [5, 10, 15, 20, 30];

function newJobId() {
  return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function savedAddressBookEntries(addresses: RouteAddress[]): LibraryAddress[] {
  return addresses.map((address) => ({
    id: address.id,
    kind: address.kind,
    name: address.name,
    contact: address.contact,
    phone: address.phone,
    address: address.address,
    lat: address.lat,
    lng: address.lng,
    source: address.routeGroup,
  }));
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= items.length)
    return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function jobError(jobs: BuilderJob[]) {
  if (jobs.length === 0) return 'เพิ่มงานรับ–ส่งอย่างน้อย 1 งาน';
  for (const [index, job] of jobs.entries()) {
    if (!job.pickup) return `งานที่ ${index + 1} ยังไม่ได้เลือกจุดรับ`;
    if (!job.dropoff) return `งานที่ ${index + 1} ยังไม่ได้เลือกจุดส่ง`;
  }
  return null;
}

function todayDateKey(offset = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

function vehicleLabel(driver: Driver) {
  if (driver.vehicle === 'motorcycle') return 'มอเตอร์ไซค์';
  if (driver.vehicle === 'van') return 'รถตู้';
  return 'รถกระบะ';
}

export function FreeRouteBuilderPreview({
  savedAddresses,
  onAddressCreated,
  onAddressDeleted,
  onAddressUpdated,
  onAddressesReordered,
  drivers,
  orders,
  onCreated,
}: {
  savedAddresses: RouteAddress[];
  onAddressCreated: (address: RouteAddress) => void;
  onAddressDeleted: (addressId: string) => void;
  onAddressUpdated: (address: RouteAddress) => void;
  onAddressesReordered: (addresses: RouteAddress[]) => void;
  drivers: Driver[];
  orders: Order[];
  onCreated: (result: RouteTemplateRun) => Promise<void> | void;
}) {
  const [jobs, setJobs] = useState<BuilderJob[]>([]);
  const [searchByKind, setSearchByKind] = useState<Record<RouteStopKind, string>>({
    pickup: '',
    dropoff: '',
  });
  const [dropActive, setDropActive] = useState(false);
  const [libraryDragId, setLibraryDragId] = useState<string | null>(null);
  const [libraryDragOverId, setLibraryDragOverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [addingKind, setAddingKind] = useState<RouteStopKind | null>(null);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingAddress, setEditingAddress] = useState<RouteAddress | null>(null);
  const [editRouteGroup, setEditRouteGroup] = useState('');
  const [editKind, setEditKind] = useState<RouteStopKind>('dropoff');
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [plannedDate, setPlannedDate] = useState(todayDateKey());
  const [plannedTime, setPlannedTime] = useState('');
  const [driverId, setDriverId] = useState('');
  const [messengerTitle, setMessengerTitle] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<DispatchMode>('immediate');
  const [acceptWithinMinutes, setAcceptWithinMinutes] = useState(15);
  const [confirmDispatchOpen, setConfirmDispatchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addresses = useMemo(() => [...savedAddressBookEntries(savedAddresses)], [savedAddresses]);
  const usedAddressIds = useMemo(
    () =>
      new Set(
        jobs.flatMap((job) =>
          [job.pickup?.id, job.dropoff?.id].filter((id): id is string => Boolean(id)),
        ),
      ),
    [jobs],
  );
  const savedAddressIds = useMemo(
    () => new Set(savedAddresses.map((address) => address.id)),
    [savedAddresses],
  );
  // ลำดับวิ่งจริงที่ส่งให้แผนที่/backend: รับ→ส่ง ของแต่ละงานเรียงตามลำดับงาน
  const routeStops = useMemo(
    () =>
      jobs.flatMap((job) => {
        const stops: BuilderStop[] = [];
        if (job.pickup) stops.push({ ...job.pickup, deliverToStopId: job.dropoff?.id });
        if (job.dropoff) stops.push({ ...job.dropoff, deliverToStopId: undefined });
        return stops;
      }),
    [jobs],
  );
  const routeSequence = useMemo(
    () =>
      jobs.flatMap((job, jobIndex) =>
        [job.pickup, job.dropoff]
          .filter((stop): stop is BuilderStop => stop != null)
          .map((stop) => ({ stop, jobNumber: jobIndex + 1 })),
      ),
    [jobs],
  );
  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const availableDrivers = drivers.filter((driver) => driver.status !== 'off_duty');
  const validationError = jobError(jobs);
  const missingDispatchRequirement = !selectedDriver || (mode === 'scheduled' && !plannedTime);

  // เติมจุดลงงานแรกที่ช่องประเภทเดียวกันยังว่าง ถ้าไม่มีก็เปิดงานใหม่ให้
  const placeStop = (stop: BuilderStop) => {
    setJobs((current) => {
      const slot = stop.kind;
      const index = current.findIndex((job) => job[slot] == null);
      if (index >= 0)
        return current.map((job, jobIndex) =>
          jobIndex === index ? { ...job, [slot]: stop } : job,
        );
      return [
        ...current,
        {
          id: newJobId(),
          pickup: slot === 'pickup' ? stop : null,
          dropoff: slot === 'dropoff' ? stop : null,
        },
      ];
    });
  };

  const toBuilderStop = (address: LibraryAddress): BuilderStop => ({
    ...address,
    deliverToStopId: undefined,
    sourceLabel: address.source,
  });

  const addAddress = (addressId: string) => {
    const address = addresses.find((entry) => entry.id === addressId);
    if (!address || usedAddressIds.has(addressId)) return;
    placeStop(toBuilderStop(address));
  };

  // วางที่อยู่ลงงานที่ระบุ (ลากจากคลังมาปล่อยบนการ์ดงาน) — ช่องเดิมถูกแทนที่ได้
  const placeAddressInJob = (jobId: string, addressId: string) => {
    const address = addresses.find((entry) => entry.id === addressId);
    if (!address || usedAddressIds.has(addressId)) return;
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId ? { ...job, [address.kind]: toBuilderStop(address) } : job,
      ),
    );
  };

  const clearJobSlot = (jobId: string, kind: RouteStopKind) => {
    setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, [kind]: null } : job)));
  };

  const removeJob = (jobId: string) => {
    setJobs((current) => current.filter((job) => job.id !== jobId));
  };

  const clearAddressUsage = (addressId: string) => {
    setJobs((current) =>
      current.map((job) => ({
        ...job,
        pickup: job.pickup?.id === addressId ? null : job.pickup,
        dropoff: job.dropoff?.id === addressId ? null : job.dropoff,
      })),
    );
  };

  const addEmptyJob = () => {
    setJobs((current) => [...current, { id: newJobId(), pickup: null, dropoff: null }]);
  };

  const moveJob = (jobId: string, direction: -1 | 1) => {
    setJobs((current) => {
      const index = current.findIndex((job) => job.id === jobId);
      return moveItem(current, index, index + direction);
    });
  };

  const moveJobBefore = (draggedId: string, targetId: string) => {
    setJobs((current) => {
      const from = current.findIndex((job) => job.id === draggedId);
      const target = current.findIndex((job) => job.id === targetId);
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
      const geo = await geocodePlace(newName, newAddress).catch(() => null);
      const saved = await createRouteAddress({
        routeGroup: 'เพิ่มเอง',
        kind: addingKind,
        name: newName.trim(),
        contact: newContact.trim() || undefined,
        address: newAddress.trim(),
        phone: newPhone.trim() || undefined,
        lat: geo?.lat,
        lng: geo?.lng,
      });
      const entry: LibraryAddress = { ...saved, source: saved.routeGroup };
      placeStop(toBuilderStop(entry));
      onAddressCreated(saved);
      setNewName('');
      setNewAddress('');
      setNewContact('');
      setNewPhone('');
      setAddingKind(null);
    } finally {
      setLocating(false);
    }
  };

  const openAddressEditor = (addressId: string) => {
    const address = savedAddresses.find((item) => item.id === addressId);
    if (!address) return;
    setEditingAddress(address);
    setEditRouteGroup(address.routeGroup);
    setEditKind(address.kind);
    setEditName(address.name);
    setEditAddress(address.address);
    setEditContact(address.contact ?? '');
    setEditPhone(address.phone ?? '');
  };

  const saveAddressEdit = async () => {
    if (!editingAddress || !editRouteGroup.trim() || !editName.trim() || !editAddress.trim()) {
      return toast.error('ระบุกลุ่ม ชื่อสถานที่ และที่อยู่ให้ครบ');
    }
    setLocating(true);
    try {
      const geo = await geocodePlace(editName, editAddress).catch(() => null);
      const updated = await updateRouteAddress(editingAddress.id, {
        routeGroup: editRouteGroup.trim(),
        kind: editKind,
        name: editName.trim(),
        address: editAddress.trim(),
        contact: editContact.trim() || undefined,
        phone: editPhone.trim() || undefined,
        lat: geo?.lat ?? editingAddress.lat,
        lng: geo?.lng ?? editingAddress.lng,
      });
      onAddressUpdated(updated);
      setEditingAddress(null);
      toast.success('บันทึกจุดรับ–ส่งแล้ว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกจุดรับ–ส่งไม่สำเร็จ');
    } finally {
      setLocating(false);
    }
  };

  const deleteSavedAddress = async (address: LibraryAddress) => {
    if (!window.confirm(`ลบ “${address.name}” ออกจากคลังที่อยู่หรือไม่?`)) return;
    setDeletingAddressId(address.id);
    try {
      await deleteRouteAddress(address.id);
      clearAddressUsage(address.id);
      onAddressDeleted(address.id);
      toast.success(`ลบ “${address.name}” แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ลบจุดรับ–ส่งไม่สำเร็จ');
    } finally {
      setDeletingAddressId(null);
    }
  };

  const dropAddress = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    addAddress(event.dataTransfer.getData('application/x-movevai-address'));
  };

  // จัดลำดับคลังที่อยู่ใหม่ภายในกลุ่ม kind เดียว: วางการ์ดที่ลากไว้ "ก่อน" การ์ดปลายทาง
  // อัปเดตหน้าจอทันที (optimistic) แล้วยิง API เก็บลำดับถาวร ถ้าพลาดค่อยดึงกลับ
  const reorderLibrary = async (kind: RouteStopKind, draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    const kindIds = savedAddresses
      .filter((address) => address.kind === kind)
      .map((address) => address.id);
    const from = kindIds.indexOf(draggedId);
    const target = kindIds.indexOf(targetId);
    if (from < 0 || target < 0) return;
    const nextIds = [...kindIds];
    const [moved] = nextIds.splice(from, 1);
    nextIds.splice(from < target ? target - 1 : target, 0, moved);
    if (nextIds.every((id, index) => id === kindIds[index])) return;

    const previous = savedAddresses;
    const byId = new Map(savedAddresses.map((address) => [address.id, address]));
    const reorderedKind = nextIds.map((id) => byId.get(id)!);
    const others = savedAddresses.filter((address) => address.kind !== kind);
    onAddressesReordered([...reorderedKind, ...others]);

    setSavingOrder(true);
    try {
      const saved = await reorderRouteAddresses({ kind, orderedIds: nextIds });
      onAddressesReordered(saved);
    } catch (error) {
      onAddressesReordered(previous);
      toast.error(error instanceof Error ? error.message : 'บันทึกลำดับใหม่ไม่สำเร็จ');
    } finally {
      setSavingOrder(false);
    }
  };

  const validateBeforeDispatch = () => {
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    if (!selectedDriver) {
      toast.error(
        mode === 'immediate' ? 'เลือกคนขับก่อนมอบงานทันที' : 'เลือกคนขับก่อนมอบงานตามวัน–เวลา',
      );
      return false;
    }
    if (mode === 'scheduled' && !plannedTime) {
      toast.error('กรุณาเลือกเวลาออกก่อนมอบงานตามวัน–เวลา');
      return false;
    }
    return true;
  };

  const openDispatchPreview = () => {
    if (!validateBeforeDispatch()) return;
    setConfirmDispatchOpen(true);
  };

  const submit = async () => {
    if (!validateBeforeDispatch()) return;
    setSubmitting(true);
    try {
      const first = routeStops[0]?.name ?? 'จุดรับ';
      const last = routeStops[routeStops.length - 1]?.name ?? 'จุดส่ง';
      const result = await createAdHocRouteRun({
        name: `เที่ยว ${first} → ${last}`,
        messengerTitle: messengerTitle.trim() || undefined,
        stops: routeStops.map(({ sourceLabel: _sourceLabel, ...stop }) => stop),
        plannedDate,
        plannedTime: plannedTime || undefined,
        driverId: driverId || undefined,
        // ทั้งสองแบบมอบงานถึง Messenger ในขั้นยืนยันเดียว
        // scheduled คงวัน–เวลาไว้บน Route โดยไม่ค้างในหน้า Delivery Planning
        dispatchMode: mode,
        note: note.trim() || undefined,
        acceptWithinMinutes,
        startWithinMinutes: 10,
        startPolicy: 'manual',
      });
      await onCreated(result);
      setConfirmDispatchOpen(false);
      toast.success(
        mode === 'immediate'
          ? `ส่งเที่ยวให้ ${selectedDriver?.name ?? 'Messenger'} แล้ว · ${result.orderIds.length} จุด`
          : `มอบรอบส่งให้ ${selectedDriver?.name ?? 'Messenger'} แล้ว · ${result.orderIds.length} จุด`,
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
      className="grid items-start gap-4 xl:grid-cols-[310px_minmax(390px,0.95fr)_minmax(390px,1.05fr)]"
    >
      <div className="rounded-2xl border bg-muted/15 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">1. คลังที่อยู่แยกประเภท</div>
            <div className="text-[10px] text-muted-foreground">
              {savingOrder ? (
                <span className="inline-flex items-center gap-1 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> กำลังบันทึกลำดับ…
                </span>
              ) : (
                'ลากจัดลำดับในคลัง หรือคลิก/ลากไปเติมงาน'
              )}
            </div>
          </div>
          <Badge variant="secondary">{addresses.length} จุด</Badge>
        </div>

        {(['pickup', 'dropoff'] as RouteStopKind[]).map((kind) => {
          const kindEntries = addresses.filter((entry) => entry.kind === kind);
          const search = searchByKind[kind].trim().toLowerCase();
          const entries = search
            ? kindEntries.filter((entry) =>
                [entry.name, entry.address, entry.contact, entry.phone, entry.source]
                  .filter(Boolean)
                  .some((field) => field!.toLowerCase().includes(search)),
              )
            : kindEntries;
          return (
            <div key={kind} className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <div
                  className={`text-xs font-semibold ${kind === 'pickup' ? 'text-info' : 'text-success'}`}
                >
                  {kind === 'pickup' ? 'จุดรับของ' : 'จุดส่งของ'} · {kindEntries.length}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={`h-7 gap-1 rounded-full px-3 text-[11px] font-semibold [&_svg]:size-3.5 ${
                    kind === 'pickup'
                      ? 'border-info/40 text-info hover:border-info hover:bg-info/10 hover:text-info'
                      : 'border-success/40 text-success hover:border-success hover:bg-success/10 hover:text-success'
                  }`}
                  onClick={() => setAddingKind(kind)}
                >
                  <Plus /> เพิ่มใหม่
                </Button>
              </div>
              <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchByKind[kind]}
                  onChange={(event) =>
                    setSearchByKind((current) => ({ ...current, [kind]: event.target.value }))
                  }
                  placeholder={`ค้นหา${kind === 'pickup' ? 'จุดรับ' : 'จุดส่ง'} ชื่อ ที่อยู่ เบอร์…`}
                  className="h-8 pl-8 text-[11px]"
                />
              </div>
              <div className="app-scroll relative mt-1.5 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {entries.length === 0 && (
                  <div className="rounded-md border border-dashed bg-muted/20 px-3 py-3 text-center text-[10px] text-muted-foreground">
                    {search ? 'ไม่พบที่อยู่ที่ตรงกับคำค้น' : 'ยังไม่มีที่อยู่ในกลุ่มนี้'}
                  </div>
                )}
                {entries.map((entry) => {
                  const used = usedAddressIds.has(entry.id);
                  const editable = savedAddressIds.has(entry.id);
                  // จัดลำดับได้เฉพาะจุดที่บันทึกในคลัง และตอนไม่ได้ค้นหา (ลำดับที่เห็นตรงกับที่เก็บ)
                  const reorderable = editable && !search;
                  const isDragging = libraryDragId === entry.id;
                  const isDragOver = libraryDragOverId === entry.id && libraryDragId !== entry.id;
                  return (
                    <article
                      key={entry.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copyMove';
                        event.dataTransfer.setData('application/x-movevai-address', entry.id);
                        if (reorderable) {
                          event.dataTransfer.setData(
                            'application/x-movevai-address-sort',
                            entry.id,
                          );
                          setLibraryDragId(entry.id);
                        }
                      }}
                      onDragEnd={() => {
                        setLibraryDragId(null);
                        setLibraryDragOverId(null);
                      }}
                      onDragOver={(event) => {
                        if (
                          !reorderable ||
                          !event.dataTransfer.types.includes('application/x-movevai-address-sort')
                        )
                          return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        if (libraryDragOverId !== entry.id) setLibraryDragOverId(entry.id);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                          setLibraryDragOverId((current) =>
                            current === entry.id ? null : current,
                          );
                      }}
                      onDrop={(event) => {
                        const draggedId = event.dataTransfer.getData(
                          'application/x-movevai-address-sort',
                        );
                        setLibraryDragOverId(null);
                        setLibraryDragId(null);
                        if (!reorderable || !draggedId) return;
                        event.preventDefault();
                        event.stopPropagation();
                        void reorderLibrary(kind, draggedId, entry.id);
                      }}
                      className={`flex items-start gap-2 rounded-lg border bg-background p-2 transition-colors ${
                        used ? 'opacity-60' : 'hover:border-primary/40'
                      } ${isDragging ? 'opacity-40' : ''} ${
                        isDragOver ? 'border-primary ring-1 ring-primary' : ''
                      } cursor-grab`}
                    >
                      <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold">{entry.name}</div>
                        <div className="line-clamp-2 text-[10px] text-muted-foreground">
                          {entry.address}
                        </div>
                        {(entry.contact || entry.phone) && (
                          <div className="mt-0.5 truncate text-[9px] text-muted-foreground">
                            {entry.contact ? `ผู้รับ: ${entry.contact}` : 'ผู้รับ: —'}
                            {entry.phone ? ` · ${entry.phone}` : ''}
                          </div>
                        )}
                        <div className="mt-0.5 truncate text-[9px] text-muted-foreground/70">
                          {entry.source}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center">
                        {editable && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              disabled={deletingAddressId === entry.id}
                              onClick={() => openAddressEditor(entry.id)}
                            >
                              <Pencil className="h-3 w-3" />
                              <span className="sr-only">แก้ไข {entry.name}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              disabled={deletingAddressId === entry.id}
                              onClick={() => void deleteSavedAddress(entry)}
                            >
                              <Trash2 className="h-3 w-3" />
                              <span className="sr-only">ลบ {entry.name}</span>
                            </Button>
                          </>
                        )}
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
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}

        {addingKind && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              if (!locating) setAddingKind(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border bg-background shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${
                      addingKind === 'pickup' ? 'bg-info' : 'bg-success'
                    }`}
                  >
                    {addingKind === 'pickup' ? (
                      <Package className="h-4.5 w-4.5" />
                    ) : (
                      <MapPin className="h-4.5 w-4.5" />
                    )}
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">
                      เพิ่ม{addingKind === 'pickup' ? 'จุดรับของ' : 'จุดส่งของ'}ใหม่
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      ใช้ชื่อสถานที่ค้นหาแผนที่ได้ แล้วเพิ่มเข้าเที่ยวนี้ทันที
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={locating}
                  onClick={() => setAddingKind(null)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">ปิด</span>
                </Button>
              </div>
              <div className="space-y-3 px-5 py-4">
                <label className="block text-xs font-medium">
                  ชื่อสถานที่
                  <Input
                    className="mt-1"
                    autoFocus
                    placeholder={
                      addingKind === 'pickup' ? 'เช่น สำนักงานใหญ่' : 'เช่น ร้านสาขาวังบูรพา'
                    }
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                  />
                  <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                    ระบบลองค้นหาชื่อสถานที่บนแผนที่ก่อน แล้วใช้ที่อยู่เป็นคำค้นสำรอง
                  </span>
                </label>
                <label className="block text-xs font-medium">
                  ที่อยู่
                  <Input
                    className="mt-1"
                    placeholder="บ้านเลขที่ ถนน แขวง เขต จังหวัด"
                    value={newAddress}
                    onChange={(event) => setNewAddress(event.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium">
                  ชื่อผู้รับ (ถ้ามี)
                  <Input
                    className="mt-1"
                    placeholder="เช่น คุณสมใจ"
                    value={newContact}
                    onChange={(event) => setNewContact(event.target.value)}
                  />
                </label>
                <label className="block text-xs font-medium">
                  เบอร์โทร (ถ้ามี)
                  <Input
                    className="mt-1"
                    placeholder="08x-xxx-xxxx"
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                  />
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <Button variant="ghost" disabled={locating} onClick={() => setAddingKind(null)}>
                  ยกเลิก
                </Button>
                <Button disabled={locating} onClick={() => void addManualAddress()}>
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <MapPin className="h-4 w-4" />
                  )}
                  เพิ่มและปักหมุด
                </Button>
              </div>
            </div>
          </div>
        )}

        {editingAddress && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => {
              if (!locating) setEditingAddress(null);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border bg-background shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                    <Pencil className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">แก้ไขจุดรับ–ส่ง</h2>
                    <p className="text-[11px] text-muted-foreground">
                      บันทึกกลับเข้าคลังที่อยู่ทันที
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={locating}
                  onClick={() => setEditingAddress(null)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">ปิด</span>
                </Button>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium">
                    ประเภท
                    <Select
                      className="mt-1"
                      value={editKind}
                      onChange={(event) => setEditKind(event.target.value as RouteStopKind)}
                    >
                      <option value="pickup">จุดรับของ</option>
                      <option value="dropoff">จุดส่งของ</option>
                    </Select>
                  </label>
                  <label className="block text-xs font-medium">
                    กลุ่ม/สาย
                    <Input
                      className="mt-1"
                      value={editRouteGroup}
                      onChange={(event) => setEditRouteGroup(event.target.value)}
                    />
                  </label>
                </div>
                <label className="block text-xs font-medium">
                  ชื่อสถานที่
                  <Input
                    className="mt-1"
                    autoFocus
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                  <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                    ระบบใช้ชื่อสถานที่ค้นหาแผนที่ได้ หากไม่พบจะลองค้นหาจากที่อยู่
                  </span>
                </label>
                <label className="block text-xs font-medium">
                  ที่อยู่
                  <Input
                    className="mt-1"
                    value={editAddress}
                    onChange={(event) => setEditAddress(event.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-medium">
                    ชื่อผู้รับ
                    <Input
                      className="mt-1"
                      value={editContact}
                      onChange={(event) => setEditContact(event.target.value)}
                    />
                  </label>
                  <label className="block text-xs font-medium">
                    เบอร์ติดต่อ
                    <Input
                      className="mt-1"
                      value={editPhone}
                      onChange={(event) => setEditPhone(event.target.value)}
                    />
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <Button variant="ghost" disabled={locating} onClick={() => setEditingAddress(null)}>
                  ยกเลิก
                </Button>
                <Button disabled={locating} onClick={() => void saveAddressEdit()}>
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                  บันทึกการแก้ไข
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`rounded-2xl border bg-background p-4 shadow-sm transition-colors ${dropActive ? 'bg-primary/5' : ''}`}
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
            <div className="text-sm font-semibold">2. งานในเที่ยวนี้</div>
            <div className="text-[10px] text-muted-foreground">
              1 งาน = <span className="font-medium text-info">รับ 1 จุด</span> +{' '}
              <span className="font-medium text-success">ส่ง 1 จุด</span> · Messenger
              วิ่งเรียงตามลำดับงาน
            </div>
          </div>
          <Badge variant="outline">
            {jobs.length} งาน · {routeStops.length} จุด
          </Badge>
        </div>

        {jobs.length === 0 ? (
          <div className="mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 py-10 text-center">
            <PackagePlus className="h-8 w-8 text-muted-foreground/50" />
            <div className="mt-2 text-sm font-medium">เพิ่มงานแรกของเที่ยววิ่ง</div>
            <div className="mt-1 text-xs text-muted-foreground">
              คลิกหรือลากที่อยู่จากคลัง แล้วระบบจะจัดลงช่องรับ–ส่งของงานให้เอง
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {jobs.map((job, index) => (
              <div
                key={job.id}
                data-route-job-id={job.id}
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('application/x-movevai-route-job', job.id);
                }}
                onDragOver={(event) => {
                  const types = event.dataTransfer.types;
                  if (
                    !types.includes('application/x-movevai-route-job') &&
                    !types.includes('application/x-movevai-address')
                  )
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onDrop={(event) => {
                  const draggedJobId = event.dataTransfer.getData(
                    'application/x-movevai-route-job',
                  );
                  const addressId = event.dataTransfer.getData('application/x-movevai-address');
                  if (!draggedJobId && !addressId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (draggedJobId) moveJobBefore(draggedJobId, job.id);
                  else placeAddressInJob(job.id, addressId);
                }}
                className="rounded-xl border bg-background shadow-sm transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-2 rounded-t-xl border-b bg-muted/20 px-3 py-1">
                  <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
                  <span className="flex-1 text-xs font-semibold">งานที่ {index + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => moveJob(job.id, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span className="sr-only">เลื่อนงานขึ้น</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === jobs.length - 1}
                    onClick={() => moveJob(job.id, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span className="sr-only">เลื่อนงานลง</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeJob(job.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">ลบงานที่ {index + 1}</span>
                  </Button>
                </div>
                {(['pickup', 'dropoff'] as RouteStopKind[]).map((kind) => {
                  const isPickup = kind === 'pickup';
                  const stop = isPickup ? job.pickup : job.dropoff;
                  return (
                    <Fragment key={kind}>
                      {!isPickup && (
                        <div className="ml-[1.6rem] h-2.5 border-l-2 border-border/70" />
                      )}
                      {stop ? (
                        <div className="flex items-start gap-2 px-3 py-2">
                          <span
                            className={`mt-0.5 inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              isPickup ? 'bg-info/10 text-info' : 'bg-success/10 text-success'
                            }`}
                          >
                            {isPickup ? 'รับ' : 'ส่ง'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold">{stop.name}</div>
                            <div className="line-clamp-1 text-[11px] text-muted-foreground">
                              {stop.address}
                            </div>
                            {(stop.contact || stop.phone) && (
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {stop.contact ? `ผู้รับ: ${stop.contact}` : 'ผู้รับ: —'}
                                {stop.phone ? ` · ${stop.phone}` : ''}
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => clearJobSlot(job.id, kind)}
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">
                              นำ{isPickup ? 'จุดรับ' : 'จุดส่ง'}ออกจากงานที่ {index + 1}
                            </span>
                          </Button>
                        </div>
                      ) : (
                        <div className="mx-3 my-2 flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span
                              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                isPickup ? 'bg-info/10 text-info' : 'bg-success/10 text-success'
                              }`}
                            >
                              {isPickup ? 'รับ' : 'ส่ง'}
                            </span>
                            เลือก{isPickup ? 'จุดรับ' : 'จุดส่ง'}จากคลัง หรือ
                          </span>
                          <button
                            type="button"
                            className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
                            onClick={() => setAddingKind(kind)}
                          >
                            + เพิ่มใหม่
                          </button>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="mt-2 w-full border-dashed"
          disabled={jobs.some((job) => !job.pickup && !job.dropoff)}
          onClick={addEmptyJob}
        >
          <Plus className="h-4 w-4" /> เพิ่มงานรับ–ส่ง
        </Button>

        {routeStops.length > 0 && (
          <section className="mt-3 rounded-lg bg-muted/20 px-3 py-2.5">
            <div className="text-[10px] font-medium text-muted-foreground">
              ลำดับวิ่งจริง <span aria-hidden="true">·</span>{' '}
              <span className="font-semibold text-foreground">{routeStops.length}</span> จุด
            </div>
            <ol className="mt-3 space-y-3">
              {routeSequence.map(({ stop, jobNumber }, index) => {
                const isFirstStopOfJob =
                  index === 0 || routeSequence[index - 1].jobNumber !== jobNumber;
                return (
                  <Fragment key={`${jobNumber}-${stop.kind}-${stop.id}`}>
                    {isFirstStopOfJob && (
                      <li className={index > 0 ? 'pt-1' : undefined}>
                        <span className="rounded-full bg-foreground/8 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                          งานที่ {jobNumber}
                        </span>
                      </li>
                    )}
                    <li className="flex items-start gap-2">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                          stop.kind === 'pickup' ? 'bg-info' : 'bg-success'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 text-xs font-semibold leading-snug">
                        <span className={stop.kind === 'pickup' ? 'text-info' : 'text-success'}>
                          {stop.kind === 'pickup' ? 'รับ' : 'ส่ง'}
                        </span>
                        <span className="mx-1 text-muted-foreground" aria-hidden="true">
                          ·
                        </span>
                        <span className="break-words">{stop.name}</span>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </section>
        )}

        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
            validationError
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'bg-muted/20 text-muted-foreground'
          }`}
        >
          {validationError ? (
            validationError
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> ทุกงานมีจุดรับ–ส่งครบ พร้อมสร้างงาน
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPinned className="h-4 w-4" /> 3. แผนที่และการส่งงาน
            </div>
            <div className="text-[10px] text-muted-foreground">เส้นทางถนนเปลี่ยนตามลำดับที่ลาก</div>
          </div>
          <Badge className="gap-1" variant="secondary">
            <Route className="h-3 w-3" /> {routeStops.length} จุด
          </Badge>
        </div>
        {routeStops.length > 0 ? (
          <RouteStopsMap stops={routeStops} className="mt-3 h-96" />
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            แผนที่จะปรากฏเมื่อเพิ่มจุดรับหรือจุดส่งแล้ว
          </div>
        )}

        <label className="mt-4 block text-xs font-medium">
          ชื่อที่แสดงบน Messenger{' '}
          <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
          <Input
            value={messengerTitle}
            onChange={(event) => setMessengerTitle(event.target.value)}
            className="mt-1 bg-background"
            placeholder="เช่น รอบเอกสารสุขุมวิทเช้า"
            maxLength={50}
          />
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
            เว้นว่างเพื่อไม่แสดงหัวเรื่องบน Card · ไม่ต้องใส่ชื่อจุดรับและจุดส่งซ้ำ
          </span>
        </label>

        <section className="mt-4 rounded-xl border bg-muted/20 p-3">
          <div className="text-xs font-semibold">รูปแบบการส่งงาน</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                งานเด้งเข้ามือถือเลย · ต้องกดรับภายใน {acceptWithinMinutes} นาที
              </div>
            </button>
            <button
              type="button"
              data-testid="dispatch-planning"
              onClick={() => setMode('scheduled')}
              className={`rounded-xl border p-3 text-left transition-colors ${mode === 'scheduled' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}
            >
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="h-3.5 w-3.5 text-info" /> มอบงานตามวัน–เวลา
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                ยืนยันครั้งเดียว · มอบรอบตามวัน–เวลานี้ให้ Messenger โดยตรง
              </div>
            </button>
          </div>
        </section>

        {mode === 'immediate' && (
          <section className="mt-3 rounded-xl border border-warning/25 bg-warning/5 p-3">
            <label className="block text-xs font-medium">
              Messenger ต้องรับงานภายใน
              <Select
                className="mt-1 bg-background"
                value={acceptWithinMinutes}
                onChange={(event) => setAcceptWithinMinutes(Number(event.target.value))}
              >
                {ACCEPT_WITHIN_MINUTES_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} นาที
                  </option>
                ))}
              </Select>
              <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                หากไม่รับภายในเวลาที่กำหนด ระบบจะแสดงว่างานเกินกำหนดใน Messenger
              </span>
            </label>
          </section>
        )}

        {mode === 'scheduled' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> วันที่ส่ง
              </span>
              <DatePicker
                value={plannedDate}
                onChange={setPlannedDate}
                className="mt-1 w-full"
                disablePastDates
              />
            </label>
            <label className="text-xs font-medium">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" /> เวลาออก (จำเป็น)
              </span>
              <TimePicker
                value={plannedTime}
                onChange={setPlannedTime}
                className="mt-1 w-full"
                required
              />
              <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                ต้องระบุเวลา · ระบบมอบงานให้ Messenger โดยตรง และแจ้งเตือนล่วงหน้าตามรอบ
              </span>
            </label>
          </div>
        )}

        <label className="mt-3 block text-xs font-medium">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" /> คนขับ (จำเป็น)
          </span>
          <Select
            className="mt-1"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">— เลือกคนขับ —</option>
            {availableDrivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name} · {formatDriverDispatchStatus(driver, orders)}
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
                className={`mt-1 text-[10px] ${deriveDriverDisplayStatus(selectedDriver, orders) === 'available' ? 'text-success' : 'text-warning'}`}
              >
                {formatDriverDispatchStatus(selectedDriver, orders)}
              </div>
            </div>
            <Badge variant="outline">{selectedDriver.zone || 'ไม่ระบุโซน'}</Badge>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
            <UserRound className="h-4 w-4" /> เลือกคนขับก่อนจึงจะส่งแผนงานได้
          </div>
        )}

        <label className="mt-3 block text-xs font-medium">
          หมายเหตุถึง Messenger <span className="font-normal text-muted-foreground">(ถ้ามี)</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="เช่น ติดต่อคุณสมชายก่อนถึงหน้างาน หรือฝากบัตรผ่านกับ รปภ."
            maxLength={1000}
          />
        </label>

        <Button
          data-testid="create-route-run"
          className="mt-3 w-full"
          disabled={submitting || Boolean(validationError) || missingDispatchRequirement}
          onClick={openDispatchPreview}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {submitting
            ? 'กำลังสร้างเที่ยว…'
            : mode === 'immediate'
              ? `ตรวจสอบ 1 เที่ยว (${routeStops.length} จุด) ก่อนส่ง`
              : `ตรวจสอบรอบส่ง 1 เที่ยว (${routeStops.length} จุด) ก่อนมอบงาน`}
        </Button>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          {mode === 'immediate'
            ? 'ตรวจสอบรายละเอียดก่อน · ยืนยันในขั้นถัดไปจึงจะส่งจริง'
            : 'ตรวจสอบรายละเอียดก่อน · ยืนยันในขั้นถัดไปจะมอบงานให้ Messenger โดยตรง'}
        </p>
      </div>

      {selectedDriver && (
        <ConfirmDispatchDialog
          open={confirmDispatchOpen}
          title={
            mode === 'immediate'
              ? 'ตรวจสอบก่อนส่งให้ Messenger'
              : 'ตรวจสอบก่อนมอบรอบส่งให้ Messenger'
          }
          description={
            mode === 'immediate'
              ? 'งานจะส่งไปที่มือถือคนขับทันทีหลังยืนยัน'
              : 'รอบนี้จะมอบให้ Messenger หลังยืนยัน โดยไม่ผ่านหน้า Delivery Planning'
          }
          confirmLabel={mode === 'immediate' ? 'ยืนยันส่งเที่ยว' : 'ยืนยันมอบรอบส่ง'}
          submitting={submitting}
          warnings={
            selectedDriver.activeOrders > 0
              ? [
                  `${selectedDriver.name} มีงานค้างอยู่ ${selectedDriver.activeOrders} งาน — ตรวจสอบก่อนยืนยัน`,
                ]
              : undefined
          }
          onCancel={() => setConfirmDispatchOpen(false)}
          onConfirm={() => void submit()}
        >
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-sm font-medium">
                {messengerTitle.trim() ||
                  `เที่ยว ${routeStops[0]?.name ?? 'จุดรับ'} → ${
                    routeStops[routeStops.length - 1]?.name ?? 'จุดส่ง'
                  }`}
              </div>
              <Badge variant={mode === 'immediate' ? 'warning' : 'secondary'} className="shrink-0">
                {mode === 'immediate' ? (
                  <Send className="h-3 w-3" />
                ) : (
                  <CalendarDays className="h-3 w-3" />
                )}
                {mode === 'immediate' ? 'ส่งทันที' : 'มอบงานตามเวลา'}
              </Badge>
            </div>

            <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
              {mode === 'immediate' ? (
                <span>ส่งวันนี้ · Messenger ต้องรับงานภายใน {acceptWithinMinutes} นาที</span>
              ) : (
                <span>
                  วันออกงาน {plannedDate} · {plannedTime}
                </span>
              )}
            </div>

            <ol className="mt-3 space-y-2">
              {routeSequence.map(({ stop, jobNumber }, index) => (
                <li
                  key={`${jobNumber}-${stop.kind}-${stop.id}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                      stop.kind === 'pickup' ? 'bg-info' : 'bg-success'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium">
                      <span className={stop.kind === 'pickup' ? 'text-info' : 'text-success'}>
                        {stop.kind === 'pickup' ? 'รับ' : 'ส่ง'}
                      </span>{' '}
                      · {stop.name}
                    </div>
                    <div className="line-clamp-2 text-[11px] text-muted-foreground">
                      {stop.address}
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            {note.trim() && (
              <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">หมายเหตุ:</span> {note.trim()}
              </div>
            )}
          </div>
          <DriverSummaryRow
            driver={selectedDriver}
            orders={orders}
            plannedDate={mode === 'scheduled' ? plannedDate : undefined}
            detail={
              mode === 'immediate'
                ? `ต้องรับงานภายใน ${acceptWithinMinutes} นาที`
                : `เวลาออก ${plannedTime}`
            }
          />
        </ConfirmDispatchDialog>
      )}
    </section>
  );
}
