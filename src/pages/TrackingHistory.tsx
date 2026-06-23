import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRetailStore } from '@/state/retailStore';
import {
  fetchRiderTrackingHistory,
  fetchTrackingSessions,
  type RiderTrackingHistory,
  type RiderTrackingSessionSummary,
} from '@/lib/retailApi';
import { TrackingReplayMap } from '@/features/delivery-tracking/components/TrackingReplayMap';
import { AlertCircle, Loader2, MapPin, RefreshCw, Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

function formatDuration(startedAt: string, endedAt?: string | null) {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const mins = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} นาที`;
  return `${Math.floor(mins / 60)} ชม. ${mins % 60} นาที`;
}

function sessionTitle(session: { route: { code: string } | null; label: string | null }) {
  return session.route?.code ?? session.label ?? 'Test Route';
}

export function TrackingHistoryPage() {
  const { drivers } = useRetailStore();
  const [date, setDate] = useState(todayKey);
  const [driverCode, setDriverCode] = useState('');
  const [sessions, setSessions] = useState<RiderTrackingSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RiderTrackingHistory | null>(null);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsListLoading(true);
    setError(null);
    void fetchTrackingSessions({ date: date || undefined, driverCode: driverCode || undefined })
      .then((rows) => {
        if (!active) return;
        setSessions(rows);
        setSelectedId((current) => current ?? rows[0]?.id ?? null);
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
  }, [date, driverCode, refreshKey]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let active = true;
    setIsDetailLoading(true);
    void fetchRiderTrackingHistory(selectedId)
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
          วันที่
          <Input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setSelectedId(null);
            }}
            className="h-9 w-44"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          คนขับ
          <select
            value={driverCode}
            onChange={(event) => {
              setDriverCode(event.target.value);
              setSelectedId(null);
            }}
            className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">ทั้งหมด</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
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
                ไม่มี Route ในวันนี้
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
                  {formatTime(session.startedAt)}
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

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  {
                    label: 'เริ่ม–จบ',
                    value: `${formatTime(selectedSummary.startedAt)}–${formatTime(selectedSummary.endedAt)}`,
                  },
                  {
                    label: 'ใช้เวลา',
                    value: formatDuration(selectedSummary.startedAt, selectedSummary.endedAt),
                  },
                  {
                    label: 'ระยะทาง',
                    value: `${(selectedSummary.distanceMeters / 1000).toFixed(2)} กม.`,
                  },
                  { label: 'จุด GPS', value: `${selectedSummary.pointCount} จุด` },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border bg-muted/20 p-2">
                    <div className="text-[11px] text-muted-foreground">{stat.label}</div>
                    <div className="text-sm font-medium tabular-nums">{stat.value}</div>
                  </div>
                ))}
              </div>

              {selectedSummary.offRouteCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
                  <AlertCircle className="h-4 w-4" />
                  หลุดเส้นทาง {selectedSummary.offRouteCount} ครั้ง
                </div>
              )}
              {selectedSummary.endReason && (
                <div className="rounded-lg border bg-muted/20 p-2 text-xs text-muted-foreground">
                  เหตุผลที่จบ Route: {selectedSummary.endReason}
                </div>
              )}

              {isDetailLoading || !selected ? (
                <div className="flex h-72 items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> กำลังโหลดเส้นทาง…
                </div>
              ) : (
                <TrackingReplayMap session={selected} />
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
