import { useState } from 'react';
import { Bell, BellRing, Check, Copy, Loader2, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  currentPermission,
  fireLocalTestNotification,
  isPushSupported,
  sendDevPushTest,
  subscribeToPush,
  type NotifPermission,
} from '../push';

/**
 * แผงทดสอบแจ้งเตือนของ rider (เครื่องมือ dev)
 * 1) ทดสอบเครื่องนี้ — local notification เด้งบนเครื่องเดียวกัน (ไม่ต้องมี backend)
 * 2) เปิดรับ Push ข้ามเครื่อง — subscribe แล้ว copy subscription ไปให้ scripts/send-push.mjs ยิงจาก Mac
 */
export function NotificationTestButton() {
  const supported = isPushSupported();
  const [status, setStatus] = useState<NotifPermission>(() => currentPermission());
  const [busy, setBusy] = useState<null | 'test' | 'subscribe' | 'remoteTest'>(null);
  const [subscription, setSubscription] = useState<PushSubscriptionJSON | null>(null);
  const [subJson, setSubJson] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteSent, setRemoteSent] = useState(false);

  const handleTest = async () => {
    setBusy('test');
    setError(null);
    try {
      setStatus(await fireLocalTestNotification());
    } finally {
      setBusy(null);
    }
  };

  const handleSubscribe = async () => {
    setBusy('subscribe');
    setError(null);
    try {
      const result = await subscribeToPush();
      if (result.ok) {
        setStatus('granted');
        setSubscription(result.subscription);
        setSubJson(JSON.stringify(result.subscription, null, 2));
      } else if (result.reason === 'no-vapid-key') {
        setError('ยังไม่ได้ตั้ง VITE_VAPID_PUBLIC_KEY ใน .env');
      } else if (result.reason === 'denied') {
        setStatus('denied');
        setError('ถูกปิดแจ้งเตือน — เปิดในตั้งค่าเครื่องก่อน');
      } else if (result.reason === 'unsupported') {
        setError('อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับ Push');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRemoteTest = async () => {
    if (!subscription) return;
    setBusy('remoteTest');
    setError(null);
    setRemoteSent(false);
    try {
      const result = await sendDevPushTest(subscription);
      if (result.ok) {
        setRemoteSent(true);
        setTimeout(() => setRemoteSent(false), 1800);
      } else {
        setError('ยิง Push test ไม่สำเร็จ — เช็ค terminal dev server');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    if (!subJson) return;
    try {
      await navigator.clipboard.writeText(subJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('คัดลอกไม่สำเร็จ — เลือกข้อความแล้ว copy เอง');
    }
  };

  if (!supported) {
    return (
      <div className="mt-2 rounded-lg border border-dashed px-3 py-2 text-center text-[11px] text-muted-foreground">
        อุปกรณ์นี้ไม่รองรับการแจ้งเตือน (iOS ต้องเปิดจากไอคอนบนหน้าจอโฮม)
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      <button
        type="button"
        onClick={handleTest}
        disabled={busy !== null || status === 'denied'}
        className={cn(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
          status === 'denied'
            ? 'cursor-not-allowed border-dashed text-muted-foreground'
            : 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
        )}
      >
        {busy === 'test' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : status === 'granted' ? (
          <BellRing className="h-3.5 w-3.5" />
        ) : (
          <Bell className="h-3.5 w-3.5" />
        )}
        ทดสอบแจ้งเตือน (เครื่องนี้)
      </button>

      <button
        type="button"
        onClick={handleSubscribe}
        disabled={busy !== null || status === 'denied'}
        className={cn(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
          status === 'denied'
            ? 'cursor-not-allowed border-dashed text-muted-foreground'
            : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
        )}
      >
        {busy === 'subscribe' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Radio className="h-3.5 w-3.5" />
        )}
        เปิดรับ Push ข้ามเครื่อง (Mac → เครื่องนี้)
      </button>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {subJson && (
        <div className="rounded-lg border bg-muted/40 p-2">
          <button
            type="button"
            onClick={handleRemoteTest}
            disabled={busy !== null || !subscription}
            className="mb-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === 'remoteTest' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <BellRing className="h-3.5 w-3.5" />
            )}
            {remoteSent ? 'ส่ง Push แล้ว' : 'ยิง Push เข้าเครื่องนี้ทันที'}
          </button>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium text-muted-foreground">
              subscription — เซฟลง scripts/push-subscription.json อัตโนมัติแล้ว (หรือ copy เอง)
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
            </button>
          </div>
          <pre className="max-h-28 overflow-auto rounded bg-background p-2 text-[10px] leading-tight">
            {subJson}
          </pre>
        </div>
      )}
    </div>
  );
}
