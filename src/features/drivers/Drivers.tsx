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
import { DriverCard } from './components/DriverCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ThaiAddressPicker from '@/components/ThaiAddressPicker';
import { resizeImageFileToDataUrl } from '@/lib/imageDataUrl';
import { EMPTY_THAI_ADDRESS, type ThaiAddressValue } from '@/lib/thaiAddress';
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
import {
  BarChart3,
  Check,
  Eye,
  FileImage,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserX,
  X,
} from 'lucide-react';

const FAIL_REASONS: { value: FailReason; label: string }[] = (
  Object.keys(failReasonLabel) as FailReason[]
).map((value) => ({ value, label: failReasonLabel[value] }));

const FAIL_ACTIONS: { value: FailNextAction; label: string }[] = (
  Object.keys(failNextActionLabel) as FailNextAction[]
).map((value) => ({ value, label: failNextActionLabel[value] }));

const vehicleLabel: Record<Driver['vehicle'], string> = {
  motorcycle: 'จักรยานยนต์',
  van: 'รถตู้',
  pickup: 'รถกระบะ',
};

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

type DriverTab = 'approved' | 'pending' | 'rejected';

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

function approvalStatus(driver: Driver): DriverTab {
  return driver.approvalStatus ?? 'approved';
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

function normalizeIdCardNumber(value: string) {
  return value.replace(/\D/g, '').slice(0, 13);
}

function formatIdCardNumber(value: string) {
  const digits = normalizeIdCardNumber(value);
  const parts = [
    digits.slice(0, 1),
    digits.slice(1, 5),
    digits.slice(5, 10),
    digits.slice(10, 12),
    digits.slice(12, 13),
  ].filter(Boolean);
  return parts.join('-');
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

function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(2)} กม.`;
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

function ImagePreviewModal({
  title,
  src,
  onClose,
}: {
  title: string;
  src: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`ดู${title}ขนาดใหญ่`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-4">
          <img
            src={src}
            alt={title}
            className="max-h-[78vh] max-w-full rounded-md object-contain"
          />
        </div>
      </div>
    </div>
  );
}

function StatsModal({
  stats,
  loading,
  onClose,
}: {
  stats: DriverStats | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">สถิติ Messenger</h2>
            <p className="text-sm text-muted-foreground">{stats?.driver.name ?? 'กำลังโหลด'}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {loading || !stats ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            กำลังโหลดสถิติ
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'ระยะทางรวม', value: formatKm(stats.totals.distanceMeters) },
                { label: 'งานสำเร็จ', value: stats.totals.completedOrders },
                { label: 'Route', value: stats.totals.routes },
                { label: 'หลุดเส้นทาง', value: stats.totals.offRouteCount },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <section>
                <h3 className="text-sm font-semibold">เส้นทาง/ปลายทางที่พบบ่อย</h3>
                <div className="mt-2 space-y-2">
                  {stats.frequentDestinations.length === 0 ? (
                    <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                      ยังไม่มีข้อมูลปลายทาง
                    </p>
                  ) : (
                    stats.frequentDestinations.map((item) => (
                      <div key={item.label} className="rounded-lg border p-3 text-sm">
                        <div className="line-clamp-2 font-medium">{item.label}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.count} ครั้ง</div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold">รอบวิ่งล่าสุด</h3>
                <div className="mt-2 space-y-2">
                  {stats.recentSessions.length === 0 ? (
                    <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                      ยังไม่มีประวัติ GPS
                    </p>
                  ) : (
                    stats.recentSessions.map((session) => (
                      <div key={session.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {session.label || session.routeId || 'รอบจัดส่ง'}
                          </span>
                          <Badge variant={session.status === 'active' ? 'info' : 'muted'}>
                            {session.status}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {new Date(session.startedAt).toLocaleString('th-TH')} ·{' '}
                          {formatKm(session.distanceMeters)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DriversPage() {
  const { orders, startDelivery, completeDelivery, failDelivery, syncFromBackend } =
    useRetailStore();
  const [managedDrivers, setManagedDrivers] = useState<Driver[]>([]);
  const [driversLoading, setDriversLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DriverTab>('approved');
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [stats, setStats] = useState<DriverStats | null>(null);

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

  async function reloadAll() {
    await Promise.all([loadDrivers(), syncFromBackend()]);
  }

  async function openStats(driver: Driver) {
    setStatsOpen(true);
    setStatsLoading(true);
    setStats(null);
    try {
      setStats(await fetchDriverStats(driver.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดสถิติไม่สำเร็จ');
      setStatsOpen(false);
    } finally {
      setStatsLoading(false);
    }
  }

  async function approve(driver: Driver) {
    try {
      await approveDriver(driver.id, { approvedBy: 'MoveVai Admin' });
      toast.success(`อนุมัติ ${driver.name} แล้ว`);
      await reloadAll();
      setActiveTab('approved');
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

        {(['approved', 'pending', 'rejected'] as DriverTab[]).map((tab) => (
          <TabsContent key={tab} value={tab}>
            {driversLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border p-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดคนขับ
              </div>
            ) : groupedDrivers[tab].length === 0 ? (
              <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                ไม่มีรายการในแท็บนี้
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedDrivers[tab].map((driver) => {
                  const driverOrders = orders.filter(
                    (order) =>
                      order.assignedDriverId === driver.id &&
                      ['assigned', 'in_transit'].includes(order.status),
                  );

                  return (
                    <div key={driver.id} className="space-y-2">
                      <DriverCard
                        driver={driver}
                        driverOrders={driverOrders}
                        onSetStatus={(driverId, status) => void setStatus(driverId, status)}
                        onStartDelivery={startDelivery}
                        onCompleteDelivery={completeDelivery}
                        onFailDelivery={setFailTargetId}
                      />
                      <DriverActions
                        driver={driver}
                        tab={tab}
                        onEdit={openEdit}
                        onArchive={(item) => void archive(item)}
                        onApprove={(item) => void approve(item)}
                        onReject={(item) => void reject(item)}
                        onStats={(item) => void openStats(item)}
                        onResetPin={async (item) => {
                          const phone = window
                            .prompt('เบอร์โทรสำหรับ Messenger Login', item.phone)
                            ?.trim();
                          if (!phone) return;
                          const pin = temporaryPin();
                          try {
                            await upsertMessengerAccount(item.id, { phone, pin });
                            window.alert(
                              `PIN ชั่วคราวของ ${item.name}: ${pin}\nกรุณาบันทึกตอนนี้ ระบบจะไม่แสดงซ้ำ`,
                            );
                          } catch (error) {
                            toast.error(
                              error instanceof Error ? error.message : 'สร้าง PIN ไม่สำเร็จ',
                            );
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <DriverFormModal
        driver={editingDriver}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={reloadAll}
      />

      {statsOpen && (
        <StatsModal stats={stats} loading={statsLoading} onClose={() => setStatsOpen(false)} />
      )}

      <ResolutionDialog
        open={!!failTargetId}
        title="บันทึกการส่งไม่สำเร็จ"
        description={
          failTargetId
            ? `${orders.find((o) => o.id === failTargetId)?.code ?? ''} — ระบุเหตุผลและขั้นตอนต่อไป`
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

function DriverActions({
  driver,
  tab,
  onEdit,
  onArchive,
  onApprove,
  onReject,
  onStats,
  onResetPin,
}: {
  driver: Driver;
  tab: DriverTab;
  onEdit: (driver: Driver) => void;
  onArchive: (driver: Driver) => void;
  onApprove: (driver: Driver) => void;
  onReject: (driver: Driver) => void;
  onStats: (driver: Driver) => void;
  onResetPin: (driver: Driver) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <DriverAvatar driver={driver} className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{driver.name}</div>
            <div className="text-xs text-muted-foreground">
              {driver.licensePlate || vehicleLabel[driver.vehicle]}
            </div>
          </div>
          {driver.highValueCertified && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              HV
            </Badge>
          )}
        </div>

        {tab !== 'approved' && (
          <div className="grid gap-2 rounded-lg border bg-muted/20 p-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <ReviewImage label="โปรไฟล์" src={driver.profilePhotoDataUrl} />
              <ReviewImage label="บัตรประชาชน" src={driver.idCardPhotoDataUrl} />
            </div>
            <div className="grid gap-1 text-muted-foreground">
              <div>
                เลขบัตร:{' '}
                <span className="font-mono text-foreground">
                  {driver.idCardNumber ? formatIdCardNumber(driver.idCardNumber) : '—'}
                </span>
              </div>
              {driver.rejectedReason && (
                <div className="text-destructive">เหตุผล: {driver.rejectedReason}</div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {tab === 'pending' ? (
            <>
              <Button size="sm" onClick={() => onApprove(driver)}>
                <Check className="h-4 w-4" />
                อนุมัติ
              </Button>
              <Button size="sm" variant="outline" onClick={() => onReject(driver)}>
                <UserX className="h-4 w-4" />
                ไม่อนุมัติ
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(driver)}>
                <Pencil className="h-4 w-4" />
                แก้ไข
              </Button>
              <Button size="sm" variant="outline" onClick={() => onStats(driver)}>
                <BarChart3 className="h-4 w-4" />
                สถิติ
              </Button>
            </>
          )}
          {tab === 'approved' && (
            <Button
              size="sm"
              variant="outline"
              className="col-span-2"
              onClick={() => onResetPin(driver)}
            >
              สร้าง / รีเซ็ต Messenger PIN
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="col-span-2 text-destructive hover:text-destructive"
            onClick={() => onArchive(driver)}
          >
            ปิดใช้งาน
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewImage({ label, src }: { label: string; src?: string }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <>
      <div className="space-y-1">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        {src ? (
          <button
            type="button"
            className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPreviewOpen(true)}
            aria-label={`ดู${label}ขนาดใหญ่`}
          >
            <img src={src} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-background transition group-hover:bg-foreground/45 group-focus-visible:bg-foreground/45">
              <Eye className="h-5 w-5 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
            </span>
          </button>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-background">
            <FileImage className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
      {src && previewOpen && (
        <ImagePreviewModal title={label} src={src} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
