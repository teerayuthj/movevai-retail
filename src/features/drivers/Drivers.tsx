import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  type FailNextAction,
  type FailReason,
  failNextActionLabel,
  failReasonLabel,
} from '@/data/orderTypes';
import type { Driver } from '@/data/orderTypes';
import { useRetailStore } from '@/state/retailStore';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { DriverAvatar } from '@/components/DriverAvatar';
import { DriverDetailPanel, DriverStatusBadge } from './components/DriverDetailPanel';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import {
  type DriverTab,
  approvalStatus,
  formatIdCardNumber,
  normalizeIdCardNumber,
  vehicleLabel,
} from './utils/driverInfo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ThaiAddressPicker from '@/components/ThaiAddressPicker';
import { resizeImageFileToDataUrl } from '@/lib/imageDataUrl';
import { EMPTY_THAI_ADDRESS, type ThaiAddressValue } from '@/lib/thaiAddress';
import { cn } from '@/lib/utils';
import {
  archiveDriver,
  approveDriver,
  createDriver,
  fetchAppDrivers,
  fetchDriverStats,
  rejectDriver,
  updateDriver,
  upsertMessengerAccount,
  type DriverMutationInput,
  type DriverStats,
} from '@/lib/retailApi';
import { Eye, FileImage, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

const vehicleColorOptions = [
  'ขาว',
  'ดำ',
  'เทา',
  'เงิน',
  'แดง',
  'น้ำเงิน',
  'ฟ้า',
  'เขียว',
  'เหลือง',
  'ส้ม',
  'น้ำตาล',
  'ทอง',
];

type DriverFormState = {
  name: string;
  phone: string;
  vehicle: Driver['vehicle'];
  vehicleColor: string;
  licensePlate: string;
  idCardNumber: string;
  idCardPhotoDataUrl: string;
  profilePhotoDataUrl: string;
  addressLine: string;
  address: ThaiAddressValue;
};

const emptyForm: DriverFormState = {
  name: '',
  phone: '',
  vehicle: 'motorcycle',
  vehicleColor: '',
  licensePlate: '',
  idCardNumber: '',
  idCardPhotoDataUrl: '',
  profilePhotoDataUrl: '',
  addressLine: '',
  address: EMPTY_THAI_ADDRESS,
};

function temporaryPin() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return value.toString().padStart(6, '0');
}

function toForm(driver?: Driver): DriverFormState {
  if (!driver) return emptyForm;
  return {
    name: driver.name,
    phone: driver.phone,
    vehicle: driver.vehicle,
    vehicleColor: driver.vehicleColor ?? '',
    licensePlate: driver.licensePlate ?? '',
    idCardNumber: driver.idCardNumber ?? '',
    idCardPhotoDataUrl: driver.idCardPhotoDataUrl ?? '',
    profilePhotoDataUrl: driver.profilePhotoDataUrl ?? '',
    addressLine: driver.addressLine ?? '',
    address: {
      province: driver.addressProvince ?? '',
      district: driver.addressDistrict ?? '',
      subdistrict: driver.addressSubdistrict ?? '',
      postalCode: driver.addressPostalCode ?? '',
    },
  };
}

