import { useEffect, useState } from 'react';
import { AlertCircle, BellRing, Loader2 } from 'lucide-react';
import { currentPermission, isPushSupported, subscribeToPush, type NotifPermission } from '../push';

export function RiderPushSetupBanner({
  installed,
  riderCode,
}: {
  installed: boolean;
  riderCode: string;
}) {
  const supported = isPushSupported();
  const [permission, setPermission] = useState<NotifPermission>(() => currentPermission());
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!installed || !supported || permission !== 'granted') return;

    let cancelled = false;
    void subscribeToPush(riderCode).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setRegistered(true);
        setError(null);
      } else if (result.reason === 'no-vapid-key') {
        setError('ยังไม่ได้ตั้งค่า Push key');
      } else if (result.reason === 'backend-registration-failed') {
        setError('เชื่อมต่อระบบรับงานไม่สำเร็จ กรุณาลองใหม่');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [installed, permission, riderCode, supported]);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeToPush(riderCode);
      if (result.ok) {
        setPermission('granted');
        setRegistered(true);
        return;
      }

      if (result.reason === 'denied') {
        setPermission('denied');
        setError('แจ้งเตือนถูกปิดไว้ในเครื่อง ต้องเปิดจาก Settings ของ iPhone');
      } else if (result.reason === 'unsupported') {
        setPermission('unsupported');
        setError('iPhone ต้องเปิดจากไอคอนบนหน้าจอโฮม ไม่ใช่ Safari tab');
      } else if (result.reason === 'no-vapid-key') {
        setError('ยังไม่ได้ตั้งค่า Push key');
      } else if (result.reason === 'backend-registration-failed') {
        setError(
          result.status
            ? `ลงทะเบียนกับ backend ไม่สำเร็จ (HTTP ${result.status})`
            : 'ติดต่อ backend ไม่ได้ กรุณาตรวจสอบเครือข่าย',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  if (!installed || (permission === 'granted' && registered)) return null;

  if (!supported) {
    return (
      <div className="border-b bg-warning/10 px-3 py-2.5 text-xs text-warning">
        เปิดแจ้งเตือนได้หลังติดตั้ง PWA และเปิดจากไอคอนบนหน้าจอโฮม
      </div>
    );
  }

  return (
    <div className="border-b bg-success/10 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success text-white">
          {permission === 'denied' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <BellRing className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-success">เปิดแจ้งเตือนรับงาน</div>
          <div className="text-[11px] leading-snug text-success">
            ต้องกดอนุญาตบนเครื่องนี้ก่อน ถึงจะรับงานใหม่ผ่าน Push ได้
          </div>
          {error && <div className="mt-1 text-[11px] text-destructive">{error}</div>}
        </div>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || permission === 'denied'}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-success px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          เปิดใช้
        </button>
      </div>
    </div>
  );
}
