import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  loginMessenger,
  registerMessengerDriver,
  type MessengerRegisterResult,
  type MessengerSession,
} from '@/lib/retailApi';
import type { Driver } from '@/data/mock';
import { Camera, CheckCircle2, FileImage, Loader2, UserPlus } from 'lucide-react';

const TEST_PHONE = '0891112233';
const TEST_PIN = '123456';
const PENDING_REGISTRATION_KEY = 'movevai:messenger-pending-registration';

type LoginMode = 'login' | 'register' | 'pending';

type PendingRegistration = MessengerRegisterResult['driver'] & {
  submittedAt: string;
};

type RegisterForm = {
  name: string;
  phone: string;
  pin: string;
  confirmPin: string;
  vehicle: Driver['vehicle'];
  licensePlate: string;
  idCardNumber: string;
  profilePhotoDataUrl: string;
  idCardPhotoDataUrl: string;
};

const emptyRegisterForm: RegisterForm = {
  name: '',
  phone: '',
  pin: '',
  confirmPin: '',
  vehicle: 'motorcycle',
  licensePlate: '',
  idCardNumber: '',
  profilePhotoDataUrl: '',
  idCardPhotoDataUrl: '',
};

const vehicleLabel: Record<Driver['vehicle'], string> = {
  motorcycle: 'จักรยานยนต์',
  van: 'รถตู้',
  pickup: 'รถกระบะ',
};

function deviceId() {
  const key = 'movevai:messenger-device-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

function loadPendingRegistration(): PendingRegistration | null {
  try {
    const raw = localStorage.getItem(PENDING_REGISTRATION_KEY);
    return raw ? (JSON.parse(raw) as PendingRegistration) : null;
  } catch {
    return null;
  }
}

function savePendingRegistration(driver: MessengerRegisterResult['driver']) {
  const pending: PendingRegistration = { ...driver, submittedAt: new Date().toISOString() };
  localStorage.setItem(PENDING_REGISTRATION_KEY, JSON.stringify(pending));
  return pending;
}

function clearPendingRegistration() {
  localStorage.removeItem(PENDING_REGISTRATION_KEY);
}

function fileToImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('อ่านรูปไม่สำเร็จ'));
    };
    image.src = url;
  });
}