function trimOptional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function formPayload(form: DriverFormState, status: DriverTab): DriverMutationInput {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    vehicle: form.vehicle,
    vehicleColor: trimOptional(form.vehicleColor),
    approvalStatus: status,
    licensePlate: trimOptional(form.licensePlate),
    idCardNumber: trimOptional(normalizeIdCardNumber(form.idCardNumber)),
    idCardPhotoDataUrl: trimOptional(form.idCardPhotoDataUrl),
    profilePhotoDataUrl: trimOptional(form.profilePhotoDataUrl),
    // ค่าว่าง = ตั้งใจล้างค่าใน backend
    addressLine: form.addressLine.trim(),
    addressProvince: form.address.province.trim(),
    addressDistrict: form.address.district.trim(),
    addressSubdistrict: form.address.subdistrict.trim(),
    addressPostalCode: form.address.postalCode.trim(),
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function DriverFormModal({
  driver,
  open,
  onClose,
  onSaved,
}: {
  driver: Driver | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<DriverFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(driver ?? undefined));
  }, [driver, open]);

  if (!open) return null;

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('กรอกชื่อและเบอร์โทรก่อนบันทึก');
      return;
    }
    const idCardDigits = normalizeIdCardNumber(form.idCardNumber);
    if (idCardDigits && idCardDigits.length !== 13) {
      toast.error('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก');
      return;
    }
    setSaving(true);
    try {
      if (driver) {
        await updateDriver(driver.id, formPayload(form, approvalStatus(driver)));
        toast.success(`อัปเดต ${form.name} แล้ว`);
      } else {
        await createDriver(formPayload(form, 'approved'));
        toast.success(`เพิ่ม ${form.name} แล้ว`);
      }
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกคนขับไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function attachImage(field: 'profilePhotoDataUrl' | 'idCardPhotoDataUrl', file?: File) {
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setForm((current) => ({ ...current, [field]: dataUrl }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อ่านไฟล์รูปไม่สำเร็จ');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="driver-form-title"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="app-scroll max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 id="driver-form-title" className="text-lg font-semibold">
              {driver ? 'แก้ไขคนขับ' : 'เพิ่มคนขับ'}
            </h2>
            <p className="text-sm text-muted-foreground">
              ข้อมูลสมัครและที่อยู่คนขับ โดยยังไม่ใช้ zone
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <Field label="ชื่อ">
            <Input
              autoComplete="off"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="เบอร์โทร">
            <Input
              inputMode="tel"
              autoComplete="off"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </Field>
          <Field label="ยานพาหนะ">
            <Select
              value={form.vehicle}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  vehicle: event.target.value as Driver['vehicle'],
                }))
              }
            >
              {Object.entries(vehicleLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="สีของรถ">
            <Input
              list="driver-vehicle-color-options"
              autoComplete="off"
              placeholder="เลือกหรือพิมพ์สีรถ"
              value={form.vehicleColor}
              onChange={(event) =>
                setForm((current) => ({ ...current, vehicleColor: event.target.value }))
              }
            />
            <datalist id="driver-vehicle-color-options">
              {vehicleColorOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Field>
          <Field label="ทะเบียนรถ">
            <Input
              autoComplete="off"
              value={form.licensePlate}
              onChange={(event) =>
                setForm((current) => ({ ...current, licensePlate: event.target.value }))
              }
            />
          </Field>
          <Field label="เลขบัตรประชาชน">
            <Input
              inputMode="numeric"
              autoComplete="off"
              maxLength={17}
              placeholder="1-2345-67890-12-3"
              value={formatIdCardNumber(form.idCardNumber)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  idCardNumber: normalizeIdCardNumber(event.target.value),
                }))
              }
            />
            <span className="text-xs text-muted-foreground">กรอกได้เฉพาะตัวเลข 13 หลัก</span>
          </Field>

          <div className="space-y-3 md:col-span-2">
            <Field label="ที่อยู่ (บ้านเลขที่ / หมู่บ้าน / ถนน)">
              <Input
                autoComplete="off"
                value={form.addressLine}
                placeholder="เช่น 88/12 ถ.สีลม"
                onChange={(event) =>
                  setForm((current) => ({ ...current, addressLine: event.target.value }))
                }
              />
            </Field>
            <ThaiAddressPicker
              value={form.address}
              onChange={(address) => setForm((current) => ({ ...current, address }))}
            />
          </div>

          <ImageField
            label="รูปโปรไฟล์"
            value={form.profilePhotoDataUrl}
            onFile={(file) => void attachImage('profilePhotoDataUrl', file)}
            onClear={() => setForm((current) => ({ ...current, profilePhotoDataUrl: '' }))}
          />
          <ImageField
            label="รูปบัตรประชาชน"
            value={form.idCardPhotoDataUrl}
            onFile={(file) => void attachImage('idCardPhotoDataUrl', file)}
            onClear={() => setForm((current) => ({ ...current, idCardPhotoDataUrl: '' }))}
          />
        </div>

        <div className="flex justify-end gap-2 border-t px-5 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            บันทึก
          </Button>
        </div>
      </div>
    </div>
  );
}

