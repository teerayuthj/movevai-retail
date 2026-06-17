import { useEffect, useState } from 'react';
import { AlertCircle, BellRing, Loader2 } from 'lucide-react';
import { currentPermission, isPushSupported, subscribeToPush, type NotifPermission } from '../push';

export function RiderPushSetupBanner({ installed }: { installed: boolean }) {
  const supported = isPushSupported();
  const [permission, setPermission] = useState<NotifPermission>(() => currentPermission());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!installed || !supported || permission !== 'granted') return;

    let cancelled = false;
    void subscribeToPush().then((result) => {
      if (cancelled) return;
      if (!result.ok && result.reason === 'no-vapid-key') {
        setError('ยังไม่ได้ตั้งค่า Push key');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [installed, permission, supported]);

  const handleEnable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await subscribeToPush();
      if (result.ok) {
        setPermission('granted');
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
      }
    } finally {
      setBusy(false);
    }
  };

  if (!installed || permission === 'granted') return null;

  if (!supported) {
    return (
      <div className="border-b bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        เปิดแจ้งเตือนได้หลังติดตั้ง PWA และเปิดจากไอคอนบนหน้าจอโฮม
      </div>
    );
  }

  return (
    <div className="border-b bg-emerald-50 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white">
          {permission === 'denied' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <BellRing className="h-4 w-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-emerald-950">เปิดแจ้งเตือนรับงาน</div>
          <div className="text-[11px] leading-snug text-emerald-800">
            ต้องกดอนุญาตบนเครื่องนี้ก่อน ถึงจะรับงานใหม่ผ่าน Push ได้
          </div>
          {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
        </div>
        <button
          type="button"
          onClick={handleEnable}
          disabled={busy || permission === 'denied'}
          className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          เปิดใช้
        </button>
      </div>
    </div>
  );
}
