import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  loginMessenger,
  registerMessengerDriver,
  type MessengerRegisterResult,
  type MessengerSession,
} from '@/lib/retailApi';
import type { Driver } from '@/data/mock';
import { resizeImageFileToDataUrl } from '@/lib/imageDataUrl';
import { cn } from '@/lib/utils';
import {
  Bike,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  IdCard,
  KeyRound,
  Loader2,
  Phone,
  ShieldCheck,
  Truck,
  UserPlus,
} from 'lucide-react';

const TEST_ACCOUNTS = [
  {
    label: 'ตัวอย่าง 1',
    driverCode: 'D-02',
    name: 'ณัฐพล ธนะวิชัย',
    phone: '0891112233',
    pin: '123456',
  },
  {
    label: 'ตัวอย่าง 2',
    driverCode: 'D-03',
    name: 'อรทัย วงศ์ไทย',
    phone: '0825567788',
    pin: '123456',
  },
] as const;
const PENDING_REGISTRATION_KEY = 'movevai:messenger-pending-registration';

type LoginMode = 'login' | 'register' | 'pending';
type RegisterStepId = 'personal' | 'vehicle' | 'photos' | 'security';

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

const registerSteps: Array<{
  id: RegisterStepId;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: 'personal',
    label: 'ข้อมูล',
    title: 'ข้อมูลติดต่อ',
    description: 'ระบุชื่อและเบอร์โทรสำหรับบัญชี Messenger',
  },
  {
    id: 'vehicle',
    label: 'รถ',
    title: 'รถและเอกสาร',
    description: 'เลือกยานพาหนะและกรอกเลขเอกสารสำคัญ',
  },
  {
    id: 'photos',
    label: 'รูป',
    title: 'รูปประกอบ',
    description: 'แนบรูปโปรไฟล์และรูปบัตรประชาชน',
  },
  {
    id: 'security',
    label: 'PIN',
    title: 'ตั้ง PIN',
    description: 'ตรวจสอบข้อมูลและตั้งรหัสเข้าใช้งาน',
  },
];