function ImageField({
  label,
  value,
  onFile,
  onClear,
}: {
  label: string;
  value?: string;
  onFile: (file?: File) => void;
  onClear: () => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{label}</span>
          {value && (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              ล้างรูป
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {value ? (
            <button
              type="button"
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setPreviewOpen(true)}
              aria-label={`ดู${label}ขนาดใหญ่`}
            >
              <img src={value} alt="" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-background transition group-hover:bg-foreground/45 group-focus-visible:bg-foreground/45">
                <Eye className="h-5 w-5 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
              </span>
            </button>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              <FileImage className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <Input
            type="file"
            accept="image/*"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
        </div>
      </div>
      {value && previewOpen && (
        <ImagePreviewModal title={label} src={value} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}

export function DriversPage() {
  const { orders, completeDelivery, failDelivery, syncFromBackend } = useRetailStore();
  const [managedDrivers, setManagedDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DriverTab>('approved');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [statsByDriver, setStatsByDriver] = useState<Record<string, DriverStats>>({});
  const [statsLoadingId, setStatsLoadingId] = useState<string | null>(null);

  const loadDrivers = useCallback(async () => {
    setDriversLoading(true);
    try {
      const drivers = await fetchAppDrivers();
      setManagedDrivers(drivers);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดรายชื่อคนขับไม่สำเร็จ');
    } finally {
      setDriversLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  const groupedDrivers = useMemo(
    () => ({
      approved: managedDrivers.filter((driver) => approvalStatus(driver) === 'approved'),
      pending: managedDrivers.filter((driver) => approvalStatus(driver) === 'pending'),
      rejected: managedDrivers.filter((driver) => approvalStatus(driver) === 'rejected'),
    }),
    [managedDrivers],
  );

  const visibleDrivers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = groupedDrivers[activeTab];
    if (!query) return list;
    return list.filter((driver) =>
      [driver.name, driver.phone, driver.licensePlate ?? ''].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [groupedDrivers, activeTab, search]);

  // เลือกคนแรกใน list อัตโนมัติเมื่อสลับแท็บ/ค้นหา แล้วคนเดิมไม่อยู่ใน list
  useEffect(() => {
    if (driversLoading) return;
    if (selectedId && visibleDrivers.some((driver) => driver.id === selectedId)) return;
    setSelectedId(visibleDrivers[0]?.id ?? null);
  }, [visibleDrivers, selectedId, driversLoading]);

  const selectedDriver = visibleDrivers.find((driver) => driver.id === selectedId) ?? null;

  const loadStats = useCallback(async (driverId: string) => {
    setStatsLoadingId(driverId);
    try {
      const stats = await fetchDriverStats(driverId);
      setStatsByDriver((prev) => ({ ...prev, [driverId]: stats }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดสถิติไม่สำเร็จ');
    } finally {
      setStatsLoadingId((current) => (current === driverId ? null : current));
    }
  }, []);

  useEffect(() => {
    if (!selectedId || activeTab === 'pending') return;
    if (statsByDriver[selectedId]) return;
    void loadStats(selectedId);
  }, [selectedId, activeTab, statsByDriver, loadStats]);

  async function reloadAll() {
    await Promise.all([loadDrivers(), syncFromBackend()]);
  }

  async function approve(driver: Driver) {
    try {
      await approveDriver(driver.id, { approvedBy: 'MoveVai Admin' });
      toast.success(`อนุมัติ ${driver.name} แล้ว`);
      await reloadAll();
      setActiveTab('approved');
      setSelectedId(driver.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อนุมัติไม่สำเร็จ');
    }
  }

  async function reject(driver: Driver) {
    const reason = window.prompt(`เหตุผลที่ไม่อนุมัติ ${driver.name}`)?.trim();
    if (!reason) return;
    try {
      await rejectDriver(driver.id, reason);
      toast.success(`ไม่อนุมัติ ${driver.name} แล้ว`);
      await reloadAll();
      setActiveTab('rejected');
      setSelectedId(driver.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกการไม่อนุมัติไม่สำเร็จ');
    }
  }

  async function archive(driver: Driver) {
    if (!window.confirm(`ปิดใช้งาน ${driver.name} และเก็บประวัติย้อนหลังไว้?`)) return;
    try {
      await archiveDriver(driver.id);
      toast.success(`ปิดใช้งาน ${driver.name} แล้ว`);
      await reloadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ปิดใช้งานไม่สำเร็จ');
    }
  }

  async function setStatus(driverId: string, status: Driver['status']) {
    try {
      const updated = await updateDriver(driverId, { status });
      setManagedDrivers((prev) => prev.map((item) => (item.id === driverId ? updated : item)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อัปเดตสถานะไม่สำเร็จ');
    }
  }

  async function resetPin(driver: Driver) {
    const phone = window.prompt('เบอร์โทรสำหรับ Messenger Login', driver.phone)?.trim();
    if (!phone) return;
    const pin = temporaryPin();
    try {
      await upsertMessengerAccount(driver.id, { phone, pin });
      window.alert(`PIN ชั่วคราวของ ${driver.name}: ${pin}\nกรุณาบันทึกตอนนี้ ระบบจะไม่แสดงซ้ำ`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'สร้าง PIN ไม่สำเร็จ');
    }
  }

  function openCreate() {
    setEditingDriver(null);
    setFormOpen(true);
  }

  function openEdit(driver: Driver) {
    setEditingDriver(driver);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">คนขับ</h1>
          <p className="text-sm text-muted-foreground">
            ทีมจัดส่ง {groupedDrivers.approved.length} คน · รออนุมัติ{' '}
            {groupedDrivers.pending.length}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadDrivers()} disabled={driversLoading}>
            <RefreshCw className={driversLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            รีเฟรช
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            เพิ่มคนขับ
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DriverTab)}>
        <TabsList>
          <TabsTrigger value="approved">ใช้งาน ({groupedDrivers.approved.length})</TabsTrigger>
          <TabsTrigger value="pending">รออนุมัติ ({groupedDrivers.pending.length})</TabsTrigger>
          <TabsTrigger value="rejected">ไม่อนุมัติ ({groupedDrivers.rejected.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4">
          <CardContent className="space-y-3 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="ค้นหาชื่อ / เบอร์ / ทะเบียน"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            {driversLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดคนขับ
              </div>
            ) : visibleDrivers.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                {search.trim() ? 'ไม่พบคนขับที่ค้นหา' : 'ไม่มีรายการในแท็บนี้'}
              </div>
            ) : (
              <div className="app-scroll max-h-[65vh] space-y-1 overflow-y-auto pr-0.5">
                {visibleDrivers.map((driver) => {
                  const activeOrderCount = orders.filter(
                    (order) =>
                      order.assignedDriverId === driver.id &&
                      ['assigned', 'in_transit'].includes(order.status),
                  ).length;
                  const isSelected = driver.id === selectedId;

                  return (
                    <button
                      key={driver.id}
                      type="button"
                      onClick={() => setSelectedId(driver.id)}
                      aria-current={isSelected}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-primary/50 bg-primary/5'
                          : 'border-transparent hover:bg-muted/60',
                      )}
                    >
                      <DriverAvatar driver={driver} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{driver.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {driver.licensePlate || vehicleLabel[driver.vehicle]} · {driver.phone}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {activeTab === 'approved' && <DriverStatusBadge driver={driver} />}
                        {activeOrderCount > 0 && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {activeOrderCount} จุดงาน
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedDriver ? (
          <DriverDetailPanel
            driver={selectedDriver}
            tab={activeTab}
            driverOrders={orders.filter(
              (order) =>
                order.assignedDriverId === selectedDriver.id &&
                ['assigned', 'in_transit'].includes(order.status),
            )}
            stats={statsByDriver[selectedDriver.id] ?? null}
            statsLoading={statsLoadingId === selectedDriver.id}
            onSetStatus={(driverId, status) => void setStatus(driverId, status)}
            onCompleteDelivery={completeDelivery}
            onFailDelivery={setFailTargetId}
            onEdit={openEdit}
            onArchive={(driver) => void archive(driver)}
            onApprove={(driver) => void approve(driver)}
            onReject={(driver) => void reject(driver)}
            onResetPin={(driver) => void resetPin(driver)}
            onRefreshStats={(driver) => void loadStats(driver.id)}
          />
        ) : (
          <div className="flex min-h-48 items-center justify-center rounded-lg border text-sm text-muted-foreground">
            เลือกคนขับจากรายการด้านซ้ายเพื่อดูรายละเอียด
          </div>
        )}
      </div>

      <DriverFormModal
        driver={editingDriver}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reloadAll}
      />

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${orders.find((o) => o.id === failTargetId)?.orderNo ?? ''} — ระบุเหตุผลและขั้นตอนต่อไป`
            : undefined
        }
        reasons={FAIL_REASONS}
        actions={{
          label: 'ขั้นตอนต่อไป',
          options: FAIL_ACTIONS,
          defaultValue: 'retry',
          helpText: (v) =>
            v === 'retry'
              ? 'กลับไปสถานะมอบหมาย ออกส่งรอบใหม่'
              : v === 'return'
                ? 'ย้ายไปแท็บส่งกลับ รอรับคืนสาขา'
                : 'ปิดงานเป็นส่งไม่สำเร็จ',
        }}
        confirmLabel="บันทึก"
        onCancel={() => setFailTargetId(null)}
        onConfirm={({ reason, note, action }) => {
          if (failTargetId && action) {
            failDelivery(failTargetId, {
              reason,
              nextAction: action,
              note,
            });
          }
          setFailTargetId(null);
        }}
      />
    </div>
  );
}
