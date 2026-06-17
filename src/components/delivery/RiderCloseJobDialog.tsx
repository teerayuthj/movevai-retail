import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTHB, type Order } from '@/data/mock';
import { requiresDeliveryReview } from '@/lib/deliveryExecution';
import type { SubmitDeliveryInput } from '@/state/retail/types';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eraser,
  ImagePlus,
  MapPin,
  PenLine,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';

type Props = {
  open: boolean;
  order: Order | null;
  onCancel: () => void;
  onSubmit: (input: SubmitDeliveryInput) => void;
};

// จำลองพิกัด GPS ตอนปิดงาน (ของจริงดึงจากอุปกรณ์ rider)
const MOCK_LOCATION = { lat: 13.7392, lng: 100.5408, label: 'ใกล้ที่อยู่ผู้รับ' };

const MAX_PHOTO_EDGE = 1280;
const PHOTO_QUALITY = 0.72;

function canvasToJpegDataUrl(canvas: HTMLCanvasElement) {
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

function drawScaledImage(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): string {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvasToJpegDataUrl(canvas);
}

function photoFromFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(drawScaledImage(image, image.naturalWidth, image.naturalHeight));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านรูปภาพไม่สำเร็จ'));
    };
    image.src = url;
  });
}

function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function CameraCaptureSheet({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);

  useEffect(() => {
    if (!open) return;

    let active = true;
    let localStream: MediaStream | null = null;

    const startCamera = async () => {
      if (!window.isSecureContext) {
        setCameraError('กล้องใช้งานได้เมื่อเปิดผ่าน HTTPS หรือ localhost เท่านั้น');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('เบราว์เซอร์นี้ยังไม่รองรับการเปิดกล้องจากเว็บ');
        return;
      }

      setStarting(true);
      setCameraError(null);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (!active) {
          stopCameraStream(localStream);
          return;
        }

        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          await videoRef.current.play();
        }
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'ไม่ได้รับสิทธิ์เปิดกล้อง กรุณาอนุญาตกล้องหรือใช้ปุ่มเลือกรูป'
            : 'เปิดกล้องไม่สำเร็จ กรุณาลองใหม่หรือใช้ปุ่มเลือกรูป';
        setCameraError(message);
      } finally {
        if (active) setStarting(false);
      }
    };

    void startCamera();

    return () => {
      active = false;
      stopCameraStream(localStream);
      setStream(null);
    };
  }, [open]);

  useEffect(() => {
    if (!open && stream) {
      stopCameraStream(stream);
      setStream(null);
    }
  }, [open, stream]);

  if (!open) return null;

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('กล้องยังไม่พร้อม กรุณารอสักครู่');
      return;
    }

    const dataUrl = drawScaledImage(video, video.videoWidth, video.videoHeight);
    if (!dataUrl) {
      setCameraError('บันทึกรูปจากกล้องไม่สำเร็จ');
      return;
    }

    onCapture(dataUrl);
    stopCameraStream(stream);
    onClose();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProcessingFile(true);
    setCameraError(null);
    try {
      const dataUrl = await photoFromFile(file);
      onCapture(dataUrl);
      stopCameraStream(stream);
      onClose();
    } catch {
      setCameraError('อ่านรูปภาพไม่สำเร็จ กรุณาลองถ่ายใหม่');
    } finally {
      setProcessingFile(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pb-3 pt-safe">
        <div>
          <div className="text-sm font-semibold">ถ่ายรูปส่งมอบ</div>
          <div className="text-[11px] text-white/65">ใช้กล้องหลัง ถ่ายพัสดุและจุดส่งมอบให้ชัด</div>
        </div>
        <button
          type="button"
          onClick={() => {
            stopCameraStream(stream);
            onClose();
          }}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          aria-label="ปิดกล้อง"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn('h-full w-full object-cover', (starting || cameraError) && 'opacity-30')}
        />

        {starting && (
          <div className="absolute inset-x-4 rounded-lg bg-black/70 px-4 py-3 text-center text-sm">
            กำลังเปิดกล้อง...
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-x-4 rounded-lg bg-black/75 px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <span>{cameraError}</span>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 px-5 pb-safe pt-4">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processingFile}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
            aria-label="เลือกรูปหรือเปิดกล้องมือถือ"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={captureFrame}
            disabled={starting || !stream}
            className="h-16 w-16 rounded-full border-4 border-white bg-white shadow-[0_0_0_5px_rgba(255,255,255,0.2)] disabled:opacity-50"
            aria-label="ถ่ายรูป"
          />
          <div className="h-12 w-12" />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="text-center text-[11px] text-white/60">
          ถ้าเปิดกล้องไม่ได้ ให้แตะไอคอนรูปภาพเพื่อใช้กล้อง/คลังรูปของเครื่อง
        </div>
      </div>
    </div>
  );
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
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
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
        className="h-72 w-full cursor-crosshair touch-none bg-[repeating-linear-gradient(0deg,transparent,transparent_47px,#e5e7eb_48px)]"
      />
      <div className="px-3 pb-1.5 text-center text-[10px] text-muted-foreground">
        ให้ลูกค้าเซ็นในกรอบนี้
      </div>
    </div>
  );
}

