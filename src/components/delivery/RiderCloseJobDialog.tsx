import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatTHB, paymentLabel, type Order } from '@/data/mock';
import { requiresDeliveryReview } from '@/lib/deliveryExecution';
import type { SubmitDeliveryInput } from '@/state/retail/types';
import { Banknote, Camera, Eraser, IdCard, MapPin, ShieldAlert, Smartphone, X } from 'lucide-react';

type Props = {
  open: boolean;
  order: Order | null;
  onCancel: () => void;
  onSubmit: (input: SubmitDeliveryInput) => void;
};

// จำลองพิกัด GPS ตอนปิดงาน (ของจริงดึงจากอุปกรณ์ rider)
const MOCK_LOCATION = { lat: 13.7392, lng: 100.5408, label: 'ใกล้ที่อยู่ผู้รับ' };

/** สร้างรูปถ่ายจำลอง (ของจริงมาจากกล้องมือถือ rider) */
function captureMockPhoto(order: Order): string {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = `hsl(${Math.floor(Math.random() * 360)}, 24%, 78%)`;
  ctx.fillRect(0, 0, 320, 240);
  // กล่องพัสดุจำลอง
  ctx.fillStyle = 'rgba(120, 88, 40, 0.85)';
  ctx.fillRect(96, 84, 128, 96);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(96, 84, 128, 14);
  // ป้ายกำกับ
  ctx.fillStyle = '#1f2937';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(order.code, 12, 26);
  ctx.font = '12px sans-serif';
  ctx.fillText(new Date().toLocaleString('th'), 12, 226);
  return canvas.toDataURL('image/jpeg', 0.6);
}

/** กระดานเซ็นชื่อจริง — วาดด้วยเมาส์/นิ้ว */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111827';
    }
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(e.currentTarget.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    onChange(null);
  };

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium">ลายเซ็นผู้รับ</span>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Eraser className="h-3 w-3" />
          ล้าง
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-28 w-full cursor-crosshair touch-none bg-[repeating-linear-gradient(0deg,transparent,transparent_27px,#e5e7eb_28px)]"
      />
      <div className="px-3 pb-1.5 text-center text-[10px] text-muted-foreground">
        ให้ลูกค้าเซ็นในกรอบนี้
      </div>
    </div>
  );
}

function ToggleRow({
  active,
  onClick,
  Icon,
  label,
  hint,
  required,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Camera;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        active ? 'border-emerald-300 bg-emerald-50' : 'hover:bg-muted/50',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {label}
          {required && <span className="text-[10px] font-normal text-red-500">*จำเป็น</span>}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
          active ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/30',
        )}
      >
        {active ? '✓' : ''}
      </span>
    </button>
  );
}

export function RiderCloseJobDialog({ open, order, onCancel, onSubmit }: Props) {
  const isCod = order?.payment === 'cod' || order?.payment === 'transfer_on_delivery';
  const needIdCheck = !!order?.requiresIdCheck;

  const [photos, setPhotos] = useState<string[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const [idVerified, setIdVerified] = useState(false);
  const [codCollected, setCodCollected] = useState(false);
  const [codMethod, setCodMethod] = useState<'cash' | 'transfer'>('cash');
  const [codAmount, setCodAmount] = useState('');

  useEffect(() => {
    if (open && order) {
      setPhotos([]);
      setSignatureDataUrl(null);
      setOtpVerified(false);
      setIdVerified(false);
      setCodCollected(false);
      setCodMethod('cash');
      setCodAmount(String(order.totalValue));
    }
  }, [open, order]);

  const willReview = order ? requiresDeliveryReview(order) : false;
  const signatureCaptured = !!signatureDataUrl;

  const missing = useMemo(() => {
    const items: string[] = [];
    if (photos.length < 1) items.push('ถ่ายรูปอย่างน้อย 1 รูป');
    if (!signatureCaptured && !otpVerified) items.push('ลายเซ็น หรือ OTP');
    if (needIdCheck && !idVerified) items.push('ตรวจบัตร ปชช.');
    if (isCod && !codCollected) items.push('บันทึกรับเงิน COD');
    return items;
  }, [photos.length, signatureCaptured, otpVerified, needIdCheck, idVerified, isCod, codCollected]);

  if (!open || !order) return null;

  const canSubmit = missing.length === 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      photoCount: photos.length,
      photos,
      signatureCaptured,
      signatureDataUrl: signatureDataUrl ?? undefined,
      otpVerified,
      idVerified: needIdCheck ? idVerified : undefined,
      location: MOCK_LOCATION,
      cod: isCod
        ? {
            collected: codCollected,
            method: codMethod,
            amount: Number(codAmount) || order.totalValue,
          }
        : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">ปิดงาน (rider)</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {order.code} · {order.customer.name} · {formatTHB(order.totalValue)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-auto px-5 py-4">
          {/* ถ่ายรูป */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
              ถ่ายรูปจุดส่งมอบ
              <span className="text-[10px] font-normal text-red-500">*จำเป็น</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((src, i) => (
                <div
                  key={i}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border"
                >
                  <img src={src} alt={`รูปที่ ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                    aria-label="ลบรูป"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPhotos((prev) => [...prev, captureMockPhoto(order)])}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted/50"
              >
                <Camera className="h-5 w-5" />
                <span className="text-[10px]">ถ่ายรูป</span>
              </button>
            </div>
          </div>

          {/* ลายเซ็น */}
          <SignaturePad onChange={setSignatureDataUrl} />

          <ToggleRow
            active={otpVerified}
            onClick={() => setOtpVerified((v) => !v)}
            Icon={Smartphone}
            label="ยืนยัน OTP"
            hint="ส่งรหัสไปเบอร์ลูกค้าเพื่อยืนยันตัวตน (ใช้แทนลายเซ็นได้)"
          />
          {needIdCheck && (
            <ToggleRow
              active={idVerified}
              onClick={() => setIdVerified((v) => !v)}
              Icon={IdCard}
              label="ตรวจบัตรประชาชน"
              hint="ชื่อ-บัตรตรงกับผู้รับ"
              required
            />
          )}

          {isCod && (
            <div className="rounded-lg border p-3">
              <button
                type="button"
                onClick={() => setCodCollected((v) => !v)}
                className="flex w-full items-center gap-2 text-sm font-medium"
              >
                <Banknote
                  className={cn(
                    'h-4 w-4',
                    codCollected ? 'text-emerald-600' : 'text-muted-foreground',
                  )}
                />
                บันทึกรับเงิน ({paymentLabel[order.payment]})
                <span className="text-[10px] font-normal text-red-500">*จำเป็น</span>
              </button>
              {codCollected && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-1.5">
                    {(['cash', 'transfer'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setCodMethod(m)}
                        className={cn(
                          'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                          codMethod === m
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {m === 'cash' ? 'เงินสด' : 'โอน'}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    placeholder="จำนวนเงินที่รับ"
                    className="h-9"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600" />
            ปั๊กตำแหน่ง GPS อัตโนมัติ — {MOCK_LOCATION.label}
          </div>

          {willReview && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              งานนี้เป็นงานเสี่ยงสูง — เมื่อกดปิด จะส่งให้ CS ตรวจหลักฐานก่อนปิดจริง
            </div>
          )}
        </div>

        <div className="border-t bg-muted/30 px-5 py-3">
          {missing.length > 0 && (
            <div className="mb-2 text-[11px] text-amber-700">
              ต้องทำก่อนปิด: {missing.join(' · ')}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              ยกเลิก
            </Button>
            <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
              {willReview ? 'ส่งให้ CS ยืนยัน' : 'ปิดงาน — ส่งสำเร็จ'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
