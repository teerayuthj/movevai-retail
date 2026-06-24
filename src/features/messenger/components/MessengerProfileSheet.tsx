import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import type { Driver } from '@/data/mock';
import { ArrowLeft, LogOut, MapPin, Phone, ShieldCheck, Star, Truck } from 'lucide-react';
import type { useInstallPrompt } from '../hooks/useInstallPrompt';
import { InstallBanner } from './InstallBanner';
import { MessengerPushSetupBanner } from './MessengerPushSetupBanner';

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
      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

export function MessengerProfileSheet({
  messenger,
  install,
  onClose,
  onExit,
}: {
  messenger: Driver;
  install: ReturnType<typeof useInstallPrompt>;
  onClose: () => void;
  onExit?: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background duration-200 animate-in slide-in-from-right">
      <header className="sticky top-0 flex items-center gap-2 border-b bg-background px-3 pb-3 pt-safe">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="ปิด"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">บัญชี messenger</span>
      </header>

      <div className="app-scroll flex-1 space-y-4 overflow-auto p-4 pb-safe">
        {/* ตัวตน + รูป (รูปใหญ่ที่นี่) */}
        <div className="flex flex-col items-center gap-2 text-center">
          <DriverAvatar driver={messenger} className="h-24 w-24" />
          <div>
            <div className="text-lg font-semibold">{messenger.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{messenger.id}</div>
          </div>
          <Badge variant={messenger.status === 'available' ? 'success' : 'muted'}>
            {statusLabel[messenger.status]}
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
          </InfoRow>
          <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="โซนที่รับผิดชอบ">
            {messenger.zone}
          </InfoRow>
          <InfoRow icon={<Star className="h-3.5 w-3.5" />} label="เรตติ้ง">
            <span className="tabular-nums">{messenger.rating.toFixed(1)}</span>
          </InfoRow>
          <InfoRow icon={<Truck className="h-3.5 w-3.5" />} label="งานวันนี้">
            <span className="tabular-nums">
              {messenger.activeOrders}/{messenger.capacity}
            </span>
          </InfoRow>
          {messenger.highValueCertified && (
            <InfoRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="อบรมขนส่งของมีค่า">
              <span className="text-success">ผ่านแล้ว</span>
            </InfoRow>
          )}
        </div>

        {/* การแจ้งเตือน & การติดตั้งแอป */}
        <div className="space-y-2">
          <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            การแจ้งเตือน &amp; แอป
          </div>
          <div className="overflow-hidden rounded-xl border">
            <MessengerPushSetupBanner installed={install.installed} messengerCode={messenger.id} />
            <InstallBanner install={install} />
            <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
              เปิดแจ้งเตือนเพื่อรับงานใหม่ทันที และติดตั้งแอปเพื่อเปิดแบบเต็มจอ
            </div>
          </div>
        </div>

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
      </div>
    </div>
  );
}
