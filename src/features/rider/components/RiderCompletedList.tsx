import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatTHB } from '@/data/mock';
import { fetchRiderCompletedDeliveries, type RiderCompletedDelivery } from '@/lib/retailApi';
import {
  Banknote,
  Camera,
  CheckCircle2,
  Loader2,
  Package,
  PenLine,
  ShieldCheck,
} from 'lucide-react';

function formatDeliveredAt(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RiderCompletedList({ riderCode }: { riderCode: string }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ready'; total: number; items: RiderCompletedDelivery[] }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetchRiderCompletedDeliveries(riderCode)
      .then((res) => {
        if (!cancelled) setState({ kind: 'ready', total: res.total, items: res.items });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            kind: 'error',
            message: error instanceof Error ? error.message : 'โหลดไม่สำเร็จ',
          });
      });
    return () => {
      cancelled = true;
    };
  }, [riderCode]);

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังโหลดรายการสำเร็จ…
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="py-12 text-center text-sm text-destructive">
        โหลดรายการสำเร็จไม่ได้ — {state.message}
      </div>
    );
  }

  if (state.items.length === 0) {
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
        ส่งสำเร็จทั้งหมด {state.total} รายการ
      </div>
      {state.items.map((item) => (
        <div key={item.id} className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-medium">{item.code}</span>
            <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
              <Package className="h-3 w-3" /> {item.itemCount}
            </Badge>
          </div>

          <div className="mt-1 text-[12px] text-muted-foreground">
            ส่งสำเร็จ {formatDeliveredAt(item.deliveredAt)}
          </div>

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
    </>
  );
}
