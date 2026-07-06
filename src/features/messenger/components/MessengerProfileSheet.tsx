import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DriverAvatar } from '@/components/DriverAvatar';
import ThaiAddressPicker from '@/components/ThaiAddressPicker';
import type { Driver } from '@/data/orderTypes';
import {
  ArrowLeft,
  Camera,
  CreditCard,
  Home,
  Loader2,
  LogOut,
  Pencil,
  Phone,
  Truck,
} from 'lucide-react';
import { resizeImageFileToDataUrl } from '@/lib/imageDataUrl';
import { updateMessengerProfile } from '@/lib/retailApi';
import { composeThaiAddress, type ThaiAddressValue } from '@/lib/thaiAddress';

const statusLabel: Record<Driver['status'], string> = {
  available: 'ว่าง',
  on_delivery: 'กำลังส่ง',
  off_duty: 'หยุด',
};

const vehicleLabel: Record<Driver['vehicle'], string> = {
  motorcycle: 'มอเตอร์ไซค์',
  van: 'รถตู้',
  pickup: 'กระบะ',
};

// โชว์เลขบัตรเฉพาะ 4 หลักท้าย — messenger แก้ไม่ได้ (ต้องผ่าน admin) แต่ควรรู้ว่าระบบมีข้อมูลไหน
function maskIdCard(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return value;
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function driverAddressValue(driver: Driver): ThaiAddressValue {
  return {
    province: driver.addressProvince ?? '',
    district: driver.addressDistrict ?? '',
    subdistrict: driver.addressSubdistrict ?? '',
    postalCode: driver.addressPostalCode ?? '',
  };
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right text-sm font-medium">{children}</span>
    </div>
  );
}

type ProfileFormState = {
  phone: string;
  profilePhotoDataUrl: string;
  addressLine: string;
  addr: ThaiAddressValue;
};

function toProfileForm(driver: Driver): ProfileFormState {
  return {
    phone: driver.phone,
    profilePhotoDataUrl: driver.profilePhotoDataUrl ?? '',
    addressLine: driver.addressLine ?? '',
    addr: driverAddressValue(driver),
  };
}

function ProfileEditForm({
  messenger,
  onDone,
  onCancel,
}: {
  messenger: Driver;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ProfileFormState>(() => toProfileForm(messenger));
  const [saving, setSaving] = useState(false);

  async function attachPhoto(file?: File) {
    if (!file) return;
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      setForm((current) => ({ ...current, profilePhotoDataUrl: dataUrl }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'อ่านไฟล์รูปไม่สำเร็จ');
    }
  }

  async function save() {
    const phone = form.phone.trim();
    if (!phone) {
      toast.error('กรอกเบอร์โทรก่อนบันทึก');
      return;
    }
    setSaving(true);
    try {
      // ส่งค่าว่าง = ตั้งใจล้างค่า (backend เก็บเป็น null)
      await updateMessengerProfile({
        phone,
        profilePhotoDataUrl: form.profilePhotoDataUrl,
        addressLine: form.addressLine,
        addressProvince: form.addr.province,
        addressDistrict: form.addr.district,
        addressSubdistrict: form.addr.subdistrict,
        addressPostalCode: form.addr.postalCode,
      });
      toast.success('บันทึกข้อมูลแล้ว');
      await onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* รูปโปรไฟล์ */}
      <div className="flex flex-col items-center gap-2">
        <div className="relative">
          <DriverAvatar
            driver={{ ...messenger, profilePhotoDataUrl: form.profilePhotoDataUrl || undefined }}
            className="h-24 w-24"
          />
          <label className="absolute -bottom-1 -right-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border bg-background shadow-sm">
            <Camera className="h-4 w-4 text-muted-foreground" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => void attachPhoto(event.target.files?.[0])}
            />
          </label>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold">{messenger.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{messenger.id}</div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border p-3">
        <label className="grid gap-1.5 text-sm">
          <span className="text-[12px] font-medium text-muted-foreground">เบอร์โทร</span>
          <Input
            inputMode="tel"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="text-[12px] font-medium text-muted-foreground">
            ที่อยู่ (บ้านเลขที่ / หมู่บ้าน / ถนน)
          </span>
          <Input
            value={form.addressLine}
            placeholder="เช่น 88/12 ถ.สีลม"
            onChange={(event) =>
              setForm((current) => ({ ...current, addressLine: event.target.value }))
            }
          />
        </label>
        <ThaiAddressPicker
          value={form.addr}
          disabled={saving}
          onChange={(addr) => setForm((current) => ({ ...current, addr }))}
        />
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        ชื่อ-นามสกุล เลขบัตรประชาชน และยานพาหนะ แก้ไขได้โดยแอดมินเท่านั้น หากต้องการเปลี่ยน
        กรุณาติดต่อเจ้าหน้าที่
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          บันทึก
        </Button>
      </div>
    </div>
  );
}

