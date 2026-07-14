import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  CirclePlus,
  GripVertical,
  MapPinned,
  PackagePlus,
  RotateCcw,
  Route,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RouteStopsMap } from '@/features/dispatch/components/RouteStopsMap';
import { getRoutePickupTasks } from '@/features/dispatch/routeTemplateStops';
import type { RouteStop, RouteTemplate } from '@/features/dispatch/types';

type LibraryJob = {
  id: string;
  label: string;
  source: string;
  pickup: RouteStop;
  dropoff: RouteStop;
};

type BuilderStop = RouteStop & {
  sourceJobId: string;
  jobLabel: string;
};

const SILOM_JOB: LibraryJob = {
  id: 'preview-silom-wangburapha',
  label: 'งาน 1 · สีลม → วังบูรพา',
  source: 'ที่อยู่ที่กำหนดสำหรับเที่ยวนี้',
  pickup: {
    id: 'preview-silom-pickup',
    kind: 'pickup',
    name: 'สีลมคอมเพล็กซ์',
    address: '191 ถนนสีลม แขวงสีลม เขตบางรัก กรุงเทพฯ 10500',
    lat: 13.72831,
    lng: 100.53517,
    deliverToStopId: 'preview-wangburapha-dropoff',
  },
  dropoff: {
    id: 'preview-wangburapha-dropoff',
    kind: 'dropoff',
    name: 'ร้านทองออสสิริส สาขาวังบูรพา',
    address: '857 ถนนมหาไชย แขวงวังบูรพาภิรมย์ เขตพระนคร กรุงเทพฯ 10200 (ติดร้านบ้านช่างทอง)',
    lat: 13.74442,
    lng: 100.50117,
  },
};

const NEARBY_JOB: LibraryJob = {
  id: 'preview-nearby-task-2',
  label: 'งาน 2 · ตัวอย่างงานระหว่างทาง',
  source: 'ตัวอย่างสำหรับทดลองแทรกงานใกล้เคียง',
  pickup: {
    id: 'preview-nearby-pickup',
    kind: 'pickup',
    name: 'ไปรษณีย์กลาง บางรัก',
    address: '1160 ถนนเจริญกรุง แขวงบางรัก เขตบางรัก กรุงเทพฯ 10500',
    lat: 13.72769,
    lng: 100.51412,
    deliverToStopId: 'preview-nearby-dropoff',
  },
  dropoff: {
    id: 'preview-nearby-dropoff',
    kind: 'dropoff',
    name: 'ดิโอลด์สยาม พลาซ่า',
    address: '12 ถนนตรีเพชร แขวงวังบูรพาภิรมย์ เขตพระนคร กรุงเทพฯ 10200',
    lat: 13.74486,
    lng: 100.49963,
  },
};

function jobStops(job: LibraryJob): BuilderStop[] {
  return [
    { ...job.pickup, sourceJobId: job.id, jobLabel: job.label },
    { ...job.dropoff, sourceJobId: job.id, jobLabel: job.label },
  ];
}

