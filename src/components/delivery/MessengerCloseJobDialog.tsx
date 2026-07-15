import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type DeliveryProofEditorRole, type Order } from '@/data/orderTypes';
import type { SubmitDeliveryInput } from '@/state/retail/types';
import {
  canReviseDeliveryProof,
  deliveryProofRevisionLimits,
  getDeliveryProofRevisionCount,
} from '@/state/retail/delivery';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Eraser,
  ImagePlus,
  MapPin,
  PenLine,
  X,
} from 'lucide-react';

type Props = {
  open: boolean;
  order: Order | null;
  location?: { lat: number; lng: number; accuracy?: number } | null;
  editorRole?: DeliveryProofEditorRole;
  onCancel: () => void;
  onSubmit: (input: SubmitDeliveryInput) => void | Promise<void>;
};

const MAX_PHOTO_EDGE = 1280;
const PHOTO_QUALITY = 0.72;
const MAX_PHOTOS = 10;

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

type BrowserScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>;
  unlock?: () => void;
};

async function lockScreenOrientation(orientation: 'landscape' | 'portrait') {
  if (Capacitor.isNativePlatform()) {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.lock({ orientation });
    return;
  }

  const screenOrientation = window.screen?.orientation as BrowserScreenOrientation | undefined;
  await screenOrientation?.lock?.(orientation);
}

async function restorePortraitOrientation() {
  if (Capacitor.isNativePlatform()) {
    const { ScreenOrientation } = await import('@capacitor/screen-orientation');
    await ScreenOrientation.lock({ orientation: 'portrait' });
    return;
  }

  const screenOrientation = window.screen?.orientation as BrowserScreenOrientation | undefined;
  screenOrientation?.unlock?.();
}