type CloseStep = 'photo' | 'signature' | 'review';

const CLOSE_STEPS: { key: CloseStep; label: string }[] = [
  { key: 'photo', label: 'ถ่ายรูป' },
  { key: 'signature', label: 'เซ็นรับ' },
  { key: 'review', label: 'ตรวจสอบ' },
];

export function RiderCloseJobDialog({ open, order, onCancel, onSubmit }: Props) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [step, setStep] = useState<CloseStep>('photo');

  useEffect(() => {
    if (open && order) {
      setPhotos([]);
      setSignatureDataUrl(null);
      setStep('photo');
      setCameraOpen(true);
    }
  }, [open, order]);

  const willReview = order ? requiresDeliveryReview(order) : false;
  const signatureCaptured = !!signatureDataUrl;

  const missing = useMemo(() => {
    const items: string[] = [];
    if (photos.length < 1) items.push('ถ่ายรูปส่งมอบ');
    if (!signatureCaptured) items.push('ลายเซ็นผู้รับ');
    return items;
  }, [photos.length, signatureCaptured]);

  if (!open || !order) return null;

  const canSubmit = missing.length === 0;
  const currentStepIndex = CLOSE_STEPS.findIndex((item) => item.key === step);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      photoCount: photos.length,
      photos,
      signatureCaptured,
      signatureDataUrl: signatureDataUrl ?? undefined,
      otpVerified: false,
      location: MOCK_LOCATION,
    });
  };

  const handlePhotoCaptured = (dataUrl: string) => {
    setPhotos([dataUrl]);
    setStep('signature');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      {/* มือถือ = full-screen sheet (h-dvh) / desktop = การ์ดกลางจอ */}
      <div className="flex h-dvh w-full flex-col overflow-hidden border bg-background shadow-xl sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:rounded-xl">
        <div className="flex items-start justify-between border-b px-5 pb-4 pt-safe">
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

        <div className="border-b px-5 py-3">
          <div className="grid grid-cols-3 gap-2">
            {CLOSE_STEPS.map((item, index) => {
              const done =
                item.key === 'photo'
                  ? photos.length > 0
                  : item.key === 'signature'
                    ? signatureCaptured
                    : canSubmit;
              const active = item.key === step;
              const canNavigate =
                item.key === 'photo' ||
                (item.key === 'signature' && photos.length > 0) ||
                (item.key === 'review' && photos.length > 0 && signatureCaptured);

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (canNavigate) setStep(item.key);
                  }}
                  disabled={!canNavigate}
                  className={cn(
                    'flex min-h-14 flex-col items-center justify-center rounded-lg border px-1.5 py-2 text-[11px] font-medium transition-colors',
                    active && 'border-primary bg-primary/10 text-primary',
                    !active && done && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    !active && !done && 'text-muted-foreground',
                    !canNavigate && 'opacity-45',
                  )}
                >
                  <span
                    className={cn(
                      'mb-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                      active && 'bg-primary text-primary-foreground',
                      !active && done && 'bg-emerald-500 text-white',
                      !active && !done && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {done ? <CheckCircle2 className="h-3 w-3" /> : index + 1}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          {step === 'photo' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Camera className="h-4 w-4 text-primary" />
                  ถ่ายรูปส่งมอบ
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  ให้ rider ถ่ายพัสดุและจุดส่งมอบก่อนส่งมือถือให้ลูกค้าเซ็น
                </p>
              </div>

              {photos[0] ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={photos[0]}
                      alt="รูปส่งมอบ"
                      className="aspect-4/3 w-full object-cover"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={() => setCameraOpen(true)}>
                      <RotateCcw className="h-4 w-4" />
                      ถ่ายใหม่
                    </Button>
                    <Button onClick={() => setStep('signature')}>ใช้รูปนี้</Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted/50"
                >
                  <Camera className="h-8 w-8" />
                  <span className="text-sm font-medium">เปิดกล้องถ่ายรูป</span>
                  <span className="text-xs">ต้องมีรูปก่อนให้ลูกค้าเซ็น</span>
                </button>
              )}
            </div>
          )}

          {step === 'signature' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PenLine className="h-4 w-4 text-primary" />
                  ลูกค้าเซ็นรับ
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  ส่งมือถือให้ลูกค้าเซ็นในกรอบนี้ หลังจากเซ็นเสร็จ rider
                  รับมือถือกลับมาตรวจและปิดงาน
                </p>
              </div>

              <SignaturePad onChange={setSignatureDataUrl} />

              {signatureCaptured && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    บันทึกลายเซ็นแล้ว
                  </div>
                  <img
                    src={signatureDataUrl}
                    alt="ลายเซ็นที่บันทึกแล้ว"
                    className="h-20 w-full rounded-md border border-emerald-200 bg-white object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  ตรวจหลักฐานก่อนปิดงาน
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  ตรวจว่ารูปส่งมอบและลายเซ็นครบ ก่อนยืนยันปิดงาน
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStep('photo')}
                  className="overflow-hidden rounded-lg border bg-card text-left"
                >
                  {photos[0] ? (
                    <img
                      src={photos[0]}
                      alt="รูปส่งมอบ"
                      className="aspect-4/3 w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-4/3 items-center justify-center bg-muted text-muted-foreground">
                      <Camera className="h-6 w-6" />
                    </div>
                  )}
                  <div className="px-2 py-1.5 text-[11px] font-medium">รูปส่งมอบ</div>
                </button>

                <button
                  type="button"
                  onClick={() => setStep('signature')}
                  className="overflow-hidden rounded-lg border bg-card text-left"
                >
                  {signatureDataUrl ? (
                    <img
                      src={signatureDataUrl}
                      alt="ลายเซ็นผู้รับ"
                      className="aspect-4/3 w-full bg-white object-contain"
                    />
                  ) : (
                    <div className="flex aspect-4/3 items-center justify-center bg-muted text-muted-foreground">
                      <PenLine className="h-6 w-6" />
                    </div>
                  )}
                  <div className="px-2 py-1.5 text-[11px] font-medium">ลายเซ็นผู้รับ</div>
                </button>
              </div>

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
          )}
        </div>

        <div className="border-t bg-muted/30 px-5 pb-safe pt-3">
          {missing.length > 0 && (
            <div className="mb-2 text-[11px] text-amber-700">
              ต้องทำก่อนปิด: {missing.join(' · ')}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (step === 'photo') {
                  onCancel();
                  return;
                }
                setStep(CLOSE_STEPS[Math.max(0, currentStepIndex - 1)].key);
              }}
            >
              {step === 'photo' ? (
                'ยกเลิก'
              ) : (
                <>
                  <ArrowLeft className="h-4 w-4" />
                  ย้อนกลับ
                </>
              )}
            </Button>

            {step !== 'review' ? (
              <Button
                size="sm"
                disabled={step === 'photo' ? photos.length === 0 : !signatureCaptured}
                onClick={() => setStep(step === 'photo' ? 'signature' : 'review')}
              >
                {step === 'photo' ? 'ต่อไป: เซ็นรับ' : 'ตรวจหลักฐาน'}
              </Button>
            ) : (
              <div className="flex gap-2">
                {!canSubmit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(photos.length === 0 ? 'photo' : 'signature')}
                  >
                    แก้ไข
                  </Button>
                )}
                <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
                  {willReview ? 'ส่งให้ CS ยืนยัน' : 'ปิดงาน — ส่งสำเร็จ'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <CameraCaptureSheet
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handlePhotoCaptured}
      />
    </div>
  );
}
