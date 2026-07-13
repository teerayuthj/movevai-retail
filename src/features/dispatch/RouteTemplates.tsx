import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Clock3,
  MapPin,
  Pencil,
  Play,
  Plus,
  Repeat2,
  Timer,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Driver } from '@/data/orderTypes';
import { createTemplateRun } from '@/features/dispatch/dispatchJobs';
import {
  deleteRouteTemplate,
  loadRouteTemplates,
  markTemplateGenerated,
  upsertRouteTemplate,
} from '@/features/dispatch/routeTemplateStorage';
import type {
  DispatchStartPolicy,
  RouteTemplate,
  RouteTemplateStop,
} from '@/features/dispatch/types';
import { getTodayDateKey } from '@/lib/deliveryPlanning';
import { useRetailStore } from '@/state/retailStore';

type Props = {
  onOpenDispatch: (search?: string) => void;
};

const WEEKDAYS = [
  { value: 1, label: 'จ' },
  { value: 2, label: 'อ' },
  { value: 3, label: 'พ' },
  { value: 4, label: 'พฤ' },
  { value: 5, label: 'ศ' },
  { value: 6, label: 'ส' },
  { value: 0, label: 'อา' },
];

function newStop(): RouteTemplateStop {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    name: '',
    phone: '',
    address: '',
  };
}

function weekdayLabel(days: number[]) {
  if ([1, 2, 3, 4, 5].every((day) => days.includes(day)) && days.length === 5) return 'จ–ศ';
  return WEEKDAYS.filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(', ');
}