const vehicleIcon: Record<Driver['vehicle'], React.ReactNode> = {
  motorcycle: <Bike className="h-4 w-4" />,
  van: <Truck className="h-4 w-4" />,
  pickup: <Truck className="h-4 w-4" />,
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
  const inputId = useId();
  const [loading, setLoading] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    setLoading(true);
    try {
      onChange(await resizeImageFileToDataUrl(file));
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
        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={inputId}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <label
            htmlFor={inputId}
            className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Camera className="h-4 w-4" />
            {value ? 'เปลี่ยนรูป' : 'ถ่าย/เลือกรูป'}
          </label>
          <p className="text-xs text-muted-foreground">
            {value ? 'แนบรูปแล้ว' : 'ใช้กล้องหรือเลือกรูปจากเครื่อง'}
          </p>
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
  const [pending, setPending] = useState<PendingRegistration | null>(() =>
    loadPendingRegistration(),
  );
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [registerForm, setRegisterForm] = useState<RegisterForm>(emptyRegisterForm);
  const [registerStep, setRegisterStep] = useState<RegisterStepId>('personal');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const registerStepComplete = useMemo<Record<RegisterStepId, boolean>>(
    () => ({
      personal: Boolean(registerForm.name.trim() && registerForm.phone.trim()),
      vehicle: Boolean(registerForm.licensePlate.trim() && registerForm.idCardNumber.trim()),
      photos: Boolean(registerForm.profilePhotoDataUrl && registerForm.idCardPhotoDataUrl),
      security: Boolean(
        registerForm.pin.trim() &&
        registerForm.confirmPin.trim() &&
        registerForm.pin === registerForm.confirmPin,
      ),
    }),
    [registerForm],
  );
  const canSubmitRegister = registerSteps.every((step) => registerStepComplete[step.id]);
  const registerStepIndex = registerSteps.findIndex((step) => step.id === registerStep);
  const currentRegisterStep = registerSteps[registerStepIndex] ?? registerSteps[0];
  const isLastRegisterStep = registerStepIndex === registerSteps.length - 1;
  const registerProgress = ((registerStepIndex + 1) / registerSteps.length) * 100;

  function goToRegisterStep(stepIndex: number) {
    setRegisterStep(registerSteps[Math.max(0, Math.min(stepIndex, registerSteps.length - 1))].id);
    setError('');
  }

  function goNextRegisterStep() {
    if (!registerStepComplete[registerStep]) return;
    goToRegisterStep(registerStepIndex + 1);
  }

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
      setRegisterStep('personal');
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
            if (isLastRegisterStep) {
              void submitRegister();
            } else {
              goNextRegisterStep();
            }
          }}
        >
          <div>
            <h1 className="text-xl font-semibold">สมัคร Messenger</h1>
            <p className="text-sm text-muted-foreground">
              กรอกข้อมูลและรอ admin อนุมัติก่อนเริ่มรับงาน
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs font-medium">
              {registerSteps.map((step, index) => {
                const active = step.id === registerStep;
                const complete = registerStepComplete[step.id];
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={cn(
                      'flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors',
                      active && 'bg-primary/10 text-primary',
                      complete && !active && 'text-foreground',
                    )}
                    onClick={() => {
                      if (
                        index <= registerStepIndex ||
                        registerSteps.slice(0, index).every((item) => registerStepComplete[item.id])
                      ) {
                        goToRegisterStep(index);
                      }
                    }}
                    aria-current={active ? 'step' : undefined}
                  >
                    {complete ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px]">
                        {index + 1}
                      </span>
                    )}
                    <span className="truncate">{step.label}</span>
                  </button>
                );
              })}
            </div>
            <Progress value={registerProgress} />
          </div>

          <section className="min-h-[360px] space-y-4">
            <div className="flex items-start gap-3 rounded-md bg-muted/50 p-3">
              <div className="rounded-md bg-background p-2 text-primary shadow-xs">
                {registerStep === 'personal' ? (
                  <Phone className="h-4 w-4" />
                ) : registerStep === 'vehicle' ? (
                  <IdCard className="h-4 w-4" />
                ) : registerStep === 'photos' ? (
                  <Camera className="h-4 w-4" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{currentRegisterStep.title}</h2>
                <p className="text-sm text-muted-foreground">{currentRegisterStep.description}</p>
              </div>
            </div>

            {registerStep === 'personal' && (
              <div className="space-y-3">
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
              </div>
            )}

            {registerStep === 'vehicle' && (
              <div className="space-y-3">
                <Field label="ยานพาหนะ">
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(vehicleLabel).map(([value, label]) => {
                      const selected = registerForm.vehicle === value;
                      return (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          className={cn(
                            'h-auto min-h-16 flex-col whitespace-normal px-2 py-2',
                            selected &&
                              'border-primary bg-primary/10 text-primary hover:bg-primary/10',
                          )}
                          aria-pressed={selected}
                          onClick={() =>
                            setRegisterForm((current) => ({
                              ...current,
                              vehicle: value as Driver['vehicle'],
                            }))
                          }
                        >
                          {vehicleIcon[value as Driver['vehicle']]}
                          <span className="text-xs leading-tight">{label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="ทะเบียนรถ">
                  <Input
                    value={registerForm.licensePlate}
                    onChange={(event) =>
                      setRegisterForm((current) => ({
                        ...current,
                        licensePlate: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
                <Field label="เลขบัตรประชาชน">
                  <Input
                    inputMode="numeric"
                    value={registerForm.idCardNumber}
                    onChange={(event) =>
                      setRegisterForm((current) => ({
                        ...current,
                        idCardNumber: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
              </div>
            )}

            {registerStep === 'photos' && (
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
            )}

            {registerStep === 'security' && (
              <div className="space-y-3">
                <div className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    ตรวจสอบก่อนส่งใบสมัคร
                  </div>
                  <div className="grid gap-1 text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <span>ชื่อ</span>
                      <span className="truncate text-foreground">{registerForm.name || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>เบอร์โทร</span>
                      <span className="truncate text-foreground">{registerForm.phone || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>ยานพาหนะ</span>
                      <span className="text-foreground">{vehicleLabel[registerForm.vehicle]}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>ทะเบียนรถ</span>
                      <span className="truncate text-foreground">
                        {registerForm.licensePlate || '-'}
                      </span>
                    </div>
                  </div>
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
                      setRegisterForm((current) => ({
                        ...current,
                        confirmPin: event.target.value,
                      }))
                    }
                    required
                  />
                </Field>
                {registerForm.confirmPin && registerForm.pin !== registerForm.confirmPin && (
                  <p className="text-sm text-destructive">PIN สองช่องไม่ตรงกัน</p>
                )}
              </div>
            )}
          </section>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => {
                if (registerStepIndex === 0) {
                  setMode('login');
                  setError('');
                } else {
                  goToRegisterStep(registerStepIndex - 1);
                }
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              {registerStepIndex === 0 ? 'เข้าสู่ระบบ' : 'ย้อนกลับ'}
            </Button>
            {isLastRegisterStep ? (
              <Button type="submit" disabled={loading || !canSubmitRegister}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                ส่งใบสมัคร
              </Button>
            ) : (
              <Button type="submit" disabled={loading || !registerStepComplete[registerStep]}>
                ถัดไป
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
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
            <p className="text-sm text-muted-foreground">ใช้เบอร์โทรและ PIN หรือสมัครบัญชีใหม่</p>
          </div>
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium text-warning-foreground">โหมดทดสอบ — เลือกบัญชีตัวอย่าง</p>
            <div className="space-y-2">
              {TEST_ACCOUNTS.map((account) => (
                <div key={account.driverCode} className="rounded-md border bg-background/80 p-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium text-foreground">
                        {account.label} · {account.name}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {account.driverCode}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setPhone(account.phone);
                        setPin(account.pin);
                      }}
                    >
                      กรอกอัตโนมัติ
                    </Button>
                  </div>
                  <div className="mt-2 grid gap-1 text-muted-foreground">
                    <p>
                      เบอร์โทร:{' '}
                      <span className="font-mono font-semibold text-foreground">
                        {account.phone}
                      </span>
                    </p>
                    <p>
                      PIN:{' '}
                      <span className="font-mono font-semibold text-foreground">{account.pin}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
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
