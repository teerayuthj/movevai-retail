import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { useRetailStore } from '@/state/retailStore';
import {
  fetchMessengerTrackingHistory,
  fetchTrackingSessions,
  type MessengerDestination,
  type MessengerProofLocation,
  type MessengerTrackingHistory,
  type MessengerTrackingSessionSummary,
} from '@/lib/retailApi';
import { TrackingReplayMap } from '@/features/delivery-tracking/components/TrackingReplayMap';
import { AlertCircle, Loader2, MapPin, RefreshCw, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shortRouteCode } from '@/lib/routeCode';

const RANGE_OPTIONS = [
  { days: 1, label: 'เฉพาะวันที่' },
  { days: 7, label: '7 วันย้อนหลัง' },
  { days: 14, label: '14 วันย้อนหลัง' },
  { days: 30, label: '30 วันย้อนหลัง' },
  { days: 60, label: '60 วันย้อนหลัง' },
  { days: 90, label: '90 วันย้อนหลัง' },
] as const;

type RangeDays = (typeof RANGE_OPTIONS)[number]['days'];

const DEFAULT_RANGE_DAYS: RangeDays = 7;
const FILTER_STORAGE_KEY = 'movevai:tracking-history-filters';

type TrackingHistoryFilters = {
  date: string;
  rangeDays: RangeDays;
  driverCode: string;
};

function isRangeDays(value: number): value is RangeDays {
  return RANGE_OPTIONS.some((option) => option.days === value);
}

function dateKeyOf(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return dateKeyOf(new Date());
}

function defaultTrackingHistoryFilters(): TrackingHistoryFilters {
  return {
    date: todayKey(),
    rangeDays: DEFAULT_RANGE_DAYS,
    driverCode: '',
  };
}

function loadTrackingHistoryFilters(): TrackingHistoryFilters {
  const fallback = defaultTrackingHistoryFilters();
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<TrackingHistoryFilters>;
    const parsedRangeDays =
      typeof parsed.rangeDays === 'number' && isRangeDays(parsed.rangeDays)
        ? parsed.rangeDays
        : fallback.rangeDays;

    return {
      date: typeof parsed.date === 'string' && parsed.date ? parsed.date : fallback.date,
      rangeDays: parsedRangeDays,
      driverCode: typeof parsed.driverCode === 'string' ? parsed.driverCode : fallback.driverCode,
    };
  } catch {
    return fallback;
  }
}

function filtersFromSearch(
  locationSearch: string,
  fallback: TrackingHistoryFilters,
): TrackingHistoryFilters {
  const search = new URLSearchParams(locationSearch);
  const rangeDays = Number(search.get('rangeDays'));
  return {
    ...fallback,
    driverCode: search.get('driverCode')?.trim() || fallback.driverCode,
    rangeDays: isRangeDays(rangeDays) ? rangeDays : fallback.rangeDays,
  };
}

function formatShortDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
    : '—';
}

function formatTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

