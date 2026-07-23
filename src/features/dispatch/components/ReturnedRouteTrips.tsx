import { useEffect, useState } from 'react';
import { Archive, Ban, MapPin, Pencil, RotateCcw, UserRound } from 'lucide-react';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { planningCancelReasonLabel } from '@/data/orderTypes';
import type { ReturnedRouteTrip } from '@/features/dispatch/returnedRouteTrips';
import { shortRouteCode } from '@/lib/routeCode';
import { cn } from '@/lib/utils';

type Props = {
  trips: ReturnedRouteTrip[];
  onEdit: (trip: ReturnedRouteTrip) => void;
  onSaveDraft: (trip: ReturnedRouteTrip) => Promise<void>;
  onCancel: (trip: ReturnedRouteTrip, note?: string) => Promise<void>;
};

function formatReturnedAt(value?: string) {
  if (!value) return 'ไม่พบเวลาที่ดึงกลับ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(date);
}

function routeLabel(trip: ReturnedRouteTrip) {
  return trip.routeCode ? shortRouteCode(trip.routeCode) : 'เที่ยวที่ดึงกลับ';
}

export function ReturnedRouteTrips({ trips, onEdit, onSaveDraft, onCancel }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(trips[0]?.id ?? null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedId && trips.some((trip) => trip.id === selectedId)) return;
    setSelectedId(trips[0]?.id ?? null);
  }, [selectedId, trips]);

  const selected = trips.find((trip) => trip.id === selectedId) ?? trips[0] ?? null;

  if (trips.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-success">
            <RotateCcw className="h-5 w-5" />
          </span>
          <div className="font-medium">ไม่มีเที่ยวที่รอจัดการ</div>
          <p className="max-w-md text-sm text-muted-foreground">
            เที่ยวที่สร้างจาก Route Builder และถูกดึงกลับจะแสดงที่นี่โดยไม่ไปปะปนกับงานจาก LINE
          </p>
        </CardContent>
      </Card>
    );
  }

  const runAction = async (action: () => Promise<void>) => {
    setSaving(true);
    setError('');
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-info/25 bg-info/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div>
            <div className="text-sm font-medium">เที่ยวถูกประกอบกลับตามต้นทางเดิม</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              จุดรับและจุดส่งจาก Route Builder แสดงเป็นหนึ่งงาน ส่วนเลข MV-ORD
              เก็บไว้เป็นข้อมูลอ้างอิงภายใน
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.25fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm">เที่ยวที่ต้องจัดใหม่</CardTitle>
                <CardDescription>เรียงตามเวลาที่ดึงกลับล่าสุด</CardDescription>
              </div>
              <Badge variant="secondary">{trips.length} เที่ยว</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {trips.map((trip) => {
              const active = trip.id === selected?.id;
              return (
                <button
                  key={trip.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSelectedId(trip.id)}
                  className={cn(
                    'w-full rounded-xl border p-3 text-left transition-all',
                    active
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'bg-card hover:border-primary/40',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{routeLabel(trip)}</span>
                    <Badge variant="warning">ดึงกลับ</Badge>
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-medium">{trip.title}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {trip.jobs.length} งาน · {trip.orders.length} จุด
                    {trip.driverName ? ` · ${trip.driverName}` : ''}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatReturnedAt(trip.returnedAt)}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-sm">เที่ยว {routeLabel(selected)}</CardTitle>
                    <Badge variant="warning">ดึงกลับ</Badge>
                  </div>
                  <CardDescription>{selected.title}</CardDescription>
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  <div>{formatReturnedAt(selected.returnedAt)}</div>
                  {selected.driverName && <div>Messenger เดิม · {selected.driverName}</div>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-2 rounded-xl border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">เหตุผล</dt>
                  <dd className="mt-0.5 font-medium">
                    {selected.reason
                      ? planningCancelReasonLabel[selected.reason]
                      : 'ดึง Route กลับเพื่อจัดใหม่'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">หมายเหตุ</dt>
                  <dd className="mt-0.5 font-medium">{selected.note || '—'}</dd>
                </div>
              </dl>

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">งานในเที่ยว</h3>
                  <Badge variant="outline">
                    {selected.jobs.length} งาน · {selected.orders.length} จุด
                  </Badge>
                </div>
                <div className="space-y-3">
                  {selected.jobs.map((job, index) => (
                    <div key={`${selected.id}-${index}`} className="rounded-xl border p-3">
                      <div className="mb-3 text-xs font-semibold">งาน {index + 1}</div>
                      <div className="space-y-3">
                        {[job.pickup, job.dropoff].map((order, stopIndex) => {
                          if (!order) return null;
                          const leg = order.metadataJson?.dispatch?.routeLeg;
                          return (
                            <div key={order.id} className="flex items-start gap-3">
                              <span
                                className={cn(
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                  leg === 'pickup'
                                    ? 'bg-info/10 text-info'
                                    : 'bg-success/10 text-success',
                                )}
                              >
                                {stopIndex + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium">{order.customer.name}</span>
                                  <Badge variant={leg === 'pickup' ? 'info' : 'success'}>
                                    {leg === 'pickup' ? 'รับ' : 'ส่ง'}
                                  </Badge>
                                </div>
                                <div className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                                  <span>{order.customer.address}</span>
                                </div>
                                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                                  ข้อมูลภายใน: {order.orderNo ?? order.code}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button disabled={saving} onClick={() => onEdit(selected)}>
                  <Pencil className="h-4 w-4" /> แก้ไขเที่ยวและส่งใหม่
                </Button>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => void runAction(() => onSaveDraft(selected))}
                >
                  <Archive className="h-4 w-4" /> เก็บเป็นฉบับร่าง
                </Button>
                <Button
                  variant="ghost"
                  disabled={saving}
                  className="text-destructive hover:text-destructive"
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban className="h-4 w-4" /> ยกเลิกเที่ยว
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {selected && (
        <ResolutionDialog
          open={cancelOpen}
          title={`ยกเลิกเที่ยว ${routeLabel(selected)}`}
          description={`ปิดงานภายใน ${selected.orders.length} จุดและเก็บประวัติไว้ตรวจสอบ`}
          reasons={[
            {
              value: 'cancelled_by_admin',
              label: 'ไม่ต้องจัดเที่ยวนี้แล้ว',
              leading: <UserRound className="h-4 w-4 text-muted-foreground" />,
            },
          ]}
          noteLabel="หมายเหตุ (ไม่บังคับ)"
          notePlaceholder="เช่น สร้างเที่ยวซ้ำ หรือไม่ต้องส่งแล้ว"
          confirmLabel="ยืนยันยกเลิกเที่ยว"
          confirmVariant="destructive"
          error={error}
          onCancel={() => setCancelOpen(false)}
          onConfirm={({ note }) => {
            void runAction(async () => {
              await onCancel(selected, note);
              setCancelOpen(false);
            });
          }}
        />
      )}
    </>
  );
}