async function resizeImageFile(file: File) {
  const image = await fileToImage(file);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ย่อรูปไม่สำเร็จ');
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.78);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function ImageCaptureField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    setLoading(true);
    try {
      onChange(await resizeImageFile(file));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'อ่านรูปไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange('')}>
            ล้างรูป
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <FileImage className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Camera className="h-3 w-3" />
            ถ่ายรูปหรือเลือกรูปจากเครื่อง
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingView({
  pending,
  onBackToLogin,
}: {
  pending: PendingRegistration | null;
  onBackToLogin: () => void;
}) {
  return (
    <div className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-warning/10 p-2 text-warning">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">ส่งใบสมัครแล้ว</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            บัญชีจะใช้งานได้หลัง admin ตรวจรูปบัตรประชาชนและอนุมัติ
          </p>
        </div>
      </div>
      {pending && (
        <div className="space-y-1 rounded-lg border p-3 text-sm">
          <div className="font-medium">{pending.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{pending.code}</div>
          <div className="text-xs text-muted-foreground">
            ส่งเมื่อ {new Date(pending.submittedAt).toLocaleString('th-TH')}
          </div>
        </div>
      )}
      <Button className="w-full" variant="outline" onClick={onBackToLogin}>
        กลับไปหน้าเข้าสู่ระบบ
      </Button>
    </div>
  );
}

export function MessengerLogin({ onLogin }: { onLogin: (session: MessengerSession) => void }) {
  const [mode, setMode] = useState<LoginMode>(() =>
    loadPendingRegistration() ? 'pending' : 'login',
  );
  const [pending, setPending] = useState<PendingRegistration | null>(() => loadPendingRegistration());
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [registerForm, setRegisterForm] = useState<RegisterForm>(emptyRegisterForm);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmitRegister = useMemo(
    () =>
      registerForm.name.trim() &&
      registerForm.phone.trim() &&
      registerForm.pin.trim() &&
      registerForm.pin === registerForm.confirmPin &&
      registerForm.licensePlate.trim() &&
      registerForm.idCardNumber.trim() &&
      registerForm.profilePhotoDataUrl &&
      registerForm.idCardPhotoDataUrl,
    [registerForm],
  );

  async function submitLogin() {
    setLoading(true);
    setError('');
    try {
      const session = await loginMessenger(phone, pin, deviceId());
      clearPendingRegistration();
      onLogin(session);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ';
      if (pending && phone.trim() === pending.phone) {
        setMode('pending');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister() {
    if (!canSubmitRegister) {
      setError('กรอกข้อมูลสมัครและแนบรูปให้ครบก่อนส่ง');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await registerMessengerDriver({
        name: registerForm.name.trim(),
        phone: registerForm.phone.trim(),
        pin: registerForm.pin,
        vehicle: registerForm.vehicle,
        licensePlate: registerForm.licensePlate.trim(),
        idCardNumber: registerForm.idCardNumber.trim(),
        profilePhotoDataUrl: registerForm.profilePhotoDataUrl,
        idCardPhotoDataUrl: registerForm.idCardPhotoDataUrl,
      });
      setPending(savePendingRegistration(result.driver));
      setPhone(registerForm.phone.trim());
      setPin('');
      setRegisterForm(emptyRegisterForm);
      setMode('pending');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ส่งใบสมัครไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      {mode === 'pending' ? (
        <PendingView
          pending={pending}
          onBackToLogin={() => {
            setMode('login');
            setError('');
          }}
        />
      ) : mode === 'register' ? (
        <form
          className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-5 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRegister();
          }}
        >
          <div>
            <h1 className="text-xl font-semibold">สมัคร Messenger</h1>
            <p className="text-sm text-muted-foreground">
              กรอกข้อมูลและรอ admin อนุมัติก่อนเริ่มรับงาน
            </p>
          </div>

          <Field label="ชื่อ">
            <Input
              autoComplete="name"
              value={registerForm.name}
              onChange={(event) =>
                setRegisterForm((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="เบอร์โทร">
            <Input
              inputMode="tel"
              autoComplete="tel"
              value={registerForm.phone}
              onChange={(event) =>
                setRegisterForm((current) => ({ ...current, phone: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="ยานพาหนะ">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={registerForm.vehicle}
              onChange={(event) =>
                setRegisterForm((current) => ({
                  ...current,
                  vehicle: event.target.value as Driver['vehicle'],
                }))
              }
            >
              {Object.entries(vehicleLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ทะเบียนรถ">
            <Input
              value={registerForm.licensePlate}
              onChange={(event) =>
                setRegisterForm((current) => ({ ...current, licensePlate: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="เลขบัตรประชาชน">
            <Input
              inputMode="numeric"
              value={registerForm.idCardNumber}
              onChange={(event) =>
                setRegisterForm((current) => ({ ...current, idCardNumber: event.target.value }))
              }
              required
            />
          </Field>
          <div className="grid gap-3">
            <ImageCaptureField
              label="รูปโปรไฟล์"
              value={registerForm.profilePhotoDataUrl}
              onChange={(value) =>
                setRegisterForm((current) => ({ ...current, profilePhotoDataUrl: value }))
              }
            />
            <ImageCaptureField
              label="รูปบัตรประชาชน"
              value={registerForm.idCardPhotoDataUrl}
              onChange={(value) =>
                setRegisterForm((current) => ({ ...current, idCardPhotoDataUrl: value }))
              }
            />
          </div>
          <Field label="ตั้ง PIN">
            <Input
              inputMode="numeric"
              autoComplete="new-password"
              type="password"
              value={registerForm.pin}
              onChange={(event) =>
                setRegisterForm((current) => ({ ...current, pin: event.target.value }))
              }
              required
            />
          </Field>
          <Field label="ยืนยัน PIN">
            <Input
              inputMode="numeric"
              autoComplete="new-password"
              type="password"
              value={registerForm.confirmPin}
              onChange={(event) =>
                setRegisterForm((current) => ({ ...current, confirmPin: event.target.value }))
              }
              required
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading || !canSubmitRegister}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            ส่งใบสมัคร
          </Button>
          <Button
            className="w-full"
            type="button"
            variant="outline"
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            กลับไปเข้าสู่ระบบ
          </Button>
        </form>
      ) : (
        <form
          className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void submitLogin();
          }}
        >
          <div>
            <h1 className="text-xl font-semibold">Messenger Login</h1>
            <p className="text-sm text-muted-foreground">
              ใช้เบอร์โทรและ PIN หรือสมัครบัญชีใหม่
            </p>
          </div>
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium text-warning-foreground">โหมดทดสอบ — ใช้บัญชีตัวอย่างนี้</p>
            <div className="space-y-0.5 text-muted-foreground">
              <p>
                เบอร์โทร:{' '}
                <span className="font-mono font-semibold text-foreground">{TEST_PHONE}</span>
              </p>
              <p>
                PIN: <span className="font-mono font-semibold text-foreground">{TEST_PIN}</span>
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setPhone(TEST_PHONE);
                setPin(TEST_PIN);
              }}
            >
              กรอกบัญชีทดสอบให้อัตโนมัติ
            </Button>
          </div>
          <Input
            inputMode="tel"
            autoComplete="tel"
            placeholder="เบอร์โทร"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <Input
            inputMode="numeric"
            autoComplete="current-password"
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </Button>
          <Button
            className="w-full"
            type="button"
            variant="outline"
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            สมัคร Messenger
          </Button>
        </form>
      )}
    </main>
  );
}
