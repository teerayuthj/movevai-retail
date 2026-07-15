import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, MapPin, Repeat2, Send, Timer, X, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import type { Driver, Order } from '@/data/orderTypes';
import { createDispatchJobs } from '@/features/dispatch/dispatchJobs';
import { formatDriverDispatchStatus } from '@/lib/deliveryExecution';
import { RouteStopsMap } from '@/features/dispatch/components/RouteStopsMap';
import {
  getRoutePickupTasks,
  stopsForSelectedPickupTasks,
} from '@/features/dispatch/routeTemplateStops';
import type {
  DispatchJobType,
  DispatchMethod,
  DispatchStartPolicy,
  DispatchCreationOutcome,
  RouteTemplate,
} from '@/features/dispatch/types';
import { dispatchJobTypeLabel } from '@/features/dispatch/types';
import { getNextHourTime, getTodayDateKey } from '@/lib/deliveryPlanning';
import { createRouteTemplateRun, fetchRouteTemplates } from '@/lib/retailApi';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  drivers: Driver[];
  orders: Order[];
  initialTemplateId?: string;
  onClose: () => void;
  onCreated: (outcome: DispatchCreationOutcome) => Promise<void> | void;
};

const SLA_OPTIONS = [5, 10, 15, 30];

export function QuickCreateDialog({
  open,
  drivers,
  orders,
  initialTemplateId,
  onClose,
  onCreated,
}: Props) {
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [mode, setMode] = useState<'single' | 'template'>('single');
  const [templateId, setTemplateId] = useState('');
  const [selectedPickupStopIds, setSelectedPickupStopIds] = useState<string[]>([]);
  const [jobType, setJobType] = useState<Exclude<DispatchJobType, 'order'>>('document');
  const [title, setTitle] = useState('ส่งเอกสาร');
  const [messengerTitle, setMessengerTitle] = useState('');
  const [pickupName, setPickupName] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [destinationPhone, setDestinationPhone] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [method, setMethod] = useState<DispatchMethod>('immediate');
  const [driverId, setDriverId] = useState('');
  const [plannedDate, setPlannedDate] = useState(getTodayDateKey());
  const [plannedTime, setPlannedTime] = useState(getNextHourTime());
  const [acceptWithinMinutes, setAcceptWithinMinutes] = useState(15);
  const [startWithinMinutes, setStartWithinMinutes] = useState(10);
  const [startPolicy, setStartPolicy] = useState<DispatchStartPolicy>('manual');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = templates.find((template) => template.id === templateId);
  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const templateTasks = useMemo(
    () => getRoutePickupTasks(selectedTemplate?.stops ?? []),
    [selectedTemplate],
  );
  const selectedTemplateStops = useMemo(
    () => stopsForSelectedPickupTasks(selectedTemplate?.stops ?? [], selectedPickupStopIds),
    [selectedPickupStopIds, selectedTemplate],
  );

  useEffect(() => {
    if (open) {
      void fetchRouteTemplates()
        .then((items) => setTemplates(items.filter((template) => template.active)))
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : 'โหลด Route Templates ไม่สำเร็จ'),
        );
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initialTemplateId && templates.some((template) => template.id === initialTemplateId)) {
      setMode('template');
      setTemplateId(initialTemplateId);
      setMethod('planning');
      return;
    }
    setMode('single');
    setTemplateId('');
  }, [initialTemplateId, open, templates]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setSelectedPickupStopIds([]);
    setTitle(selectedTemplate.name);
    setMessengerTitle('');
    setJobType(selectedTemplate.jobType);
    setDriverId(selectedTemplate.defaultDriverId ?? '');
    setPlannedTime(selectedTemplate.plannedTime ?? '');
    setAcceptWithinMinutes(selectedTemplate.acceptWithinMinutes);
    setStartWithinMinutes(selectedTemplate.startWithinMinutes);
    setStartPolicy(selectedTemplate.startPolicy);
  }, [selectedTemplate]);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) return toast.error('กรุณาระบุชื่องาน');
    if (mode === 'template' && !selectedTemplate) return toast.error('กรุณาเลือก Route Template');
    if (mode === 'template' && selectedPickupStopIds.length === 0)
      return toast.error('เลือกอย่างน้อย 1 คู่รับ → ส่งสำหรับเที่ยวนี้');
    if (mode === 'single' && (!pickupAddress.trim() || !destinationAddress.trim())) {
      return toast.error('กรุณาระบุจุดรับและจุดส่ง');
    }
    if (mode === 'single' && method === 'immediate' && !selectedDriver) {
      return toast.error('กรุณาเลือกคนขับ');
    }

    setSubmitting(true);
    try {
      if (mode === 'template' && selectedTemplate) {
        const result = await createRouteTemplateRun(selectedTemplate.id, {
          selectedPickupStopIds,
          plannedDate,
          driverId: driverId || undefined,
          dispatchMode: 'planning',
          messengerTitle: messengerTitle.trim() || undefined,
          note: note.trim() || undefined,
        });
        await onCreated({
          destination: 'planning',
          orderIds: result.orderIds,
          plannedDate: result.plannedDate,
        });
        toast.success(`สร้าง Route Run ของ ${selectedTemplate.name} เข้า Planning แล้ว`);
        onClose();
        return;
      }
      const result = await createDispatchJobs({
        mode,
        title,
        messengerTitle: messengerTitle.trim() || undefined,
        jobType,
        pickupName,
        pickupPhone,
        pickupAddress,
        destinationName,
        destinationPhone,
        destinationAddress,
        method,
        driver: selectedDriver,
        plannedDate,
        plannedTime,
        acceptWithinMinutes,
        startWithinMinutes,
        startPolicy,
        note,
      });
      await onCreated({
        destination: method === 'immediate' ? 'tracking' : 'planning',
        orderIds: result.orders.map((order) => order.id),
        plannedDate: method === 'planning' ? plannedDate : undefined,
      });
      toast.success(
        method === 'immediate'
          ? `สร้างงานและส่งให้ ${selectedDriver?.name ?? 'Messenger'} แล้ว`
          : 'สร้างงานเข้า Planning แล้ว',
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'สร้างงานไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="app-scroll max-h-[95dvh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border bg-background shadow-xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-background px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold">สร้างงานรับ–ส่ง</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              สร้างงานเดี่ยวหรือใช้ Route เดิม แล้วเลือกส่งทันทีหรือเข้า Planning
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={submitting}>
            <X className="h-4 w-4" />
            <span className="sr-only">ปิด</span>
          </Button>
        </div>

        <div className="grid gap-6 px-4 py-5 lg:grid-cols-[1fr_300px] lg:px-6">
          <div className="space-y-6">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">1. รูปแบบงาน</h3>
                <Badge variant="info">Quick Create</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    mode === 'single' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <MapPin className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-medium">งานเดี่ยว</span>
                    <span className="text-xs text-muted-foreground">กรอกจุดรับและจุดส่ง</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('template');
                    setMethod('planning');
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                    mode === 'template' ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                  )}
                >
                  <Repeat2 className="mt-0.5 h-4 w-4" />
                  <span>
                    <span className="block text-sm font-medium">ใช้ Route เดิม</span>
                    <span className="text-xs text-muted-foreground">
                      เลือกเฉพาะคู่รับ → ส่งที่ต้องวิ่งในเที่ยวนี้
                    </span>
                  </span>
                </button>
              </div>
            </section>

            {mode === 'template' && (
              <section>
                <label className="text-xs font-medium">Route Template</label>
                <Select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="mt-1"
                >
                  <option value="">เลือกเส้นทางประจำ</option>
                  {templates.map((template) => {
                    const pickups = template.stops.filter((stop) => stop.kind === 'pickup').length;
                    return (
                      <option key={template.id} value={template.id}>
                        {template.routeGroup} · {template.name} — {pickups} รับ ·{' '}
                        {template.stops.length - pickups} ส่ง
                      </option>
                    );
                  })}
                </Select>
                {templates.length === 0 && (
                  <p className="mt-2 text-xs text-warning">
                    ยังไม่มี Route Template — สร้างได้จากเมนูเส้นทางประจำ
                  </p>
                )}
              </section>
            )}

            <section>
              <h3 className="mb-2 text-sm font-semibold">2. รายละเอียดงาน</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium">
                  ประเภทงาน
                  <Select
                    value={jobType}
                    onChange={(event) => setJobType(event.target.value as typeof jobType)}
                    className="mt-1"
                    disabled={mode === 'template'}
                  >
                    {(['document', 'parcel', 'other'] as const).map((value) => (
                      <option key={value} value={value}>
                        {dispatchJobTypeLabel[value]}
                      </option>
                    ))}
                  </Select>
                </label>
                {mode === 'single' && (
                  <label className="text-xs font-medium">
                    ชื่องานภายใน
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      className="mt-1"
                      placeholder="เช่น รับเอกสารสัญญา"
                    />
                  </label>
                )}
                <label className="text-xs font-medium sm:col-span-2">
                  ชื่อที่แสดงบน Messenger{' '}
                  <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span>
                  <Input
                    value={messengerTitle}
                    onChange={(event) => setMessengerTitle(event.target.value)}
                    className="mt-1"
                    placeholder="เช่น รอบเอกสารสุขุมวิทเช้า"
                    maxLength={50}
                  />
                  <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                    เว้นว่างเพื่อไม่แสดงหัวเรื่องบน Card
                  </span>
                </label>
                {mode === 'single' && (
                  <>
                    <label className="text-xs font-medium">
                      ชื่อจุดรับ
                      <Input
                        value={pickupName}
                        onChange={(event) => setPickupName(event.target.value)}
                        className="mt-1"
                        placeholder="สำนักงานใหญ่"
                      />
                    </label>
                    <label className="text-xs font-medium">
                      เบอร์ติดต่อจุดรับ
                      <Input
                        value={pickupPhone}
                        onChange={(event) => setPickupPhone(event.target.value)}
                        className="mt-1"
                        placeholder="08x-xxx-xxxx"
                      />
                    </label>
                    <label className="text-xs font-medium sm:col-span-2">
                      ที่อยู่จุดรับ
                      <Input
                        value={pickupAddress}
                        onChange={(event) => setPickupAddress(event.target.value)}
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs font-medium">
                      ชื่อผู้รับ/จุดส่ง
                      <Input
                        value={destinationName}
                        onChange={(event) => setDestinationName(event.target.value)}
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs font-medium">
                      เบอร์ติดต่อจุดส่ง
                      <Input
                        value={destinationPhone}
                        onChange={(event) => setDestinationPhone(event.target.value)}
                        className="mt-1"
                      />
                    </label>
                    <label className="text-xs font-medium sm:col-span-2">
                      ที่อยู่จุดส่ง
                      <Input
                        value={destinationAddress}
                        onChange={(event) => setDestinationAddress(event.target.value)}
                        className="mt-1"
                      />
                    </label>
                  </>
                )}
              </div>
              {mode === 'template' && selectedTemplate && (
                <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-medium">เลือกงานของเที่ยวนี้</div>
                    <span className="text-[11px] text-info">
                      {selectedPickupStopIds.length}/{templateTasks.length} งาน
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    ระบบไม่เลือกทุกจุดให้อัตโนมัติ
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {templateTasks.map((task) => {
                      const checked = selectedPickupStopIds.includes(task.pickup.id);
                      return (
                        <label
                          key={task.pickup.id}
                          className={`flex cursor-pointer items-start gap-2 rounded-md border bg-background p-2 text-xs ${checked ? 'border-primary' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() =>
                              setSelectedPickupStopIds((current) =>
                                current.includes(task.pickup.id)
                                  ? current.filter((id) => id !== task.pickup.id)
                                  : [...current, task.pickup.id],
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-info">รับ {task.pickup.name}</span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-success">
                              <ArrowRight className="h-3 w-3 shrink-0" /> ส่ง {task.dropoff.name}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <RouteStopsMap stops={selectedTemplateStops} className="mt-3 h-48" />
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">3. การจัดส่งและคนขับ</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium">
                  วิธีดำเนินการ
                  <Select
                    value={method}
                    onChange={(event) => setMethod(event.target.value as DispatchMethod)}
                    className="mt-1"
                    disabled={mode === 'template'}
                  >
                    <option value="immediate">ส่งทันที</option>
                    <option value="planning">เข้า Planning</option>
                  </Select>
                </label>
                <label className="text-xs font-medium">
                  คนขับ
                  <Select
                    value={driverId}
                    onChange={(event) => setDriverId(event.target.value)}
                    className="mt-1"
                  >
                    <option value="">
                      {method === 'immediate' ? 'เลือกคนขับ' : 'เลือกภายหลัง'}
                    </option>
                    {drivers
                      .filter((driver) => driver.status !== 'off_duty')
                      .map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name} · {formatDriverDispatchStatus(driver, orders)}
                        </option>
                      ))}
                  </Select>
                </label>
                {method === 'planning' && (
                  <>
                    <label className="text-xs font-medium">
                      วันที่ส่ง
                      <DatePicker
                        value={plannedDate}
                        onChange={setPlannedDate}
                        className="mt-1 w-full"
                      />
                    </label>
                    <label className="text-xs font-medium">
                      เวลาออก
                      <TimePicker
                        value={plannedTime}
                        onChange={setPlannedTime}
                        className="mt-1 w-full"
                      />
                    </label>
                  </>
                )}
              </div>
            </section>

            {method === 'immediate' && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">4. SLA การเริ่มงาน</h3>
                  <Badge variant="warning">
                    <Timer className="h-3 w-3" /> ตั้งค่าได้
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-medium">
                    ต้องรับงานภายใน
                    <Select
                      value={acceptWithinMinutes}
                      onChange={(event) => setAcceptWithinMinutes(Number(event.target.value))}
                      className="mt-1"
                    >
                      {SLA_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value} นาที{value === 15 ? ' — ค่าเริ่มต้น' : ''}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-xs font-medium">
                    ต้องเริ่มภายใน
                    <Select
                      value={startWithinMinutes}
                      onChange={(event) => setStartWithinMinutes(Number(event.target.value))}
                      className="mt-1"
                    >
                      {SLA_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value} นาทีหลังรับ
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label className="text-xs font-medium sm:col-span-2">
                    วิธีเริ่มงาน
                    <Select
                      value={startPolicy}
                      onChange={(event) =>
                        setStartPolicy(event.target.value as DispatchStartPolicy)
                      }
                      className="mt-1"
                    >
                      <option value="manual">Messenger กดรับ แล้วกดเริ่มเอง</option>
                      <option value="accept_starts">กดรับแล้วเริ่มงานทันที</option>
                    </Select>
                  </label>
                </div>
              </section>
            )}

            <label className="block text-xs font-medium">
              หมายเหตุ
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-1"
                placeholder="ไม่บังคับ"
              />
            </label>
          </div>

          <aside className="h-fit rounded-xl border bg-muted/20 p-4 lg:sticky lg:top-24">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">สรุปก่อนสร้าง</h3>
              <Badge variant="outline">{mode === 'template' ? 'Route เดิม' : 'งานเดี่ยว'}</Badge>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{title || 'ยังไม่ได้ระบุชื่องาน'}</div>
                  <div className="text-xs text-muted-foreground">
                    {mode === 'template'
                      ? selectedTemplate
                        ? `${selectedTemplate.name} · ${selectedTemplate.stops.length} จุดแวะ`
                        : 'เลือกสายวิ่งประจำ'
                      : '1 จุดรับ → 1 จุดส่ง'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {mode === 'template' || method === 'planning' ? (
                  <CalendarClock className="mt-0.5 h-4 w-4 text-info" />
                ) : (
                  <Zap className="mt-0.5 h-4 w-4 text-warning" />
                )}
                <div>
                  <div className="font-medium">
                    {mode === 'template'
                      ? 'สร้าง Route Run เข้า Planning'
                      : method === 'immediate'
                        ? 'ส่งทันที'
                        : 'เข้า Planning'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedDriver ? `มอบหมายให้ ${selectedDriver.name}` : 'เลือกคนขับภายหลัง'}
                  </div>
                </div>
              </div>
              {method === 'immediate' && (
                <div className="flex gap-2">
                  <Timer className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="font-medium">รับภายใน {acceptWithinMinutes} นาที</div>
                    <div className="text-xs text-muted-foreground">
                      เริ่มภายใน {startWithinMinutes} นาทีหลังรับ
                    </div>
                  </div>
                </div>
              )}
            </div>
            <Button className="mt-5 w-full" onClick={() => void submit()} disabled={submitting}>
              <Send className="h-4 w-4" />
              {submitting
                ? 'กำลังสร้างงาน…'
                : mode === 'template'
                  ? 'สร้าง Route Run เข้า Planning'
                  : method === 'immediate'
                    ? 'สร้างและส่งให้คนขับ'
                    : 'สร้างเข้า Planning'}
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}
