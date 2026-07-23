import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  BookmarkPlus,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  MapPin,
  Navigation,
  Plus,
  Search,
  Send,
  Timer,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import type { Driver, Order } from '@/data/orderTypes';
import { createDispatchJobs } from '@/features/dispatch/dispatchJobs';
import type { DispatchCreationOutcome, DispatchJobType } from '@/features/dispatch/types';
import { dispatchJobTypeLabel } from '@/features/dispatch/types';
import { formatDriverDispatchStatus } from '@/lib/deliveryExecution';
import {
  getNextPlanningSlot,
  getPlanningDateTimeMs,
  getTodayDateKey,
} from '@/lib/deliveryPlanning';
import {
  createQuickRoutePreset,
  createRouteAddress,
  fetchQuickRoutePresets,
  markQuickRoutePresetUsed,
  type QuickRoutePreset,
  type RouteAddress,
} from '@/lib/retailApi';
import { cn } from '@/lib/utils';

type PointTarget = 'pickup' | 'dropoff';

type SelectedPoint = {
  addressId?: string;
  name: string;
  contact?: string;
  phone?: string;
  address: string;
};

type Props = {
  open: boolean;
  savedAddresses: RouteAddress[];
  drivers: Driver[];
  orders: Order[];
  onAddressCreated: (address: RouteAddress) => void;
  onClose: () => void;
  onCreated: (outcome: DispatchCreationOutcome) => Promise<void> | void;
};

const URGENT_ACCEPT_WITHIN_MINUTES = 5;
const TOP_PRESET_COUNT = 4;

function toSelectedPoint(address: RouteAddress): SelectedPoint {
  return {
    addressId: address.id,
    name: address.name,
    contact: address.contact,
    phone: address.phone,
    address: address.address,
  };
}