function templateJobs(templates: RouteTemplate[]): LibraryJob[] {
  return templates.flatMap((template) =>
    getRoutePickupTasks(template.stops).map((task, index) => ({
      id: `template:${template.id}:${task.pickup.id}`,
      label: `${template.name} · งาน ${index + 1}`,
      source: `จากแม่แบบ ${template.routeGroup}`,
      pickup: {
        ...task.pickup,
        id: `builder:${template.id}:${task.pickup.id}`,
        deliverToStopId: `builder:${template.id}:${task.dropoff.id}`,
      },
      dropoff: { ...task.dropoff, id: `builder:${template.id}:${task.dropoff.id}` },
    })),
  );
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= items.length)
    return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function FreeRouteBuilderPreview({ templates }: { templates: RouteTemplate[] }) {
  const jobs = useMemo(
    () => [SILOM_JOB, NEARBY_JOB, ...templateJobs(templates).slice(0, 8)],
    [templates],
  );
  const [stops, setStops] = useState<BuilderStop[]>(() => jobStops(SILOM_JOB));
  const [dropActive, setDropActive] = useState(false);
  const usedJobIds = useMemo(() => new Set(stops.map((stop) => stop.sourceJobId)), [stops]);

  const addJob = (jobId: string) => {
    const job = jobs.find((entry) => entry.id === jobId);
    if (!job || usedJobIds.has(jobId)) return;
    setStops((current) => [...current, ...jobStops(job)]);
  };

  const removeJob = (jobId: string) => {
    setStops((current) => current.filter((stop) => stop.sourceJobId !== jobId));
  };

  const moveStop = (stopId: string, direction: -1 | 1) => {
    setStops((current) => {
      const index = current.findIndex((stop) => stop.id === stopId);
      return moveItem(current, index, index + direction);
    });
  };

  const moveStopBefore = (draggedId: string, targetId: string) => {
    setStops((current) => {
      const from = current.findIndex((stop) => stop.id === draggedId);
      const target = current.findIndex((stop) => stop.id === targetId);
      if (from < 0 || target < 0 || from === target) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      const insertAt = from < target ? target - 1 : target;
      next.splice(insertAt, 0, moved);
      return next;
    });
  };

  const moveStopToEnd = (stopId: string) => {
    setStops((current) => {
      const from = current.findIndex((stop) => stop.id === stopId);
      if (from < 0 || from === current.length - 1) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.push(moved);
      return next;
    });
  };

  const invalidPairs = useMemo(() => {
    const indexById = new Map(stops.map((stop, index) => [stop.id, index]));
    return stops.filter(
      (stop) =>
        stop.kind === 'pickup' &&
        (!stop.deliverToStopId ||
          (indexById.get(stop.deliverToStopId) ?? -1) <= (indexById.get(stop.id) ?? -1)),
    );
  }, [stops]);

  const dropJob = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    addJob(event.dataTransfer.getData('application/x-movevai-route-job'));
  };

  return (
    <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
      <div className="border-b bg-linear-to-r from-primary/8 via-background to-info/8 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Route Builder — จัดเที่ยววิ่งอิสระ</h2>
              <Badge className="border-info/30 bg-info/10 text-info" variant="outline">
                Interactive preview
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              ไม่ต้องเลือกสายก่อน — ลาก “งานรับ → ส่ง” จากคลังซ้ายมาวาง
              แล้วสลับลำดับจุดให้เข้ากับถนนและงานใกล้เคียงได้ทันที
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setStops(jobStops(SILOM_JOB))}>
            <RotateCcw className="h-3.5 w-3.5" /> เริ่มตัวอย่างใหม่
          </Button>
        </div>
      </div>

      <div className="grid min-h-[560px] xl:grid-cols-[300px_minmax(360px,0.9fr)_minmax(380px,1.1fr)]">
        <div className="border-b bg-muted/15 p-4 xl:border-r xl:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">1. คลังงานและที่อยู่</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                หยิบงานไหนก็ได้ ไม่ต้องเปิดสาย
              </div>
            </div>
            <Badge variant="secondary">{jobs.length} งาน</Badge>
          </div>
          <div className="app-scroll mt-3 max-h-[470px] space-y-2 overflow-y-auto pr-1">
            {jobs.map((job) => {
              const used = usedJobIds.has(job.id);
              return (
                <article
                  key={job.id}
                  draggable={!used}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy';
                    event.dataTransfer.setData('application/x-movevai-route-job', job.id);
                  }}
                  className={`group rounded-xl border bg-background p-3 transition ${
                    used
                      ? 'border-success/25 bg-success/5'
                      : 'cursor-grab hover:border-primary/40 hover:shadow-sm active:cursor-grabbing'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold">{job.label}</div>
                          <div className="text-[10px] text-muted-foreground">{job.source}</div>
                        </div>
                        {used && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex gap-2 text-[11px]">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-info text-[9px] font-bold text-white">
                            A
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-info">รับ · {job.pickup.name}</div>
                            <div className="line-clamp-2 text-muted-foreground">
                              {job.pickup.address}
                            </div>
                          </div>
                        </div>
                        <div className="ml-1.5 h-2 border-l border-dashed border-muted-foreground/40" />
                        <div className="flex gap-2 text-[11px]">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success text-[9px] font-bold text-white">
                            B
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-success">ส่ง · {job.dropoff.name}</div>
                            <div className="line-clamp-2 text-muted-foreground">
                              {job.dropoff.address}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 w-full text-[11px]"
                        disabled={used}
                        onClick={() => addJob(job.id)}
                      >
                        {used ? (
                          <>อยู่ในเที่ยวนี้แล้ว</>
                        ) : (
                          <>
                            <CirclePlus className="h-3.5 w-3.5" /> เพิ่มเข้าเที่ยว
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div
          className={`border-b p-4 transition-colors xl:border-r xl:border-b-0 ${dropActive ? 'bg-primary/5' : ''}`}
          onDragEnter={(event) => {
            if (event.dataTransfer.types.includes('application/x-movevai-route-job'))
              setDropActive(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('application/x-movevai-route-job')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDropActive(false);
          }}
          onDrop={dropJob}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">2. ลำดับเที่ยวนี้</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                ลากจุดขึ้น–ลงเพื่อแทรกงานที่ 2
              </div>
            </div>
            <Badge variant="outline">{stops.length} จุด</Badge>
          </div>

          {stops.length === 0 ? (
            <div className="mt-3 flex min-h-96 flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/20 px-6 text-center">
              <PackagePlus className="h-8 w-8 text-muted-foreground/50" />
              <div className="mt-2 text-sm font-medium">ลากงานจากคลังมาวางตรงนี้</div>
              <div className="mt-1 text-xs text-muted-foreground">
                ระบบจะสร้างจุดรับ A และจุดส่ง B ให้เป็นคู่เดียวกัน
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {stops.map((stop, index) => (
                <div
                  key={stop.id}
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-movevai-route-stop', stop.id);
                  }}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes('application/x-movevai-route-stop'))
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    const draggedId = event.dataTransfer.getData(
                      'application/x-movevai-route-stop',
                    );
                    if (!draggedId) return;
                    event.preventDefault();
                    event.stopPropagation();
                    moveStopBefore(draggedId, stop.id);
                  }}
                  className="group flex items-start gap-2 rounded-xl border bg-background p-2.5 shadow-xs hover:border-primary/30"
                >
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${stop.kind === 'pickup' ? 'bg-info' : 'bg-success'}`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className={
                          stop.kind === 'pickup'
                            ? 'border-info/30 text-info'
                            : 'border-success/30 text-success'
                        }
                      >
                        {stop.kind === 'pickup' ? 'รับของ' : 'ส่งของ'}
                      </Badge>
                      <span className="text-xs font-semibold">{stop.name}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {stop.address}
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground/80">{stop.jobLabel}</div>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === 0}
                      onClick={() => moveStop(stop.id, -1)}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                      <span className="sr-only">เลื่อนขึ้น</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={index === stops.length - 1}
                      onClick={() => moveStop(stop.id, 1)}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      <span className="sr-only">เลื่อนลง</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeJob(stop.sourceJobId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">นำงานคู่นี้ออก</span>
                    </Button>
                  </div>
                </div>
              ))}
              <div
                className="rounded-lg border border-dashed px-3 py-2 text-center text-[10px] text-muted-foreground"
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes('application/x-movevai-route-stop'))
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onDrop={(event) => {
                  const stopId = event.dataTransfer.getData('application/x-movevai-route-stop');
                  if (!stopId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  moveStopToEnd(stopId);
                }}
              >
                วางที่นี่เพื่อย้ายไปท้ายเที่ยว
              </div>
            </div>
          )}

          {invalidPairs.length > 0 ? (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning/8 px-3 py-2 text-[11px] text-warning">
              จุดส่งต้องอยู่หลังจุดรับของงานเดียวกัน — ขณะนี้มี {invalidPairs.length}{' '}
              งานที่ต้องจัดลำดับใหม่
            </div>
          ) : stops.length > 0 ? (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> ลำดับรับก่อนส่งถูกต้อง พร้อมคำนวณเส้นทาง
            </div>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <MapPinned className="h-4 w-4" /> 3. เส้นทางบนถนนจริง
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                แผนที่จะคำนวณใหม่ตามลำดับที่ลาก
              </div>
            </div>
            <Badge className="gap-1" variant="secondary">
              <Route className="h-3 w-3" /> {new Set(stops.map((stop) => stop.sourceJobId)).size}{' '}
              งาน
            </Badge>
          </div>
          <RouteStopsMap stops={stops} className="mt-3 h-[420px]" />
          <div className="mt-3 rounded-xl border bg-muted/20 p-3">
            <div className="text-xs font-medium">ภาพรวมเที่ยวที่เข้าใจ</div>
            <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-info text-[10px] font-semibold text-white">
                1
              </span>
              <span>เริ่มที่จุดรับแรกตามลำดับ ไม่ได้ผูกว่าต้องมาจาก “สายลาดพร้าว/สายรังสิต”</span>
            </div>
            <div className="mt-2 flex items-start gap-2 text-[11px] text-muted-foreground">
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-info" />
              <span>ถ้ามีงาน 2 อยู่ใกล้ทาง ให้ลากเข้ามาแล้วแทรกจุดรับ–ส่งตรงตำแหน่งที่เหมาะสม</span>
            </div>
          </div>
          <Button className="mt-3 w-full" disabled>
            ส่งเข้า Planning (เปิดใช้หลังยืนยัน UX)
          </Button>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            พรีวิวนี้ไม่สร้างหรือส่งงานจริง
          </p>
        </div>
      </div>
    </section>
  );
}