function CameraCaptureSheet({
  open,
  onClose,
  onCapture,
  capturedCount = 0,
  maxPhotos = MAX_PHOTOS,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  /** จำนวนรูปที่ถ่ายไปแล้ว — ให้ถ่ายต่อเนื่องได้จนครบ maxPhotos โดยไม่ต้องเปิดกล้องใหม่ */
  capturedCount?: number;
  maxPhotos?: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
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

  const closeSheet = () => {
    stopCameraStream(stream);
    onClose();
  };

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
    // ถ่ายครบโควตาแล้วค่อยปิด — ระหว่างนั้นเปิดกล้องค้างไว้ให้ถ่ายรูปถัดไปต่อได้เลย
    if (capturedCount + 1 >= maxPhotos) closeSheet();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const remaining = maxPhotos - capturedCount;
    if (remaining <= 0) {
      setCameraError(`เพิ่มรูปได้สูงสุด ${maxPhotos} รูป`);
      return;
    }

    setProcessingFile(true);
    setCameraError(null);
    try {
      const dataUrls = await Promise.all(files.slice(0, remaining).map(photoFromFile));
      dataUrls.forEach(onCapture);
      closeSheet();
    } catch {
      setCameraError('อ่านรูปภาพไม่สำเร็จ กรุณาลองถ่ายใหม่');
    } finally {
      setProcessingFile(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2010] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 pb-3 pt-safe">
        <div>
          <div className="text-sm font-semibold">
            ถ่ายรูปส่งมอบ{' '}
            <span className="font-normal text-white/65">
              ({capturedCount}/{maxPhotos})
            </span>
          </div>
          <div className="text-[11px] text-white/65">ใช้กล้องหลัง ถ่ายพัสดุและจุดส่งมอบให้ชัด</div>
        </div>
        <div className="flex items-center gap-2">
          {capturedCount > 0 && (
            <button
              type="button"
              onClick={closeSheet}
              className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-white/90"
            >
              เสร็จ
            </button>
          )}
          <button
            type="button"
            onClick={closeSheet}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="ปิดกล้อง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
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
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
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
            aria-label="ถ่ายรูปด้วยกล้องมือถือ"
          >
            <Camera className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={captureFrame}
            disabled={starting || !stream}
            className="h-16 w-16 rounded-full border-4 border-white bg-white shadow-[0_0_0_5px_rgba(255,255,255,0.2)] disabled:opacity-50"
            aria-label="ถ่ายรูป"
          />
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            disabled={processingFile}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50"
            aria-label="เลือกรูปจากคลังภาพ"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        </div>
        {/* กล้องมือถือ (Capacitor/iOS): capture บังคับเปิดกล้องของเครื่อง */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        {/* คลังภาพ/ไฟล์: ไม่มี capture เพื่อให้เลือกรูปที่มีอยู่ได้ (ใช้บน iOS Simulator/Xcode) */}
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="text-center text-[11px] text-white/60">
          {processingFile
            ? 'กำลังประมวลผลรูป...'
            : 'ถ้าเปิดกล้องไม่ได้ (เช่น ทดสอบบน Xcode/Simulator) ให้แตะไอคอนรูปภาพเพื่อเลือกจากคลังภาพ'}
        </div>
      </div>
    </div>
  );
}

/** กระดานเซ็นชื่อจริง — วาดด้วยเมาส์/นิ้ว */
function SignaturePad({
  onChange,
  fill = false,
  initialDataUrl = null,
}: {
  onChange: (dataUrl: string | null) => void;
  /** ให้กระดานยืดเต็มพื้นที่ที่เหลือ (ใช้ตอนล็อกแนวนอน เพื่อไม่ให้ลูกค้าต้องเลื่อนจอ) */
  fill?: boolean;
  initialDataUrl?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const savedDataUrl = useRef<string | null>(null);

  useEffect(() => {
    const configureCanvas = (preserveDrawing: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return;
      const previous =
        preserveDrawing && inked.current ? canvas.toDataURL('image/png') : initialDataUrl;

      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111827';
      }

      if (previous && ctx) {
        const image = new Image();
        image.onload = () => {
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          inked.current = true;
          savedDataUrl.current = canvas.toDataURL('image/png');
          onChange(savedDataUrl.current);
        };
        image.src = previous;
      } else {
        inked.current = false;
        savedDataUrl.current = null;
      }
    };

    configureCanvas(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => configureCanvas(true));
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [initialDataUrl, onChange]);

  const prepareContext = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
    }
    return ctx;
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = prepareContext(e.currentTarget);
    if (!ctx) return;
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = prepareContext(e.currentTarget);
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) {
      savedDataUrl.current = e.currentTarget.toDataURL('image/png');
      onChange(savedDataUrl.current);
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    savedDataUrl.current = null;
    onChange(null);
  };

  return (
    <div className={cn('rounded-lg border', fill && 'flex min-h-0 flex-1 flex-col')}>
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
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
        className={cn(
          'w-full cursor-crosshair touch-none bg-[repeating-linear-gradient(0deg,transparent,transparent_47px,#e5e7eb_48px)]',
          fill ? 'min-h-0 flex-1' : 'h-56 sm:h-64',
        )}
      />
      <div className="shrink-0 px-3 pb-1.5 text-center text-[10px] text-muted-foreground">
        ให้ลูกค้าเซ็นในกรอบนี้
      </div>
    </div>
  );
}

type CloseStep = 'photo' | 'signature' | 'review';

const DELIVERY_CLOSE_STEPS: { key: CloseStep; label: string }[] = [
  { key: 'photo', label: 'ถ่ายรูป' },
  { key: 'signature', label: 'เซ็นรับ' },
  { key: 'review', label: 'ตรวจสอบ' },
];
const PICKUP_CLOSE_STEPS: { key: CloseStep; label: string }[] = [
  { key: 'photo', label: 'ถ่ายรูป' },
  { key: 'review', label: 'ตรวจสอบ' },
];

const CLOSE_JOB_DRAFT_STORAGE_PREFIX = 'movevai:close-job-draft:v1';

type CloseJobDraft = {
  orderId: string;
  orderCode: string;
  editorRole: DeliveryProofEditorRole;
  photos: string[];
  signatureDataUrl: string | null;
  step: CloseStep;
  savedAt: string;
};

function closeJobDraftKey(orderId: string, editorRole: DeliveryProofEditorRole) {
  return `${CLOSE_JOB_DRAFT_STORAGE_PREFIX}:${editorRole}:${orderId}`;
}

function readCloseJobDraft(
  orderId: string,
  editorRole: DeliveryProofEditorRole,
): CloseJobDraft | null {
  try {
    const raw = localStorage.getItem(closeJobDraftKey(orderId, editorRole));
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<CloseJobDraft>;
    if (draft.orderId !== orderId || draft.editorRole !== editorRole) return null;
    return {
      orderId,
      orderCode: typeof draft.orderCode === 'string' ? draft.orderCode : '',
      editorRole,
      photos: Array.isArray(draft.photos)
        ? draft.photos
            .filter((photo): photo is string => typeof photo === 'string')
            .slice(0, MAX_PHOTOS)
        : [],
      signatureDataUrl: typeof draft.signatureDataUrl === 'string' ? draft.signatureDataUrl : null,
      step:
        draft.step === 'photo' || draft.step === 'signature' || draft.step === 'review'
          ? draft.step
          : 'photo',
      savedAt: typeof draft.savedAt === 'string' ? draft.savedAt : new Date().toISOString(),
    };
  } catch (error) {
    console.warn('[MessengerCloseJobDialog] read draft skipped:', error);
    return null;
  }
}

function writeCloseJobDraft(draft: CloseJobDraft) {
  try {
    localStorage.setItem(closeJobDraftKey(draft.orderId, draft.editorRole), JSON.stringify(draft));
  } catch (error) {
    console.warn('[MessengerCloseJobDialog] save draft skipped:', error);
  }
}

function clearCloseJobDraft(orderId: string, editorRole: DeliveryProofEditorRole) {
  try {
    localStorage.removeItem(closeJobDraftKey(orderId, editorRole));
  } catch (error) {
    console.warn('[MessengerCloseJobDialog] clear draft skipped:', error);
  }
}

function restoreStep(step: CloseStep, hasPhoto: boolean, hasSignature: boolean): CloseStep {
  if (hasPhoto && hasSignature && step === 'review') return 'review';
  if (hasPhoto && ['signature', 'review'].includes(step)) return 'signature';
  return hasPhoto ? 'signature' : 'photo';
}

export function MessengerCloseJobDialog({
  open,
  order,
  location,
  editorRole = 'messenger',
  onCancel,
  onSubmit,
}: Props) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [step, setStep] = useState<CloseStep>('photo');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const initializedOrderIdRef = useRef<string | null>(null);
  const [hydratedOrderId, setHydratedOrderId] = useState<string | null>(null);
  const isPickupCheckpoint = order?.metadataJson?.dispatch?.routeLeg === 'pickup';
  const closeSteps = isPickupCheckpoint ? PICKUP_CLOSE_STEPS : DELIVERY_CLOSE_STEPS;

  useEffect(() => {
    if (!open) {
      initializedOrderIdRef.current = null;
      setHydratedOrderId(null);
      setCameraOpen(false);
      void restorePortraitOrientation().catch((error) => {
        console.warn('[MessengerCloseJobDialog] restore portrait skipped:', error);
      });
      return;
    }

    if (!order || initializedOrderIdRef.current === order.id) return;

    initializedOrderIdRef.current = order.id;
    const existingProof = order.proofOfDelivery;
    const draft = readCloseJobDraft(order.id, editorRole);
    const nextPhotos = (draft?.photos.length ? draft.photos : (existingProof?.photos ?? [])).slice(
      0,
      MAX_PHOTOS,
    );
    const nextSignatureDataUrl = draft?.signatureDataUrl ?? existingProof?.signatureDataUrl ?? null;
    const nextStep = draft
      ? restoreStep(draft.step, nextPhotos.length > 0, !!nextSignatureDataUrl)
      : existingProof
        ? 'review'
        : 'photo';

    setPhotos(nextPhotos);
    setSignatureDataUrl(nextSignatureDataUrl);
    setStep(isPickupCheckpoint && nextStep === 'signature' ? 'review' : nextStep);
    // อย่าเด้งเข้าหน้ากล้องเอง — บน iOS/Capacitor (WKWebView) getUserMedia
    // ใช้ไม่ได้แล้วจะเจอจอดำ ให้ผู้ใช้เลือกเองว่าจะเปิดกล้องหรือเลือกจากคลังภาพ
    setCameraOpen(false);
    setSubmitting(false);
    setSubmitError(null);
    setPhotoError(null);
    setHydratedOrderId(order.id);
  }, [editorRole, isPickupCheckpoint, open, order]);

  useEffect(() => {
    if (!open || !order || hydratedOrderId !== order.id) return;

    if (photos.length === 0 && !signatureDataUrl) {
      clearCloseJobDraft(order.id, editorRole);
      return;
    }

    writeCloseJobDraft({
      orderId: order.id,
      orderCode: order.orderNo ?? order.code,
      editorRole,
      photos,
      signatureDataUrl,
      step,
      savedAt: new Date().toISOString(),
    });
  }, [editorRole, hydratedOrderId, open, order, photos, signatureDataUrl, step]);

  useEffect(() => {
    if (!open) return;

    const target = step === 'signature' && !isPickupCheckpoint ? 'landscape' : 'portrait';
    void lockScreenOrientation(target).catch((error) => {
      console.warn(`[MessengerCloseJobDialog] lock ${target} orientation skipped:`, error);
    });

    return () => {
      if (step === 'signature' && !isPickupCheckpoint) {
        void restorePortraitOrientation().catch((error) => {
          console.warn('[MessengerCloseJobDialog] restore portrait skipped:', error);
        });
      }
    };
  }, [isPickupCheckpoint, open, step]);

  const signatureCaptured = !!signatureDataUrl;
  const isRevision = order?.status === 'pending_confirmation';
  const revisionCount = order ? getDeliveryProofRevisionCount(order, editorRole) : 0;
  const revisionLimit = deliveryProofRevisionLimits[editorRole];
  const revisionAllowed = !isRevision || (order ? canReviseDeliveryProof(order, editorRole) : true);
  const editorLabel = editorRole === 'admin' ? 'admin' : 'messenger';

  const missing = useMemo(() => {
    const items: string[] = [];
    if (photos.length < 1) items.push(isPickupCheckpoint ? 'ถ่ายรูปรับของ' : 'ถ่ายรูปส่งมอบ');
    if (!isPickupCheckpoint && !signatureCaptured) items.push('ลายเซ็นผู้รับ');
    return items;
  }, [isPickupCheckpoint, photos.length, signatureCaptured]);

  if (!open || !order) return null;

  const canSubmit = missing.length === 0 && revisionAllowed;
  const currentStepIndex = closeSteps.findIndex((item) => item.key === step);
  const signatureMode = step === 'signature' && !isPickupCheckpoint;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        photoCount: photos.length,
        photos,
        signatureCaptured: isPickupCheckpoint ? false : signatureCaptured,
        signatureDataUrl: isPickupCheckpoint ? undefined : (signatureDataUrl ?? undefined),
        otpVerified: false,
        editorRole,
        location: location
          ? {
              lat: location.lat,
              lng: location.lng,
              label:
                location.accuracy != null
                  ? `พิกัด GPS ขณะส่งมอบ (±${Math.round(location.accuracy)} ม.)`
                  : 'พิกัด GPS ขณะส่งมอบ',
            }
          : undefined,
      });
      clearCloseJobDraft(order.id, editorRole);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'บันทึกหลักฐานไม่สำเร็จ กรุณาลองใหม่',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhotoCaptured = (dataUrl: string) => {
    setPhotos((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, dataUrl]));
    setPhotoError(null);
    setStep('photo');
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoError(null);
  };

  const handleLibraryPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setPhotoError(null);

    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setPhotoError(`เพิ่มรูปได้สูงสุด ${MAX_PHOTOS} รูป`);
      return;
    }

    try {
      const dataUrls = await Promise.all(files.slice(0, remaining).map(photoFromFile));
      setPhotos((prev) => [...prev, ...dataUrls].slice(0, MAX_PHOTOS));
      if (files.length > remaining) {
        setPhotoError(
          `เพิ่มรูปได้สูงสุด ${MAX_PHOTOS} รูป — รูปที่เกินมา ${files.length - remaining} รูปไม่ถูกเพิ่ม`,
        );
      }
    } catch {
      setPhotoError('อ่านรูปภาพไม่สำเร็จ กรุณาลองเลือกใหม่');
    }
  };

  return (
    <div
      className={cn(
        'fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center',
        signatureMode ? 'sm:p-2' : 'sm:p-4',
      )}
    >
      {/* มือถือ = full-screen sheet (h-dvh) / desktop = การ์ดกลางจอ */}
      <div
        className={cn(
          'flex h-dvh w-full flex-col overflow-hidden border bg-background shadow-xl sm:rounded-xl',
          signatureMode
            ? 'sm:h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1rem)] sm:max-w-[calc(100vw-1rem)]'
            : 'sm:h-auto sm:max-h-[90dvh] sm:max-w-md',
        )}
      >
        <div
          className={cn(
            'flex items-start justify-between border-b px-5 pb-4 pt-safe',
            signatureMode && 'shrink-0 px-4 pb-2 pt-2',
          )}
        >
          <div className="min-w-0">
            <h2 className={cn('text-base font-semibold', signatureMode && 'text-sm')}>
              {order.status === 'pending_confirmation'
                ? 'แก้ไขหลักฐาน'
                : editorRole === 'admin'
                  ? 'บันทึกหลักฐาน (admin)'
                  : isPickupCheckpoint
                    ? 'ยืนยันรับของ'
                    : 'ยืนยันส่งมอบ'}
            </h2>
            <p
              className={cn(
                'mt-0.5 text-xs text-muted-foreground',
                signatureMode && 'truncate text-[11px]',
              )}
            >
              {order.orderNo} · {order.customer.name}
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

        <div className={cn('border-b px-5 py-3', signatureMode && 'hidden')}>
          {isRevision && (
            <div
              className={cn(
                'mb-3 rounded-lg border px-3 py-2 text-[11px] font-medium',
                revisionAllowed
                  ? 'border-info/30 bg-info/10 text-info'
                  : 'border-destructive/30 bg-destructive/10 text-destructive',
              )}
            >
              แก้ไข {editorLabel}: {revisionCount}/{revisionLimit}
            </div>
          )}
          <div className={cn('grid gap-2', isPickupCheckpoint ? 'grid-cols-2' : 'grid-cols-3')}>
            {closeSteps.map((item, index) => {
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
                (item.key === 'review' &&
                  photos.length > 0 &&
                  (isPickupCheckpoint || signatureCaptured));

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (canNavigate) setStep(item.key);
                  }}
                  disabled={!canNavigate}
                  className={cn(
                    'flex items-center justify-center rounded-lg border text-[11px] font-medium transition-colors',
                    step === 'signature'
                      ? 'min-h-0 flex-row gap-1.5 px-1.5 py-1.5'
                      : 'min-h-14 flex-col px-1.5 py-2',
                    active && 'border-primary bg-primary/10 text-primary',
                    !active && done && 'border-success/30 bg-success/10 text-success',
                    !active && !done && 'text-muted-foreground',
                    !canNavigate && 'opacity-45',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                      step === 'signature' ? 'mb-0' : 'mb-0.5',
                      active && 'bg-primary text-primary-foreground',
                      !active && done && 'bg-success text-white',
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

        <div
          className={cn(
            'flex-1 px-5',
            // แนวนอน (เซ็นรับ): ไม่ให้ scroll ภายใน แล้วให้กระดานเซ็นยืดเต็มพื้นที่
            signatureMode
              ? 'flex min-h-0 flex-col overflow-hidden px-4 py-2'
              : 'overflow-auto py-4',
          )}
        >
          {step === 'photo' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Camera className="h-4 w-4 text-primary" />
                    {isPickupCheckpoint ? 'ถ่ายรูปรับของ' : 'ถ่ายรูปส่งมอบ'}
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {photos.length}/{MAX_PHOTOS} รูป
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isPickupCheckpoint
                    ? `ถ่ายรูปของที่รับและจุดรับให้ชัดเจน (สูงสุด ${MAX_PHOTOS} รูป)`
                    : `ให้ messenger ถ่ายพัสดุและจุดส่งมอบก่อนส่งมือถือให้ลูกค้าเซ็น (สูงสุด ${MAX_PHOTOS} รูป)`}
                </p>
              </div>

              {photos.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((src, index) => (
                      <div
                        key={index}
                        className="relative overflow-hidden rounded-lg border bg-muted"
                      >
                        <img
                          src={src}
                          alt={`รูปส่งมอบ ${index + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                          aria-label={`ลบรูปที่ ${index + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {photos.length < MAX_PHOTOS && (
                      <button
                        type="button"
                        onClick={() => setCameraOpen(true)}
                        className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted/50"
                      >
                        <Camera className="h-5 w-5" />
                        <span className="text-[10px] font-medium">ถ่ายเพิ่ม</span>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      disabled={photos.length >= MAX_PHOTOS}
                      onClick={() => libraryInputRef.current?.click()}
                    >
                      <ImagePlus className="h-4 w-4" />
                      เลือกจากคลังภาพ
                    </Button>
                    <Button onClick={() => setStep('signature')}>ถัดไป</Button>
                  </div>
                  {photoError && (
                    <p className="text-center text-[11px] text-destructive">{photoError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setCameraOpen(true)}
                    className="flex aspect-4/3 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    <Camera className="h-8 w-8" />
                    <span className="text-sm font-medium">เปิดกล้องถ่ายรูป</span>
                    <span className="text-xs">ต้องมีรูปอย่างน้อย 1 รูปก่อนให้ลูกค้าเซ็น</span>
                  </button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => libraryInputRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    เลือกรูปจากคลังภาพ
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    เปิดกล้องไม่ได้ (เช่น ทดสอบบน Xcode/Simulator)?
                    เลือกรูปจากคลังภาพเพื่อทำงานต่อได้
                  </p>
                  {photoError && (
                    <p className="text-center text-[11px] text-destructive">{photoError}</p>
                  )}
                </div>
              )}
              <input
                ref={libraryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleLibraryPick}
              />
            </div>
          )}

          {step === 'signature' && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <SignaturePad fill initialDataUrl={signatureDataUrl} onChange={setSignatureDataUrl} />
              {signatureCaptured && (
                <span className="inline-flex shrink-0 items-center justify-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  บันทึกลายเซ็นแล้ว
                </span>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {isPickupCheckpoint
                    ? 'ตรวจหลักฐานก่อนยืนยันรับของ'
                    : 'ตรวจหลักฐานก่อนยืนยันส่งมอบ'}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isPickupCheckpoint
                    ? 'ตรวจว่ารูปรับของชัดเจนก่อนยืนยันจุดรับ แล้วไปยังจุดถัดไปในเที่ยว'
                    : 'ตรวจว่ารูปส่งมอบและลายเซ็นครบ ก่อนส่งให้ CS/admin ตรวจสอบและยืนยันส่งมอบ'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {photos.length > 0 ? (
                  photos.map((src, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setStep('photo')}
                      className="overflow-hidden rounded-lg border bg-card text-left"
                    >
                      <img
                        src={src}
                        alt={`รูปส่งมอบ ${index + 1}`}
                        className="aspect-4/3 w-full object-cover"
                      />
                      <div className="px-2 py-1.5 text-[11px] font-medium">
                        รูปส่งมอบ {index + 1}/{photos.length}
                      </div>
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep('photo')}
                    className="overflow-hidden rounded-lg border bg-card text-left"
                  >
                    <div className="flex aspect-4/3 items-center justify-center bg-muted text-muted-foreground">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div className="px-2 py-1.5 text-[11px] font-medium">รูปส่งมอบ</div>
                  </button>
                )}

                {!isPickupCheckpoint && (
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
                )}
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                {location
                  ? `แนบพิกัด GPS ปัจจุบันอัตโนมัติ${
                      location.accuracy != null
                        ? ` · แม่นยำประมาณ ±${Math.round(location.accuracy)} ม.`
                        : ''
                    }`
                  : 'ยังอ่านพิกัด GPS ไม่ได้ — ระบบจะบันทึกรูปและลายเซ็นโดยไม่สร้างพิกัดจำลอง'}
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
                {isPickupCheckpoint
                  ? 'เมื่อยืนยันแล้ว ระบบจะเลื่อนไปยังจุดถัดไปของเที่ยวโดยอัตโนมัติ'
                  : 'เมื่อกดยืนยัน รายการจะอยู่ใน “รอตรวจสอบ” ก่อน ยังไม่บันทึกเป็นส่งสำเร็จ'}
              </div>
              {isRevision && (
                <div
                  className={cn(
                    'rounded-lg border px-3 py-2 text-[11px]',
                    revisionAllowed
                      ? 'border-info/30 bg-info/10 text-info'
                      : 'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  แก้ไข {editorLabel}: {revisionCount}/{revisionLimit}
                  {!revisionAllowed && ' — แก้ไขได้ครบจำนวนครั้งแล้ว'}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            'border-t bg-muted/30 px-5 pb-safe pt-3',
            signatureMode && 'shrink-0 px-4 pb-2 pt-2',
          )}
        >
          {submitError && (
            <div className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {submitError}
            </div>
          )}
          {missing.length > 0 && !signatureMode && (
            <div className="mb-2 text-[11px] text-warning">
              ต้องทำก่อนยืนยัน: {missing.join(' · ')}
            </div>
          )}
          {!revisionAllowed && !signatureMode && (
            <div className="mb-2 text-[11px] text-destructive">
              แก้ไขหลักฐานได้ครบจำนวนครั้งแล้ว
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
                setStep(closeSteps[Math.max(0, currentStepIndex - 1)].key);
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
                onClick={() =>
                  setStep(
                    step === 'photo' ? (isPickupCheckpoint ? 'review' : 'signature') : 'review',
                  )
                }
              >
                {step === 'photo'
                  ? isPickupCheckpoint
                    ? 'ตรวจหลักฐาน'
                    : 'ถัดไป: เซ็นรับ'
                  : 'ตรวจหลักฐาน'}
              </Button>
            ) : (
              <div className="flex gap-2">
                {!canSubmit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setStep(
                        photos.length === 0 ? 'photo' : isPickupCheckpoint ? 'review' : 'signature',
                      )
                    }
                  >
                    แก้ไข
                  </Button>
                )}
                <Button size="sm" disabled={!canSubmit || submitting} onClick={handleSubmit}>
                  {submitting
                    ? 'กำลังบันทึก...'
                    : order.status === 'pending_confirmation'
                      ? 'บันทึกและส่งตรวจใหม่'
                      : isPickupCheckpoint
                        ? 'ยืนยันรับของ'
                        : 'ส่งตรวจสอบ'}
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
        capturedCount={photos.length}
        maxPhotos={MAX_PHOTOS}
      />
    </div>
  );
}