function minutesBetween(startedAt: string, endedAt?: string | null) {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60_000));
}

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins} นาที`;
  return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
}

function formatDuration(startedAt: string, endedAt?: string | null) {
  return formatMinutes(minutesBetween(startedAt, endedAt));
}

// system code จาก backend — นอกเหนือจากนี้คือข้อความอิสระที่ messenger พิมพ์เองตอนกดจบ
const END_REASON_LABELS: Record<string, string> = {
  route_completed: 'ส่งครบทุกจุด (ระบบปิดให้อัตโนมัติ)',
  superseded_by_new_route: 'ระบบปิดให้อัตโนมัติตอนเริ่ม Route ถัดไป',
  no_active_delivery_jobs: 'แอป Messenger ปิดให้อัตโนมัติ (ไม่มีงานค้างแล้ว)',
};

const STOP_STATUS_LABELS: Record<string, string> = {
  delivered: 'ส่งแล้ว',
  pending: 'ยังไม่ส่ง',
  failed: 'ส่งไม่สำเร็จ',
  skipped: 'ข้าม',
};

function sessionTitle(session: { route: { code: string } | null; label: string | null }) {
  return session.route ? shortRouteCode(session.route.code) : (session.label ?? 'Test Route');
}

function messengerOptionLabel(driver: { id: string; name: string; zone?: string }) {
  return `${driver.name} (${driver.id})`;
}

async function fetchTrackingSessionsInRange(input: {
  endDate: string;
  rangeDays: RangeDays;
  driverCode?: string;
}) {
  return fetchTrackingSessions({
    date: input.endDate,
    days: input.rangeDays,
    driverCode: input.driverCode,
  });
}

type TrackingHistoryPageProps = {
  locationSearch?: string;
};

export function TrackingHistoryPage({ locationSearch = '' }: TrackingHistoryPageProps) {
  const { drivers } = useRetailStore();
  const [filters, setFilters] = useState(() =>
    filtersFromSearch(locationSearch, loadTrackingHistoryFilters()),
  );
  const { date, rangeDays, driverCode } = filters;
  const [sessions, setSessions] = useState<MessengerTrackingSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MessengerTrackingHistory | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, [filters]);

  useEffect(() => {
    let active = true;
    setIsListLoading(true);
    setError(null);
    void fetchTrackingSessionsInRange({
      endDate: date || todayKey(),
      rangeDays,
      driverCode: driverCode || undefined,
    })
      .then((rows) => {
        if (!active) return;
        setSessions(rows);
        setSelectedId((current) =>
          current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? null),
        );
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'โหลดรายการ Route ไม่สำเร็จ');
      })
      .finally(() => {
        if (active) setIsListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, rangeDays, driverCode, refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let active = true;
    setIsDetailLoading(true);
    void fetchMessengerTrackingHistory(selectedId)
      .then((row) => {
        if (active) setSelected(row);
      })
      .catch(() => {
        if (active) setSelected(null);
      })
      .finally(() => {
        if (active) setIsDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, refreshKey]);

  const selectedSummary = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );
  const selectedMessenger = useMemo(
    () => drivers.find((driver) => driver.id === driverCode) ?? null,
    [driverCode, drivers],
  );

  // ช่วงเวลาที่มีสัญญาณ GPS จริง (จุดแรก→จุดสุดท้าย) — backend ส่ง points เรียงตามเวลาแล้ว
  // ใช้แทนช่วงเวลา session เมื่อ session ถูกเปิดค้างไว้ (เช่นโดนปิดอัตโนมัติข้ามวัน)
  const gpsSpan = useMemo(() => {
    const points = selected?.points ?? [];
    if (points.length < 2) return null;
    return { start: points[0].recordedAt, end: points[points.length - 1].recordedAt };
  }, [selected]);

  const stops = useMemo(() => {
    const destinations = selected?.destinations ?? [];
    const proofs = selected?.proofLocations ?? [];
    const proofFor = (destination: MessengerDestination): MessengerProofLocation | null =>
      proofs.find(
        (proof) =>
          (destination.orderId != null && proof.orderId === destination.orderId) ||
          (destination.orderId == null &&
            destination.sequence != null &&
            proof.sequence === destination.sequence),
      ) ?? null;
    return [...destinations]
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((destination) => ({ destination, proof: proofFor(destination) }));
  }, [selected]);

  const deliveredCount = useMemo(
    () => stops.filter((stop) => stop.destination.status === 'delivered').length,
    [stops],
  );

  const durationStats = useMemo(() => {
    if (!selectedSummary) return null;
    const sessionMins = minutesBetween(selectedSummary.startedAt, selectedSummary.endedAt);
    const gpsMins = gpsSpan ? minutesBetween(gpsSpan.start, gpsSpan.end) : null;
    // session เปิดค้างนานกว่าช่วงที่มี GPS จริงเกิน 15 นาที = เวลารวมของ session เชื่อไม่ได้
    // (เช่นลืมกดจบแล้วระบบปิดให้ข้ามวัน) — ให้ยึดช่วงที่มีสัญญาณ GPS แทน
    const stale = gpsMins != null && sessionMins - gpsMins > 15;
    return { sessionMins, gpsMins, stale };
  }, [selectedSummary, gpsSpan]);

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ประวัติการติดตาม (Tracking History)
        </h1>
        <p className="text-sm text-muted-foreground">
          ดู Route ที่จบแล้วย้อนหลัง — เลือกวันและคนขับ แล้วเปิดดูเส้นทางจริงเทียบเส้นทางที่วางไว้
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ถึงวันที่
          <DatePicker
            value={date}
            onChange={(value) => {
              setFilters((current) => ({ ...current, date: value }));
              setSelectedId(null);
            }}
            className="w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ช่วงเวลา
          <Select
            value={rangeDays}
            onChange={(event) => {
              const nextRangeDays = Number(event.target.value);
              setFilters((current) => ({
                ...current,
                rangeDays: isRangeDays(nextRangeDays) ? nextRangeDays : DEFAULT_RANGE_DAYS,
              }));
              setSelectedId(null);
            }}
            containerClassName="w-44"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Messenger
          <Select
            value={driverCode}
            onChange={(event) => {
              setFilters((current) => ({ ...current, driverCode: event.target.value }));
              setSelectedId(null);
            }}
            containerClassName="w-64"
          >
            <option value="">ทั้งหมด (ทุก Messenger)</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {messengerOptionLabel(driver)}
              </option>
            ))}
          </Select>
        </label>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          <RefreshCw className={isListLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          รีเฟรช
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <Card className="flex max-h-[70vh] flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {sessions.length.toLocaleString('th-TH')} Route
            </CardTitle>
            <div className="text-xs text-muted-foreground">
              {rangeDays === 1
                ? formatShortDate(date)
                : `${rangeDays} วัน ถึง ${formatShortDate(date)}`}
              {selectedMessenger ? ` · ${selectedMessenger.name}` : ' · ทุก Messenger'}
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-1 overflow-y-auto px-2">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                <AlertCircle className="mb-1 h-4 w-4" />
                {error}
              </div>
            )}
            {isListLoading && sessions.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลด…
              </div>
            )}
            {!isListLoading && !error && sessions.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                ไม่มี Route ในช่วงนี้
                {selectedMessenger ? ` สำหรับ ${selectedMessenger.name}` : ''}
              </div>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedId(session.id)}
                className={cn(
                  'block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  selectedId === session.id
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-transparent hover:bg-muted/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{session.driver.name}</span>
                  {session.sessionType === 'test' && (
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                      TEST
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <RouteIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{sessionTitle(session)}</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatShortDate(session.startedAt)} · {formatTime(session.startedAt)}
                  {session.endedAt ? `–${formatTime(session.endedAt)}` : ' · กำลังวิ่ง'} ·{' '}
                  {(session.distanceMeters / 1000).toFixed(1)} กม.
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          {!selectedSummary ? (
            <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
              <MapPin className="mr-2 h-4 w-4" /> เลือก Route จากรายการเพื่อดูเส้นทาง
            </div>
          ) : (
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">{selectedSummary.driver.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {sessionTitle(selectedSummary)}
                  </div>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs',
                    selectedSummary.status === 'active'
                      ? 'bg-success/10 text-success'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {selectedSummary.status === 'active' ? 'กำลังวิ่ง' : 'จบแล้ว'}
                </span>
              </div>

              {(() => {
                const stats: { label: string; value: string; hint?: string }[] = [
                  {
                    label: 'เริ่ม–จบ',
                    value: `${formatTime(selectedSummary.startedAt)}–${formatTime(selectedSummary.endedAt)}`,
                  },
                  durationStats?.stale && durationStats.gpsMins != null
                    ? {
                        label: 'ใช้เวลา (ช่วงมี GPS)',
                        value: formatMinutes(durationStats.gpsMins),
                        hint: `session เปิดอยู่ ${formatMinutes(durationStats.sessionMins)}`,
                      }
                    : {
                        label: 'ใช้เวลา',
                        value: formatDuration(selectedSummary.startedAt, selectedSummary.endedAt),
                      },
                  {
                    label: 'ระยะทาง',
                    value: `${(selectedSummary.distanceMeters / 1000).toFixed(2)} กม.`,
                  },
                  { label: 'จุด GPS', value: `${selectedSummary.pointCount} จุด` },
                  ...(stops.length > 0
                    ? [{ label: 'ส่งสำเร็จ', value: `${deliveredCount}/${stops.length} จุด` }]
                    : []),
                ];
                return (
                  <div
                    className={cn(
                      'grid grid-cols-2 gap-2',
                      stats.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-4',
                    )}
                  >
                    {stats.map((stat) => (
                      <div key={stat.label} className="rounded-lg border bg-muted/20 p-2">
                        <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                        <div className="text-sm font-medium tabular-nums">{stat.value}</div>
                        {stat.hint && (
                          <div className="text-[11px] text-muted-foreground">{stat.hint}</div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {selectedSummary.offRouteCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
                  <AlertCircle className="h-4 w-4" />
                  หลุดเส้นทาง {selectedSummary.offRouteCount} ครั้ง
                </div>
              )}
              {durationStats?.stale && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    Session นี้เปิดค้างไว้นานกว่าช่วงที่มีสัญญาณ GPS จริง
                    (น่าจะไม่ได้กดจบตอนเลิกงานแล้วระบบปิดให้ภายหลัง) — ช่อง &ldquo;ใช้เวลา&rdquo;
                    จึงแสดงเฉพาะช่วงที่มีสัญญาณ GPS
                  </span>
                </div>
              )}
              {selectedSummary.endReason && (
                <div className="rounded-lg border bg-muted/20 p-2 text-xs text-muted-foreground">
                  เหตุผลที่จบ Route:{' '}
                  {END_REASON_LABELS[selectedSummary.endReason] ?? selectedSummary.endReason}
                </div>
              )}

              {isDetailLoading || !selected ? (
                <div className="flex h-72 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังโหลดเส้นทาง…
                </div>
              ) : (
                <TrackingReplayMap session={selected} />
              )}

              {stops.length > 0 && (
                <div className="overflow-hidden rounded-lg border">
                  <div className="border-b bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
                    จุดส่งในรอบนี้ · ส่งสำเร็จ {deliveredCount}/{stops.length}
                  </div>
                  <ul className="divide-y">
                    {stops.map(({ destination, proof }) => {
                      const delivered = destination.status === 'delivered';
                      const statusLabel = destination.status
                        ? (STOP_STATUS_LABELS[destination.status] ?? destination.status)
                        : '—';
                      return (
                        <li
                          key={destination.orderId ?? `seq-${destination.sequence}`}
                          className="flex items-start gap-3 px-3 py-2 text-sm"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
                            {destination.sequence ?? '·'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {destination.label ?? 'ไม่ระบุชื่อลูกค้า'}
                            </div>
                            {destination.address && (
                              <div className="truncate text-xs text-muted-foreground">
                                {destination.address}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[11px]',
                                delivered
                                  ? 'bg-success/10 text-success'
                                  : 'bg-muted text-muted-foreground',
                              )}
                            >
                              {statusLabel}
                            </span>
                            {proof?.capturedAt && (
                              <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                                ปิดงาน {formatTime(proof.capturedAt)}
                                {proof.accuracy != null
                                  ? ` · ±${Math.round(proof.accuracy)} ม.`
                                  : ''}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
