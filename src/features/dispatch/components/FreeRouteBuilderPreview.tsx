import { Fragment, useMemo, useState } from 'react';
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
import {
  createAdHocRouteRun,
  createRouteAddress,
  deleteRouteAddress,
  geocodeAddress,
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

type DispatchMode = 'planning' | 'immediate';
const ACCEPT_WITHIN_MINUTES_OPTIONS = [5, 10, 15, 20, 30];

function seedStops(): BuilderStop[] {
  return [];
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

// บังคับให้ส่วนจุดรับอยู่ก่อนจุดส่งเสมอ เพื่อให้หน้าจอและลำดับการวิ่งอ่านง่าย
function groupStopsByKind<T extends RouteStop>(stops: T[]) {
  return [
    ...stops.filter((stop) => stop.kind === 'pickup'),
    ...stops.filter((stop) => stop.kind === 'dropoff'),
  ];
}

// จับคู่จุดรับและจุดส่งตามลำดับที่ผู้ใช้จัดในรายการ เพื่อไม่ให้ต้องเลือกจุดส่งซ้ำ
function pairStopsByOrder(stops: BuilderStop[]) {
  const grouped = groupStopsByKind(stops);
  const dropoffs = grouped.filter((stop) => stop.kind === 'dropoff');
  let pickupIndex = 0;

  return grouped.map((stop) => {
    if (stop.kind === 'dropoff') return { ...stop, deliverToStopId: undefined };
    const deliverToStopId = dropoffs[pickupIndex]?.id;
    pickupIndex += 1;
    return { ...stop, deliverToStopId };
  });
}

function stopError(stops: BuilderStop[]) {
  if (!stops.some((stop) => stop.kind === 'pickup')) return 'เพิ่มจุดรับอย่างน้อย 1 จุด';
  if (!stops.some((stop) => stop.kind === 'dropoff')) return 'เพิ่มจุดส่งอย่างน้อย 1 จุด';
  const indexById = new Map(stops.map((stop, index) => [stop.id, index]));
  for (const stop of stops) {
    if (stop.kind !== 'pickup') continue;
    if (!stop.deliverToStopId) return `จุดรับ “${stop.name}” ยังไม่มีจุดส่งในลำดับเดียวกัน`;
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
  onCreated: () => Promise<void> | void;
}) {
  const [stops, setStops] = useState<BuilderStop[]>(seedStops);
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
  const [submitting, setSubmitting] = useState(false);

  const addresses = useMemo(() => [...savedAddressBookEntries(savedAddresses)], [savedAddresses]);
  const usedAddressIds = useMemo(() => new Set(stops.map((stop) => stop.id)), [stops]);
  const savedAddressIds = useMemo(
    () => new Set(savedAddresses.map((address) => address.id)),
    [savedAddresses],
  );
  const routeStops = useMemo(() => pairStopsByOrder(stops), [stops]);
  const pickupStops = routeStops.filter((stop) => stop.kind === 'pickup');
  const dropoffStops = routeStops.filter((stop) => stop.kind === 'dropoff');
  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const availableDrivers = drivers.filter((driver) => driver.status !== 'off_duty');
  const validationError = stopError(routeStops);
  const pickupPreviews = useMemo(
    () =>
      routeStops
        .filter((stop) => stop.kind === 'pickup')
        .map((pickup) => ({
          pickup,
          dropoff: routeStops.find((stop) => stop.id === pickup.deliverToStopId),
        })),
    [routeStops],
  );

  const addAddress = (addressId: string) => {
    const address = addresses.find((entry) => entry.id === addressId);
    if (!address || usedAddressIds.has(addressId)) return;
    setStops((current) => {
      const nextStop: BuilderStop = {
        ...address,
        deliverToStopId: undefined,
        sourceLabel: address.source,
      };
      return groupStopsByKind([...current, nextStop]);
    });
  };

  const removeStop = (stopId: string) => {
    setStops((current) =>
      groupStopsByKind(
        current
          .filter((stop) => stop.id !== stopId)
          .map((stop) => ({ ...stop, deliverToStopId: undefined })),
      ),
    );
  };

  const moveStop = (stopId: string, direction: -1 | 1) => {
    setStops((current) => {
      const index = current.findIndex((stop) => stop.id === stopId);
      return groupStopsByKind(moveItem(current, index, index + direction));
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
      return groupStopsByKind(next);
    });
  };

  const addManualAddress = async () => {
    if (!addingKind || !newName.trim() || !newAddress.trim()) {
      return toast.error('ระบุชื่อสถานที่และที่อยู่ให้ครบ');
    }
    setLocating(true);
    try {
      const geo = await geocodeAddress(newAddress.trim()).catch(() => null);
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
      setStops((current) =>
        groupStopsByKind([...current, { ...entry, sourceLabel: entry.source }]),
      );
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
      const geo = await geocodeAddress(editAddress.trim()).catch(() => null);
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
      removeStop(address.id);
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

  const submit = async () => {
    if (validationError) return toast.error(validationError);
    if (mode === 'immediate' && !selectedDriver) return toast.error('เลือกคนขับก่อนส่งงานทันที');
    setSubmitting(true);
    try {
      const first = stops[0]?.name ?? 'จุดรับ';
      const last = stops[stops.length - 1]?.name ?? 'จุดส่ง';
      const result = await createAdHocRouteRun({
        name: `เที่ยว ${first} → ${last}`,
        messengerTitle: messengerTitle.trim() || undefined,
        stops: routeStops.map(({ sourceLabel: _sourceLabel, ...stop }) => stop),
        plannedDate,
        plannedTime: plannedTime || undefined,
        driverId: driverId || undefined,
        dispatchMode: mode,
        note: note.trim() || undefined,
        acceptWithinMinutes,
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
                'ลากจัดลำดับในคลัง หรือลากไปเที่ยว/กดเพิ่ม'
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
                      เข้าคลังที่อยู่ และเพิ่มเข้าเที่ยวนี้ให้ทันที
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
            <div className="text-sm font-semibold">2. ลำดับเที่ยวและคู่รับ–ส่ง</div>
            <div className="text-[10px] text-muted-foreground">
              ลากสลับลำดับ และเลือกปลายทางของแต่ละจุดรับ
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-medium">
              <span className="rounded-full bg-info/10 px-2 py-0.5 text-info">จุดรับของ</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">จุดส่งของ</span>
            </div>
          </div>
          <Badge variant="outline">{stops.length} จุด</Badge>
        </div>

        {stops.length === 0 ? (
          <div className="mt-3 flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 py-10 text-center">
            <PackagePlus className="h-8 w-8 text-muted-foreground/50" />
            <div className="mt-2 text-sm font-medium">ลากจุดรับหรือจุดส่งมาวาง</div>
            <div className="mt-1 text-xs text-muted-foreground">
              เพิ่มกี่จุดก็ได้ แล้วค่อยจับคู่กันในเที่ยวนี้
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-info/20 bg-info/5 px-2.5 py-2 text-[10px] font-medium text-info">
              <Package className="h-3.5 w-3.5" /> จุดรับของ
            </div>
            {pickupStops.length === 0 && (
              <div className="rounded-md border border-dashed border-info/30 bg-info/5 px-3 py-2 text-[10px] text-muted-foreground">
                ยังไม่มีจุดรับของ — เพิ่มจากคลังด้านซ้ายก่อนจัดจุดส่ง
              </div>
            )}
            {stops.map((stop, index) => {
              const isPickup = stop.kind === 'pickup';
              const previousKind = stops[index - 1]?.kind;
              const showSectionDivider = !isPickup && (index === 0 || previousKind === 'pickup');
              const stopsOfSameKind = isPickup ? pickupStops : dropoffStops;
              const indexWithinKind = stopsOfSameKind.findIndex((item) => item.id === stop.id);
              const linkedPickups = routeStops.filter(
                (pickup) => pickup.kind === 'pickup' && pickup.deliverToStopId === stop.id,
              );
              return (
                <Fragment key={stop.id}>
                  {showSectionDivider && (
                    <div className="flex items-center gap-3 py-1.5">
                      <div className="h-px flex-1 bg-success/30" />
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
                        จุดส่งของ
                      </span>
                      <div className="h-px flex-1 bg-success/30" />
                    </div>
                  )}
                  <div
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
                    className={`rounded-lg border border-l-2 p-3 shadow-sm transition-colors ${
                      isPickup
                        ? 'border-info/30 border-l-info bg-info/5 hover:bg-info/10'
                        : 'border-success/30 border-l-success bg-success/5 hover:bg-success/10'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          isPickup ? 'bg-info/15 text-info' : 'bg-success/15 text-success'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                              isPickup
                                ? 'border-info/30 text-info'
                                : 'border-success/30 text-success'
                            }`}
                          >
                            {isPickup ? (
                              <Package className="h-3 w-3" />
                            ) : (
                              <MapPin className="h-3 w-3" />
                            )}
                            {isPickup ? 'รับของ' : 'ส่งของ'}
                          </span>
                          <span className="text-xs font-semibold">{stop.name}</span>
                        </div>
                        <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {stop.address}
                        </div>
                        {(stop.contact || stop.phone) && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {stop.contact ? `ผู้รับ: ${stop.contact}` : 'ผู้รับ: —'}
                            {stop.phone ? ` · ${stop.phone}` : ''}
                          </div>
                        )}
                        {!isPickup && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-success/20 bg-success/10 px-2 py-1.5 text-[10px] font-medium text-success">
                            <Package className="h-3 w-3 shrink-0" /> รับมาจาก
                            {linkedPickups.length > 0 ? (
                              linkedPickups.map((pickup) => (
                                <span
                                  key={pickup.id}
                                  className="rounded-full border border-success/20 bg-background px-2 py-0.5 text-foreground"
                                >
                                  {pickup.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-foreground">
                                ยังไม่มีจุดรับที่เลือกส่งมาที่นี่
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={indexWithinKind === 0}
                          onClick={() => moveStop(stop.id, -1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                          <span className="sr-only">เลื่อนขึ้น</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={indexWithinKind === stopsOfSameKind.length - 1}
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
                </Fragment>
              );
            })}
          </div>
        )}

        {pickupPreviews.length > 0 && (
          <section className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="text-[11px] font-semibold text-primary">Preview คู่รับ → ส่ง</div>
            <div className="mt-2 space-y-1.5">
              {pickupPreviews.map(({ pickup, dropoff }) => (
                <div
                  key={pickup.id}
                  className="flex min-w-0 items-center gap-2 rounded-md border border-primary/15 bg-background px-2.5 py-2 text-[11px]"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-info">
                    รับ: {pickup.name}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span
                    className={`min-w-0 flex-1 truncate text-right ${
                      dropoff ? 'font-medium text-success' : 'text-muted-foreground'
                    }`}
                  >
                    {dropoff ? `ส่ง: ${dropoff.name}` : 'ส่ง: ยังไม่เลือก'}
                  </span>
                </div>
              ))}
            </div>
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
              <CheckCircle2 className="h-3.5 w-3.5" /> คู่รับ–ส่งและลำดับถูกต้อง พร้อมสร้างงาน
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
            <Route className="h-3 w-3" /> {stops.length} จุด
          </Badge>
        </div>
        {stops.length > 0 ? (
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

        {mode === 'planning' && (
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
                <Clock3 className="h-3.5 w-3.5" /> เวลาออก
              </span>
              <TimePicker value={plannedTime} onChange={setPlannedTime} className="mt-1 w-full" />
            </label>
          </div>
        )}

        <label className="mt-3 block text-xs font-medium">
          <span className="inline-flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" />{' '}
            {mode === 'immediate' ? 'คนขับ (จำเป็น)' : 'คนขับ (เลือกภายหลังได้)'}
          </span>
          <Select
            className="mt-1"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">
              {mode === 'immediate'
                ? '— เลือกคนขับเพื่อส่งงาน —'
                : '— ยังไม่เลือก (จัดตอน Planning) —'}
            </option>
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
            <UserRound className="h-4 w-4" />{' '}
            {mode === 'immediate'
              ? 'เลือกคนขับก่อนจึงจะส่งงานได้'
              : 'เลือกคนขับเพื่อดูรูป โปรไฟล์ รถ และสถานะงาน'}
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
          disabled={
            submitting || Boolean(validationError) || (mode === 'immediate' && !selectedDriver)
          }
          onClick={() => void submit()}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
    </section>
  );
}