function sortPresets(presets: QuickRoutePreset[]) {
  return [...presets].sort((left, right) => {
    if (left.pinned !== right.pinned) return Number(right.pinned) - Number(left.pinned);
    const lastUsed =
      new Date(right.lastUsedAt ?? 0).getTime() - new Date(left.lastUsedAt ?? 0).getTime();
    if (lastUsed !== 0) return lastUsed;
    if (left.useCount !== right.useCount) return right.useCount - left.useCount;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function pointSummary(point: SelectedPoint) {
  return [point.address, point.contact, point.phone].filter(Boolean).join(' · ');
}

function pointDispatchName(point: SelectedPoint) {
  return point.contact?.trim() || point.name.trim();
}

function AddressPickerDialog({
  initialTarget,
  chainToDropoff,
  pickedPickup,
  addresses,
  onClose,
  onSelected,
  onManual,
}: {
  initialTarget: PointTarget;
  /** เปิดจากจุดรับตอนยังไม่มีจุดส่ง = เลือกรับเสร็จแล้วต่อด้วยจุดส่งทันทีในหน้าต่างเดียว */
  chainToDropoff: boolean;
  pickedPickup: SelectedPoint | null;
  addresses: RouteAddress[];
  onClose: () => void;
  onSelected: (target: PointTarget, address: RouteAddress) => void;
  onManual: (
    target: PointTarget,
    point: SelectedPoint,
    saveToAddressBook: boolean,
  ) => Promise<boolean>;
}) {
  const [target, setTarget] = useState<PointTarget>(initialTarget);
  const [search, setSearch] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saveToAddressBook, setSaveToAddressBook] = useState(true);
  const [saving, setSaving] = useState(false);

  const onDropoffStep = target === 'dropoff';
  const targetLabel = onDropoffStep ? 'จุดส่ง' : 'จุดรับ';
  // ขั้นเลือกจุดส่ง: ตัดสถานที่ที่เพิ่งเลือกเป็นจุดรับออก กันรับ–ส่งจุดเดียวกัน
  const selectableAddresses =
    onDropoffStep && pickedPickup?.addressId
      ? addresses.filter((item) => item.id !== pickedPickup.addressId)
      : addresses;

  const normalizedSearch = search.trim().toLowerCase();
  const filteredAddresses = normalizedSearch
    ? selectableAddresses.filter((item) =>
        [item.name, item.contact, item.phone, item.address, item.routeGroup]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch)),
      )
    : selectableAddresses;
  const favorites = selectableAddresses.filter((item) => item.favorite).slice(0, TOP_PRESET_COUNT);

  const resetEntry = () => {
    setSearch('');
    setAddingNew(false);
    setName('');
    setContact('');
    setPhone('');
    setAddress('');
  };

  const advanceOrClose = () => {
    if (!onDropoffStep && chainToDropoff) {
      setTarget('dropoff');
      resetEntry();
      return;
    }
    onClose();
  };

  const selectAddress = (item: RouteAddress) => {
    onSelected(target, item);
    advanceOrClose();
  };

  const submitManual = async () => {
    if (!address.trim()) {
      toast.error(`ระบุที่อยู่${targetLabel}ก่อน`);
      return;
    }
    setSaving(true);
    try {
      const selected = await onManual(
        target,
        {
          name: name.trim() || `จุด${onDropoffStep ? 'ส่ง' : 'รับ'}ใหม่`,
          contact: contact.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim(),
        },
        saveToAddressBook,
      );
      if (selected) advanceOrClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="app-scroll max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-background shadow-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">เลือก{targetLabel}</h3>
              {chainToDropoff && (
                <Badge variant="secondary">ขั้นที่ {onDropoffStep ? '2' : '1'}/2</Badge>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {chainToDropoff
                ? onDropoffStep
                  ? 'เลือกจุดส่งต่อได้เลย ไม่ต้องเปิดใหม่'
                  : 'เลือกจุดรับก่อน แล้วต่อด้วยจุดส่งทันที'
                : 'เลือกจากคลังเดียวกับหน้าสร้างเที่ยววิ่ง'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4" />
            <span className="sr-only">ปิด</span>
          </Button>
        </header>

        <div className="space-y-4 p-5">
          {chainToDropoff && onDropoffStep && pickedPickup && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-info/10 p-3">
              <span className="flex min-w-0 items-center gap-2 text-xs">
                <MapPin className="h-4 w-4 shrink-0 text-info" />
                <span className="min-w-0">
                  <span className="block font-medium">จุดรับ: {pickedPickup.name}</span>
                  <span className="block truncate text-muted-foreground">
                    {pickedPickup.address}
                  </span>
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setTarget('pickup');
                  resetEntry();
                }}
                disabled={saving}
              >
                เปลี่ยน
              </Button>
            </div>
          )}
          {!addingNew ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="ค้นหาชื่อ กลุ่ม ที่อยู่ หรือเบอร์…"
                  autoFocus
                />
              </div>

              {!normalizedSearch && favorites.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-xs font-semibold">สถานที่ใช้บ่อย</h4>
                    <span className="text-xs text-muted-foreground">{favorites.length} รายการ</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {favorites.map((item) => (
                      <AddressOption
                        key={item.id}
                        address={item}
                        onClick={() => selectAddress(item)}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-semibold">
                    {normalizedSearch ? 'ผลการค้นหา' : 'ทุกสถานที่ในคลัง'}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {filteredAddresses.length} รายการ
                  </span>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredAddresses.map((item) => (
                    <AddressOption
                      key={item.id}
                      address={item}
                      onClick={() => selectAddress(item)}
                    />
                  ))}
                  {filteredAddresses.length === 0 && (
                    <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                      ไม่พบสถานที่ในคลัง
                    </div>
                  )}
                </div>
              </section>

              <Button variant="outline" className="w-full" onClick={() => setAddingNew(true)}>
                <Plus className="h-4 w-4" /> ใช้ที่อยู่ใหม่
              </Button>
            </>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">ใช้ที่อยู่ใหม่</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingNew(false)}
                  disabled={saving}
                >
                  กลับไปคลัง
                </Button>
              </div>
              <label className="block text-xs font-medium">
                ชื่อสถานที่
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1"
                  placeholder={target === 'pickup' ? 'เช่น สำนักงานลูกค้า' : 'เช่น บ้านผู้รับ'}
                />
              </label>
              <label className="block text-xs font-medium">
                ที่อยู่ *
                <Input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="mt-1"
                  placeholder="ระบุที่อยู่หรือจุดนัดพบ"
                  autoFocus
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium">
                  ผู้ติดต่อ
                  <Input
                    value={contact}
                    onChange={(event) => setContact(event.target.value)}
                    className="mt-1"
                    placeholder="ถ้ามี"
                  />
                </label>
                <label className="text-xs font-medium">
                  เบอร์โทร
                  <Input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1"
                    placeholder="08x-xxx-xxxx"
                  />
                </label>
              </div>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs">
                <input
                  type="checkbox"
                  checked={saveToAddressBook}
                  onChange={(event) => setSaveToAddressBook(event.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">บันทึกในคลังสถานที่</span>
                  <span className="text-muted-foreground">
                    ใช้ซ้ำได้จากงานด่วนและสร้างเที่ยววิ่ง
                  </span>
                </span>
              </label>
              <Button className="w-full" onClick={() => void submitManual()} disabled={saving}>
                {saving ? 'กำลังเลือกจุด…' : `ใช้เป็น${targetLabel}`}
              </Button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function AddressOption({ address, onClick }: { address: RouteAddress; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{address.name}</span>
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
            {address.address}
          </span>
        </span>
        {address.favorite && <Badge variant="secondary">ใช้บ่อย</Badge>}
      </div>
      {(address.contact || address.phone) && (
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {[address.contact, address.phone].filter(Boolean).join(' · ')}
        </span>
      )}
      <span className="mt-1 block truncate text-[11px] text-muted-foreground/80">
        {address.routeGroup}
      </span>
    </button>
  );
}

function RoutePresetPickerDialog({
  presets,
  onClose,
  onSelected,
}: {
  presets: QuickRoutePreset[];
  onClose: () => void;
  onSelected: (preset: QuickRoutePreset) => void;
}) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const filteredPresets = normalizedSearch
    ? presets.filter((preset) =>
        [
          preset.label,
          preset.pickup.name,
          preset.pickup.address,
          preset.dropoff.name,
          preset.dropoff.address,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch)),
      )
    : presets;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="app-scroll max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-background shadow-2xl sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">เส้นทางด่วนทั้งหมด</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {presets.length} รายการจาก database
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">ปิด</span>
          </Button>
        </header>
        <div className="space-y-3 p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="ค้นหาจุดรับ จุดส่ง หรือชื่อเส้นทาง…"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelected(preset)}
                className="w-full rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {preset.label || `${preset.pickup.name} → ${preset.dropoff.name}`}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      รับ {preset.pickup.name} → ส่ง {preset.dropoff.name}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </button>
            ))}
            {filteredPresets.length === 0 && (
              <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                ไม่พบเส้นทางที่ตรงกับคำค้น
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuickCreateDialog({
  open,
  savedAddresses,
  drivers,
  orders,
  onAddressCreated,
  onClose,
  onCreated,
}: Props) {
  const initialAppointmentSlot = useMemo(() => getNextPlanningSlot(), []);
  const [jobType, setJobType] = useState<Exclude<DispatchJobType, 'order'>>('other');
  const [title, setTitle] = useState('งานด่วน');
  const [driverId, setDriverId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(initialAppointmentSlot.date);
  const [appointmentTime, setAppointmentTime] = useState(initialAppointmentSlot.time);
  const [pickup, setPickup] = useState<SelectedPoint | null>(null);
  const [dropoff, setDropoff] = useState<SelectedPoint | null>(null);
  const [routePresets, setRoutePresets] = useState<QuickRoutePreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ target: PointTarget; chainToDropoff: boolean } | null>(
    null,
  );
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const availableDrivers = useMemo(
    () => drivers.filter((driver) => driver.status !== 'off_duty'),
    [drivers],
  );
  const selectedDriver = availableDrivers.find((driver) => driver.id === driverId);
  const topPresets = routePresets.slice(0, TOP_PRESET_COUNT);
  const canSavePreset =
    pickup?.addressId != null &&
    dropoff?.addressId != null &&
    pickup.addressId !== dropoff.addressId &&
    selectedPresetId == null;

  useEffect(() => {
    if (!open) return;
    setJobType('other');
    setTitle('งานด่วน');
    setDriverId('');
    const nextAppointment = getNextPlanningSlot();
    setAppointmentDate(nextAppointment.date);
    setAppointmentTime(nextAppointment.time);
    setPickup(null);
    setDropoff(null);
    setSelectedPresetId(null);
    setPicker(null);
    setPresetPickerOpen(false);
    setShowMore(false);
    void fetchQuickRoutePresets()
      .then((presets) => setRoutePresets(sortPresets(presets)))
      .catch((error) =>
        toast.error(
          error instanceof Error ? error.message : 'โหลดเส้นทางด่วนที่บันทึกไว้ไม่สำเร็จ',
        ),
      );
  }, [open]);

  if (!open) return null;

  // เปิดจากจุดรับตอนยังไม่มีจุดส่ง = flow ต่อเนื่อง เลือกรับแล้วต่อส่งในหน้าต่างเดียว
  const openPicker = (target: PointTarget) => {
    setPicker({ target, chainToDropoff: target === 'pickup' && !dropoff });
  };

  const selectPoint = (target: PointTarget, address: RouteAddress) => {
    const point = toSelectedPoint(address);
    if (target === 'pickup') setPickup(point);
    else setDropoff(point);
    setSelectedPresetId(null);
  };

  const selectPreset = (preset: QuickRoutePreset) => {
    setPickup(toSelectedPoint(preset.pickup));
    setDropoff(toSelectedPoint(preset.dropoff));
    setSelectedPresetId(preset.id);
    setPresetPickerOpen(false);
  };

  const selectManualPoint = async (target: PointTarget, point: SelectedPoint, save: boolean) => {
    let nextPoint = point;
    if (save) {
      try {
        const saved = await createRouteAddress({
          routeGroup: 'งานด่วน',
          kind: target,
          name: point.name,
          contact: point.contact,
          phone: point.phone,
          address: point.address,
          favorite: true,
        });
        onAddressCreated(saved);
        nextPoint = toSelectedPoint(saved);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'บันทึกสถานที่ใหม่ไม่สำเร็จ');
        return false;
      }
    }
    if (target === 'pickup') setPickup(nextPoint);
    else setDropoff(nextPoint);
    setSelectedPresetId(null);
    return true;
  };

  const savePreset = async () => {
    if (!pickup?.addressId || !dropoff?.addressId) return;
    setSavingPreset(true);
    try {
      const saved = await createQuickRoutePreset({
        pickupAddressId: pickup.addressId,
        dropoffAddressId: dropoff.addressId,
      });
      setRoutePresets((current) =>
        sortPresets([saved, ...current.filter((item) => item.id !== saved.id)]),
      );
      setSelectedPresetId(saved.id);
      toast.success('บันทึกเส้นทางไว้ใช้ครั้งถัดไปแล้ว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกเส้นทางด่วนไม่สำเร็จ');
    } finally {
      setSavingPreset(false);
    }
  };

  const validate = () => {
    if (!selectedDriver) {
      toast.error('เลือก Messenger ที่จะรับงานด่วนก่อน');
      return false;
    }
    if (!pickup) {
      toast.error('เลือกจุดรับงานก่อน');
      return false;
    }
    if (!dropoff) {
      toast.error('เลือกจุดส่งก่อน');
      return false;
    }
    if (!appointmentDate || !appointmentTime) {
      toast.error('ระบุวันและเวลานัดลูกค้าก่อน');
      return false;
    }
    const appointmentAt = getPlanningDateTimeMs(appointmentDate, appointmentTime);
    if (appointmentAt == null || appointmentAt < Date.now()) {
      toast.error('เวลานัดลูกค้าต้องไม่ก่อนเวลาปัจจุบัน');
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!validate() || !selectedDriver || !pickup || !dropoff) return;

    setSubmitting(true);
    try {
      const result = await createDispatchJobs({
        mode: 'single',
        title: title.trim() || 'งานด่วน',
        jobType,
        pickupName: pointDispatchName(pickup),
        pickupPhone: pickup.phone?.trim() || undefined,
        pickupAddress: pickup.address,
        destinationName: pointDispatchName(dropoff),
        destinationPhone: dropoff.phone?.trim() || undefined,
        destinationAddress: dropoff.address,
        method: 'immediate',
        driver: selectedDriver,
        plannedDate: getTodayDateKey(),
        appointmentDate,
        appointmentTime,
        acceptWithinMinutes: URGENT_ACCEPT_WITHIN_MINUTES,
        startWithinMinutes: 0,
        startPolicy: 'accept_starts',
      });
      if (selectedPresetId) {
        void markQuickRoutePresetUsed(selectedPresetId).catch(() => undefined);
      }
      await onCreated({
        destination: 'tracking',
        orderIds: result.orders.map((order) => order.id),
      });
      toast.success(`ส่งงานด่วนให้ ${selectedDriver.name} แล้ว`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ส่งงานด่วนไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="app-scroll w-full max-w-lg overflow-y-auto rounded-t-3xl border bg-background shadow-2xl sm:max-h-[94dvh] sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-background px-5 py-4 sm:px-6">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">ส่งงานด่วน</h2>
                <Badge variant="warning">ส่งทันที</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                เลือกเส้นทางเดิม แล้วแจ้ง Messenger ตอนนี้
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting}>
            <X className="h-4 w-4" />
            <span className="sr-only">ปิด</span>
          </Button>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <section className="rounded-2xl border bg-muted/20 p-4">
            <label className="text-xs font-semibold text-muted-foreground">ส่งให้ใคร</label>
            <div className="mt-2 flex items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <UserRound className="h-4 w-4" />
              </span>
              <Select
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
                containerClassName="min-w-0 flex-1"
              >
                <option value="">เลือก Messenger</option>
                {availableDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.name} · {formatDriverDispatchStatus(driver, orders)}
                  </option>
                ))}
              </Select>
            </div>
            {selectedDriver?.activeOrders ? (
              <p className="mt-2 text-xs text-warning">
                {selectedDriver.name} มีงานค้างอยู่ {selectedDriver.activeOrders} งาน
              </p>
            ) : null}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">เส้นทางที่ใช้บ่อย</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">คู่จุดรับ → ส่งจาก database</p>
              </div>
              {routePresets.length > TOP_PRESET_COUNT && (
                <Button variant="ghost" size="sm" onClick={() => setPresetPickerOpen(true)}>
                  ดูทั้งหมด {routePresets.length} <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {topPresets.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {topPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => selectPreset(preset)}
                    className={cn(
                      'rounded-xl border bg-background p-3 text-left transition-colors hover:border-primary hover:bg-primary/5',
                      selectedPresetId === preset.id &&
                        'border-primary bg-primary/5 ring-1 ring-primary',
                    )}
                  >
                    <span className="block truncate text-sm font-medium">
                      {preset.label || `${preset.pickup.name} → ${preset.dropoff.name}`}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      รับ {preset.pickup.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      ส่ง {preset.dropoff.name}
                    </span>
                    {preset.useCount > 0 && (
                      <span className="mt-1.5 block text-[11px] text-muted-foreground/80">
                        ใช้แล้ว {preset.useCount} ครั้ง
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openPicker('pickup')}
                className="flex w-full items-center justify-between rounded-xl border border-dashed p-3 text-left text-xs text-muted-foreground hover:border-primary hover:text-foreground"
              >
                <span>ยังไม่มีเส้นทางด่วน — เลือกจุดรับและจุดส่งจากคลังเพื่อเริ่มต้น</span>
                <ChevronRight className="h-4 w-4 shrink-0" />
              </button>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">เส้นทางงาน</h3>
              <span className="text-xs text-muted-foreground">
                เลือกจากคลัง — รับต่อด้วยส่งในครั้งเดียว
              </span>
            </div>
            <div className="rounded-2xl border">
              <RoutePoint target="pickup" point={pickup} onSelect={() => openPicker('pickup')} />
              <div className="ml-7 flex h-6 items-center border-l-2 border-dashed border-muted-foreground/30">
                <ArrowDown className="-ml-2 h-4 w-4 rounded-full bg-background text-muted-foreground" />
              </div>
              <div className="border-t">
                <RoutePoint
                  target="dropoff"
                  point={dropoff}
                  onSelect={() => openPicker('dropoff')}
                />
              </div>
            </div>
            {canSavePreset && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => void savePreset()}
                disabled={savingPreset}
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                {savingPreset ? 'กำลังบันทึก…' : 'บันทึกคู่นี้เป็นเส้นทางใช้บ่อย'}
              </Button>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted-foreground">ลักษณะงาน</label>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {(['document', 'parcel', 'other'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setJobType(value)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs transition-colors',
                      jobType === value
                        ? 'bg-background font-medium shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {dispatchJobTypeLabel[value]}
                  </button>
                ))}
              </div>
            </div>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="ระบุของหรือสิ่งที่ต้องทำ (ไม่บังคับ)"
            />
          </section>

          <section className="rounded-2xl border border-info/30 bg-info/5 p-4">
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">นัดหมายลูกค้า</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ใช้คำนวณ overdue ส่วนเวลาออกจะบันทึกอัตโนมัติหลังยืนยันส่งงาน
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">วันที่นัด</label>
                <DatePicker
                  value={appointmentDate}
                  onChange={setAppointmentDate}
                  className="w-full"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">เวลานัด</label>
                <input
                  type="time"
                  value={appointmentTime}
                  onChange={(event) => setAppointmentTime(event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl bg-warning/10 px-3 py-2.5 text-xs text-foreground">
            <div className="flex gap-2">
              <Timer className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p>
                Messenger ต้องรับงานภายใน <strong>{URGENT_ACCEPT_WITHIN_MINUTES} นาที</strong>{' '}
                และเริ่มงานทันทีหลังรับ เพื่อให้งานออกตัวเร็วที่สุด
              </p>
            </div>
          </section>

          <section>
            <button
              type="button"
              onClick={() => setShowMore((current) => !current)}
              className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-expanded={showMore}
            >
              รายละเอียดเพิ่มเติม (เบอร์โทร)
              <ChevronDown
                className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')}
              />
            </button>
            {showMore && (
              <div className="mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-2">
                <PointContactInput
                  label="เบอร์จุดรับ"
                  point={pickup}
                  onChange={(phone) =>
                    setPickup((current) => (current ? { ...current, phone } : current))
                  }
                />
                <PointContactInput
                  label="เบอร์ผู้รับ"
                  point={dropoff}
                  onChange={(phone) =>
                    setDropoff((current) => (current ? { ...current, phone } : current))
                  }
                />
              </div>
            )}
          </section>
        </div>

        <footer className="sticky bottom-0 border-t bg-background p-4 sm:px-6">
          <Button
            size="action"
            className="w-full"
            onClick={() => void submit()}
            disabled={submitting}
          >
            <Send className="h-5 w-5" />
            {submitting
              ? 'กำลังส่งงานด่วน…'
              : selectedDriver
                ? `ส่งงานด่วนให้ ${selectedDriver.name}`
                : 'เลือก Messenger เพื่อส่งงานด่วน'}
          </Button>
        </footer>
      </div>

      {picker && (
        <AddressPickerDialog
          initialTarget={picker.target}
          chainToDropoff={picker.chainToDropoff}
          pickedPickup={pickup}
          addresses={savedAddresses}
          onClose={() => setPicker(null)}
          onSelected={selectPoint}
          onManual={selectManualPoint}
        />
      )}
      {presetPickerOpen && (
        <RoutePresetPickerDialog
          presets={routePresets}
          onClose={() => setPresetPickerOpen(false)}
          onSelected={selectPreset}
        />
      )}
    </div>
  );
}

function RoutePoint({
  target,
  point,
  onSelect,
}: {
  target: PointTarget;
  point: SelectedPoint | null;
  onSelect: () => void;
}) {
  const isPickup = target === 'pickup';
  const Icon = isPickup ? MapPin : Navigation;
  const label = isPickup ? 'จุดรับ' : 'จุดส่ง';

  return (
    <div className="flex gap-3 p-4">
      <span
        className={cn(
          'mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full',
          isPickup ? 'bg-info/10 text-info' : 'bg-success/10 text-success',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block text-xs font-semibold">{label}</span>
        {point ? (
          <span className="mt-1 block min-w-0">
            <span className="block truncate text-sm font-medium">{point.name}</span>
            <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">
              {pointSummary(point)}
            </span>
          </span>
        ) : (
          <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            เลือกจากคลังสถานที่ <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </button>
      <Button variant="ghost" size="sm" onClick={onSelect}>
        {point ? 'เปลี่ยน' : 'เลือก'}
      </Button>
    </div>
  );
}

function PointContactInput({
  label,
  point,
  onChange,
}: {
  label: string;
  point: SelectedPoint | null;
  onChange: (phone: string) => void;
}) {
  return (
    <label className="text-xs font-medium">
      {label}
      <Input
        value={point?.phone ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1"
        placeholder="08x-xxx-xxxx"
        disabled={!point}
      />
    </label>
  );
}