function TemplateDialog({
  open,
  template,
  drivers,
  onClose,
  onSave,
}: {
  open: boolean;
  template: RouteTemplate | null;
  drivers: Driver[];
  onClose: () => void;
  onSave: (template: RouteTemplate) => void;
}) {
  const [name, setName] = useState('');
  const [jobType, setJobType] = useState<'document' | 'parcel' | 'other'>('document');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [plannedTime, setPlannedTime] = useState('16:30');
  const [defaultDriverId, setDefaultDriverId] = useState('');
  const [acceptWithinMinutes, setAcceptWithinMinutes] = useState(15);
  const [startWithinMinutes, setStartWithinMinutes] = useState(10);
  const [startPolicy, setStartPolicy] = useState<DispatchStartPolicy>('manual');
  const [autoCreate, setAutoCreate] = useState(true);
  const [stops, setStops] = useState<RouteTemplateStop[]>([newStop(), newStop()]);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setJobType(template?.jobType ?? 'document');
    setWeekdays(template?.weekdays ?? [1, 2, 3, 4, 5]);
    setPlannedTime(template?.plannedTime ?? '16:30');
    setDefaultDriverId(template?.defaultDriverId ?? '');
    setAcceptWithinMinutes(template?.acceptWithinMinutes ?? 15);
    setStartWithinMinutes(template?.startWithinMinutes ?? 10);
    setStartPolicy(template?.startPolicy ?? 'manual');
    setAutoCreate(template?.autoCreate ?? true);
    setStops(template?.stops?.length ? template.stops : [newStop(), newStop()]);
  }, [open, template]);

  if (!open) return null;

  const save = () => {
    if (!name.trim()) return toast.error('กรุณาระบุชื่อ Route');
    if (weekdays.length === 0) return toast.error('กรุณาเลือกวันที่ต้องวิ่ง');
    if (stops.length < 2 || stops.some((stop) => !stop.name.trim() || !stop.address.trim())) {
      return toast.error('กรุณาระบุอย่างน้อย 2 จุด และกรอกชื่อกับที่อยู่ให้ครบ');
    }
    const now = new Date().toISOString();
    onSave({
      id: template?.id ?? (crypto.randomUUID ? crypto.randomUUID() : `rt-${Date.now()}`),
      name: name.trim(),
      active: template?.active ?? true,
      autoCreate,
      weekdays,
      plannedTime,
      defaultDriverId: defaultDriverId || undefined,
      jobType,
      acceptWithinMinutes,
      startWithinMinutes,
      startPolicy,
      stops: stops.map((stop) => ({
        ...stop,
        name: stop.name.trim(),
        phone: stop.phone?.trim() || undefined,
        address: stop.address.trim(),
      })),
      generatedDateKeys: template?.generatedDateKeys ?? [],
      createdAt: template?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="app-scroll max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border bg-background shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              {template ? 'แก้ Route Template' : 'สร้าง Route Template'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              กำหนดวัน เวลา จุดแวะ คนขับ และ SLA เริ่มงาน
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">ปิด</span>
          </Button>
        </div>
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              ชื่อ Route
              <Input
                className="mt-1"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="เช่น รอบเอกสารเย็น"
              />
            </label>
            <label className="text-xs font-medium">
              ประเภทงาน
              <Select
                className="mt-1"
                value={jobType}
                onChange={(event) => setJobType(event.target.value as typeof jobType)}
              >
                <option value="document">เอกสาร</option>
                <option value="parcel">พัสดุ</option>
                <option value="other">งานอื่น ๆ</option>
              </Select>
            </label>
            <label className="text-xs font-medium">
              เวลาออก
              <Input
                type="time"
                className="mt-1"
                value={plannedTime}
                onChange={(event) => setPlannedTime(event.target.value)}
              />
            </label>
            <label className="text-xs font-medium">
              คนขับประจำ
              <Select
                className="mt-1"
                value={defaultDriverId}
                onChange={(event) => setDefaultDriverId(event.target.value)}
              >
                <option value="">เลือกตอนจัดรอบ</option>
                {drivers
                  .filter((driver) => driver.status !== 'off_duty')
                  .map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
              </Select>
            </label>
          </div>
          <div>
            <div className="text-xs font-medium">วันที่ต้องวิ่ง</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <label
                  key={day.value}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={weekdays.includes(day.value)}
                    onChange={() =>
                      setWeekdays((current) =>
                        current.includes(day.value)
                          ? current.filter((value) => value !== day.value)
                          : [...current, day.value],
                      )
                    }
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">จุดแวะใน Route</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setStops((current) => [...current, newStop()])}
              >
                <Plus className="h-3.5 w-3.5" /> เพิ่มจุด
              </Button>
            </div>
            <div className="space-y-3">
              {stops.map((stop, index) => (
                <div
                  key={stop.id}
                  className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[32px_1fr_1fr_36px]"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {index + 1}
                  </div>
                  <Input
                    value={stop.name}
                    onChange={(event) =>
                      setStops((current) =>
                        current.map((item) =>
                          item.id === stop.id ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="ชื่อจุด/ผู้ติดต่อ"
                  />
                  <Input
                    value={stop.address}
                    onChange={(event) =>
                      setStops((current) =>
                        current.map((item) =>
                          item.id === stop.id ? { ...item, address: event.target.value } : item,
                        ),
                      )
                    }
                    placeholder="ที่อยู่"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={stops.length <= 2}
                    onClick={() =>
                      setStops((current) => current.filter((item) => item.id !== stop.id))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">ลบจุด</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium">
              ต้องรับงานภายใน
              <Select
                className="mt-1"
                value={acceptWithinMinutes}
                onChange={(event) => setAcceptWithinMinutes(Number(event.target.value))}
              >
                {[5, 10, 15, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} นาที
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium">
              ต้องเริ่มภายใน
              <Select
                className="mt-1"
                value={startWithinMinutes}
                onChange={(event) => setStartWithinMinutes(Number(event.target.value))}
              >
                {[5, 10, 15, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} นาทีหลังรับ
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-xs font-medium sm:col-span-2">
              วิธีเริ่มงาน
              <Select
                className="mt-1"
                value={startPolicy}
                onChange={(event) => setStartPolicy(event.target.value as DispatchStartPolicy)}
              >
                <option value="manual">Messenger กดรับ แล้วกดเริ่มเอง</option>
                <option value="accept_starts">กดรับแล้วเริ่มทันที</option>
              </Select>
            </label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3">
            <input
              type="checkbox"
              checked={autoCreate}
              onChange={(event) => setAutoCreate(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">สร้าง Route Run อัตโนมัติ</span>
              <span className="text-xs text-muted-foreground">
                เมื่อเปิด Dispatch Board ในวันที่ตรงกับตาราง ระบบสร้างงานเข้า Planning
                วันละหนึ่งครั้ง
              </span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button onClick={save}>บันทึก Route Template</Button>
        </div>
      </div>
    </div>
  );
}

export function RouteTemplates({ onOpenDispatch }: Props) {
  const { drivers, syncFromBackend } = useRetailStore();
  const [templates, setTemplates] = useState<RouteTemplate[]>(loadRouteTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(templates[0]?.id ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RouteTemplate | null>(null);
  const [creatingRunId, setCreatingRunId] = useState<string | null>(null);
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;

  const saveTemplate = (template: RouteTemplate) => {
    const next = upsertRouteTemplate(template);
    setTemplates(next);
    setSelectedId(template.id);
    setDialogOpen(false);
    toast.success('บันทึก Route Template แล้ว');
  };

  const createRun = async (template: RouteTemplate) => {
    setCreatingRunId(template.id);
    try {
      const driver = drivers.find((item) => item.id === template.defaultDriverId);
      await createTemplateRun(template, driver);
      markTemplateGenerated(template.id, getTodayDateKey());
      setTemplates(loadRouteTemplates());
      await syncFromBackend();
      toast.success(`สร้างเที่ยว ${template.name} เข้า Planning แล้ว`);
      onOpenDispatch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'สร้าง Route Run ไม่สำเร็จ');
    } finally {
      setCreatingRunId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Route Templates — เส้นทางประจำ</h1>
          <p className="text-sm text-muted-foreground">
            กำหนดตาราง จุดแวะ คนขับประจำ และสร้าง Route Run เข้าสู่ Dispatch Board
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> สร้าง Route
        </Button>
      </div>
      {templates.length === 0 ? (
        <Card className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
          <Repeat2 className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">ยังไม่มีเส้นทางประจำ</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            สร้างแม่แบบครั้งเดียว แล้วนำกลับมาใช้เพื่อสร้างงานหลายจุดพร้อมคนขับและ SLA เดิมได้
          </p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> สร้าง Route แรก
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-semibold">เส้นทางที่ใช้งาน</h2>
              <Badge variant="secondary">
                {templates.filter((template) => template.active).length}
              </Badge>
            </div>
            {templates.map((template) => (
              <button
                type="button"
                key={template.id}
                onClick={() => setSelectedId(template.id)}
                className={`w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${selected?.id === template.id ? 'bg-primary/5' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{template.name}</span>
                  {template.autoCreate && <Badge variant="outline">Auto</Badge>}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {weekdayLabel(template.weekdays)} · {template.plannedTime} ·{' '}
                  {template.stops.length} จุด
                </div>
              </button>
            ))}
          </Card>
          {selected && (
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                    <Badge variant={selected.active ? 'success' : 'secondary'}>
                      {selected.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {selected.id.slice(0, 12)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(selected);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> แก้ไข
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (!window.confirm(`ลบ Route ${selected.name}?`)) return;
                      const next = deleteRouteTemplate(selected.id);
                      setTemplates(next);
                      setSelectedId(next[0]?.id ?? null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">ลบ</span>
                  </Button>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" /> ตาราง
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {weekdayLabel(selected.weekdays)} · {selected.plannedTime}
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound className="h-3.5 w-3.5" /> คนขับประจำ
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    {drivers.find((driver) => driver.id === selected.defaultDriverId)?.name ??
                      'เลือกตอนจัดรอบ'}
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Timer className="h-3.5 w-3.5" /> SLA
                  </div>
                  <div className="mt-1 text-sm font-medium">
                    รับ {selected.acceptWithinMinutes} · เริ่ม {selected.startWithinMinutes} นาที
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <h3 className="text-sm font-semibold">จุดแวะ</h3>
                <div className="mt-3 space-y-0">
                  {selected.stops.map((stop, index) => (
                    <div key={stop.id} className="relative flex gap-3 pb-5 last:pb-0">
                      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-medium">
                        {index + 1}
                      </div>
                      {index < selected.stops.length - 1 && (
                        <div className="absolute bottom-0 left-3.5 top-7 w-px bg-border" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{stop.name}</div>
                        <div className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                          {stop.address}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock3 className="h-4 w-4" /> เที่ยววันนี้
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selected.generatedDateKeys?.includes(getTodayDateKey())
                      ? 'สร้าง Route Run ของวันนี้แล้ว'
                      : 'ยังไม่ได้สร้าง Route Run ของวันนี้'}
                  </p>
                </div>
                <Button
                  disabled={
                    creatingRunId === selected.id ||
                    selected.generatedDateKeys?.includes(getTodayDateKey())
                  }
                  onClick={() => void createRun(selected)}
                >
                  <Play className="h-4 w-4" />
                  {creatingRunId === selected.id ? 'กำลังสร้าง…' : 'สร้างเที่ยววันนี้'}
                </Button>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() =>
                    onOpenDispatch(`?quick=1&template=${encodeURIComponent(selected.id)}`)
                  }
                >
                  <Repeat2 className="h-4 w-4" /> ใช้ Route นี้สร้างงานด่วน
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
      <TemplateDialog
        open={dialogOpen}
        template={editing}
        drivers={drivers}
        onClose={() => setDialogOpen(false)}
        onSave={saveTemplate}
      />
    </div>
  );
}