export function MessengerProfileSheet({
  messenger,
  effectiveStatus,
  onClose,
  onUpdated,
  onExit,
}: {
  messenger: Driver;
  effectiveStatus?: Driver['status'];
  activeOrders?: number;
  onClose: () => void;
  /** เรียกหลังบันทึก profile สำเร็จ เพื่อให้ console ดึงข้อมูล driver ล่าสุดจาก backend */
  onUpdated?: () => Promise<void> | void;
  onExit?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const status = effectiveStatus ?? messenger.status;
  const fullAddress = composeThaiAddress(
    messenger.addressLine ?? '',
    driverAddressValue(messenger),
  );

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background duration-200 animate-in slide-in-from-right">
      <header className="sticky top-0 flex items-center gap-2 border-b bg-background px-3 pb-3 pt-safe">
        <button
          type="button"
          onClick={() => (editing ? setEditing(false) : onClose())}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="ปิด"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {editing ? 'แก้ไขข้อมูล messenger' : 'บัญชี messenger'}
        </span>
      </header>

      <div className="app-scroll flex-1 space-y-4 overflow-auto p-4 pb-safe">
        {editing ? (
          <ProfileEditForm
            messenger={messenger}
            onCancel={() => setEditing(false)}
            onDone={async () => {
              await onUpdated?.();
              setEditing(false);
            }}
          />
        ) : (
          <>
            {/* ตัวตน + รูป (รูปใหญ่ที่นี่) */}
            <div className="flex flex-col items-center gap-2 text-center">
              <DriverAvatar driver={messenger} className="h-24 w-24" />
              <div>
                <div className="text-lg font-semibold">{messenger.name}</div>
                <div className="font-mono text-xs text-muted-foreground">{messenger.id}</div>
              </div>
              <Badge variant={status === 'available' ? 'success' : 'muted'}>
                {statusLabel[status]}
              </Badge>
            </div>

            {/* ข้อมูลส่วนตัว */}
            <div className="divide-y rounded-xl border">
              <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="เบอร์โทร">
                <a href={`tel:${messenger.phone}`} className="text-info">
                  {messenger.phone}
                </a>
              </InfoRow>
              <InfoRow icon={<Truck className="h-3.5 w-3.5" />} label="ยานพาหนะ">
                {vehicleLabel[messenger.vehicle]}
                {messenger.licensePlate ? ` · ${messenger.licensePlate}` : ''}
                {messenger.vehicleColor ? ` · ${messenger.vehicleColor}` : ''}
              </InfoRow>
              <InfoRow icon={<Home className="h-3.5 w-3.5" />} label="ที่อยู่">
                {fullAddress || <span className="text-muted-foreground">ยังไม่ได้ระบุ</span>}
              </InfoRow>
              {messenger.idCardNumber && (
                <InfoRow icon={<CreditCard className="h-3.5 w-3.5" />} label="บัตรประชาชน">
                  <span className="font-mono tabular-nums">
                    {maskIdCard(messenger.idCardNumber)}
                  </span>
                </InfoRow>
              )}
            </div>

            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              <Pencil className="h-4 w-4" />
              แก้ไขข้อมูลส่วนตัว
            </button>

            {/* ออกจากระบบ */}
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                ออกจากโหมด messenger
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
