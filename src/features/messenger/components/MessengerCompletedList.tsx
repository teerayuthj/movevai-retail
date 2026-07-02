import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatTHB } from '@/data/mock';
import {
  fetchMessengerCompletedDeliveries,
  type MessengerCompletedDelivery,
} from '@/lib/retailApi';
import { formatElapsedDuration, getDeliveryDurationMinutes } from '@/lib/deliveryExecution';
import {
  Banknote,
  Camera,
  CheckCircle2,
  Loader2,
  Package,
  PenLine,
  ShieldCheck,
} from 'lucide-react';

const PAGE_SIZE = 20;

function formatDeliveredAt(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// "ส่งสำเร็จ 30 มิ.ย. 14:32 · ใช้เวลา 38 นาที" — งานเก่าที่ไม่มี inTransitAt จะไม่มีส่วนท้าย
function formatDeliveredLine(item: MessengerCompletedDelivery): string {
  const base = `ส่งสำเร็จ ${formatDeliveredAt(item.deliveredAt)}`;
  const minutes = getDeliveryDurationMinutes(item.inTransitAt, item.deliveredAt);
  return minutes != null ? `${base} · ใช้เวลา ${formatElapsedDuration(minutes)}` : base;
}

export function MessengerCompletedList({ messengerCode }: { messengerCode: string }) {
  const [items, setItems] = useState<MessengerCompletedDelivery[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  // 'initial' = โหลดหน้าแรก, 'more' = โหลดหน้าถัดไป, 'idle' = ว่าง
  const [phase, setPhase] = useState<'initial' | 'more' | 'idle'>('initial');
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  // ใช้ ref เก็บค่าล่าสุด เพื่อกัน IntersectionObserver fire ซ้ำตอนกำลังโหลด
  const loadingRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const doneRef = useRef(false);

  const loadPage = useCallback(async () => {
    if (loadingRef.current || doneRef.current) return;
    loadingRef.current = true;
    const isInitial = cursorRef.current == null;
    setPhase(isInitial ? 'initial' : 'more');
    setError(null);
    try {
      const res = await fetchMessengerCompletedDeliveries(messengerCode, {
        limit: PAGE_SIZE,
        cursor: cursorRef.current ?? undefined,
      });
      if (res.total != null) setTotal(res.total);
      setItems((prev) => {
        // dedup ด้วย id เผื่องานปิดใหม่แทรกแล้วทำให้ขอบหน้าซ้ำ
        const seen = new Set(prev.map((it) => it.id));
        return [...prev, ...res.items.filter((it) => !seen.has(it.id))];
      });
      cursorRef.current = res.nextCursor;
      if (!res.nextCursor) {
        doneRef.current = true;
        setDone(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'โหลดไม่สำเร็จ');
    } finally {
      loadingRef.current = false;
      setPhase('idle');
    }
  }, [messengerCode]);

  // reset + โหลดหน้าแรกเมื่อเปลี่ยน messenger
  useEffect(() => {
    setItems([]);
    setTotal(null);
    setDone(false);
    setError(null);
    setPhase('initial');
    cursorRef.current = null;
    doneRef.current = false;
    loadingRef.current = false;
    void loadPage();
  }, [messengerCode, loadPage]);

  // โหลดหน้าถัดไปเมื่อ sentinel เลื่อนเข้ามาในจอ (โหลดล่วงหน้า 200px)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadPage();
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadPage, done]);

  if (phase === 'initial') {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลดรายการสำเร็จ…
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        โหลดรายการสำเร็จไม่ได้ — {error}
        <button
          type="button"
          onClick={() => void loadPage()}
          className="mt-3 block w-full text-primary underline"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
        ยังไม่มีงานที่ส่งสำเร็จ
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
        ส่งสำเร็จทั้งหมด {total ?? items.length} รายการ
      </div>
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-medium">{item.code}</span>
            <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
              <Package className="h-3 w-3" /> {item.itemCount}
            </Badge>
          </div>

          <div className="mt-1 text-[12px] text-muted-foreground">{formatDeliveredLine(item)}</div>

          <div className="mt-2 flex flex-wrap gap-1">
            {item.cod?.collected && (
              <Badge variant="success" className="h-5 gap-0.5 px-1.5 text-[10px]">
                <Banknote className="h-2.5 w-2.5" />
                เก็บเงินแล้ว{item.cod.amount != null ? ` ${formatTHB(item.cod.amount)}` : ''}
              </Badge>
            )}
            {item.proof?.photoCount ? (
              <Badge variant="muted" className="h-5 gap-0.5 px-1.5 text-[10px]">
                <Camera className="h-2.5 w-2.5" />
                {item.proof.photoCount}
              </Badge>
            ) : null}
            {item.proof?.signatureCaptured && (
              <Badge variant="muted" className="h-5 gap-0.5 px-1.5 text-[10px]">
                <PenLine className="h-2.5 w-2.5" />
                ลายเซ็น
              </Badge>
            )}
            {item.proof?.otpVerified && (
              <Badge variant="muted" className="h-5 gap-0.5 px-1.5 text-[10px]">
                <ShieldCheck className="h-2.5 w-2.5" />
                OTP
              </Badge>
            )}
          </div>
        </div>
      ))}

      {/* sentinel + สถานะท้าย list */}
      <div ref={sentinelRef} />
      {phase === 'more' && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          กำลังโหลดเพิ่ม…
        </div>
      )}
      {error && items.length > 0 && (
        <div className="py-4 text-center text-sm text-destructive">
          โหลดเพิ่มไม่สำเร็จ —{' '}
          <button type="button" onClick={() => void loadPage()} className="underline">
            ลองใหม่
          </button>
        </div>
      )}
      {done && !error && (
        <div className="py-4 text-center text-xs text-muted-foreground">แสดงครบทุกรายการแล้ว</div>
      )}
    </>
  );
}
