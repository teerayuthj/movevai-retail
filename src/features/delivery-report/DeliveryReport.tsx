import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DetailDrawer } from '@/components/DetailDrawer';
import { OrderTimeline } from '@/components/OrderTimeline';
import {
  DriverSummary,
  OrderSummary,
  ProofOfDeliveryInfo,
  ResolutionInfo,
} from '@/components/delivery/DeliveryExecutionShared';
import {
  type Driver,
  type Order,
  type OrderStatus,
  formatTHB,
  statusLabel,
} from '@/data/orderTypes';
import { useRetailStore } from '@/state/retailStore';
import {
  fetchDeliveryReport,
  type AcceptanceSummary,
  type DeliveryReportStatus,
  type DeliveryReportItem,
} from '@/lib/retailApi';
import {
  acceptanceLabel,
  getOrderAcceptance,
  summarizeOrderAcceptance,
} from '@/lib/acceptanceMetrics';
import { downloadCsv } from '@/lib/export';
import { shortRouteCode } from '@/lib/routeCode';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import { CopyRouteCodeButton } from '@/components/CopyRouteCodeButton';
import { cn } from '@/lib/utils';
import { formatElapsedDuration, getDeliveryDurationMinutes } from '@/lib/deliveryExecution';
import { MessengerOrderMapPage } from '@/features/messenger/components/MessengerOrderMapPage';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Loader2,
  Map,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
} from 'lucide-react';

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 5000;
const REPORT_STATUSES: OrderStatus[] = ['delivered', 'failed', 'returning', 'returned'];
const DELIVERY_REPORT_API_ENABLED = import.meta.env.VITE_DELIVERY_REPORT_API_ENABLED !== 'false';

const EMPTY_ACCEPTANCE_SUMMARY: AcceptanceSummary = {
  totalRoutes: 0,
  acceptedRoutes: 0,
  onTimeRoutes: 0,
  lateRoutes: 0,
  overdueUnacceptedRoutes: 0,
  pendingRoutes: 0,
  onTimeRatePercent: null,
  averageResponseMinutes: null,
  averageLateMinutes: null,
};

type ReportRow = {
  order: Order;
  driver: Driver | null;
  closedAt: string | null;
  plannedAt: string | null;
};

type ReportStatusOption = DeliveryReportStatus;

const STATUS_OPTIONS: { value: ReportStatusOption; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'delivered', label: 'ส่งสำเร็จ' },
  { value: 'failed', label: 'ส่งไม่สำเร็จ' },
  { value: 'returned', label: 'ส่งกลับ/รับคืน' },
];

function dateKeyOf(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function defaultDateFrom() {
  return dateKeyOf(addDays(new Date(), -6));
}

function defaultDateTo() {
  return dateKeyOf(new Date());
}

function formatDateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString('th-TH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
}

function formatDateOnly(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      })
    : '—';
}

function maskPhone(phone?: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return phone || '—';
  return `${digits.slice(0, 3)}-xxx-${digits.slice(-4)}`;
}

function statusGroupMatches(order: Order, status: ReportStatusOption) {
  if (status === 'all') return true;
  if (status === 'returned') return order.status === 'returning' || order.status === 'returned';
  return order.status === status;
}

function isMessengerReportOrder(order: Order) {
  return (
    (order.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
    Boolean(order.assignedDriverId) &&
    REPORT_STATUSES.includes(order.status)
  );
}

function getLastActivityAt(order: Order, types: string[]) {
  return [...(order.activityLog ?? [])].reverse().find((event) => types.includes(event.type))?.at;
}

function getClosedAt(order: Order) {
  return (
    getLastActivityAt(order, [
      'delivery_confirmed',
      'delivery_completed',
      'delivery_failed',
      'return_completed',
    ]) ??
    order.resolution?.recordedAt ??
    order.proofOfDelivery?.capturedAt ??
    order.inTransitAt ??
    null
  );
}

function getPlannedAt(order: Order) {
  const date = order.deliveryPlan?.plannedDate ?? order.deliveryRoute?.plannedDate;
  if (!date) return null;
  const time = order.deliveryPlan?.plannedTime ?? order.deliveryRoute?.plannedTime;
  return time ? `${date}T${time}:00` : `${date}T00:00:00`;
}

function inDateRange(value: string | null, from: string, to: string) {
  if (!value) return false;
  const key = dateKeyOf(new Date(value));
  return key >= from && key <= to;
}

function proofSummary(order: Order) {
  const proof = order.proofOfDelivery;
  if (!proof) return 'ไม่มีหลักฐาน';
  const parts = [
    proof.photoCount > 0 ? `รูป ${proof.photoCount}` : null,
    proof.signatureCaptured ? 'ลายเซ็น' : null,
    proof.otpVerified ? 'OTP' : null,
    proof.location ? 'GPS' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'ไม่มีหลักฐาน';
}

function codSummary(order: Order) {
  const cod = order.proofOfDelivery?.cod;
  if (order.payment !== 'cod' && !cod) return '—';
  if (!cod?.collected) return 'ยังไม่ระบุ';
  return cod.amount != null ? formatTHB(cod.amount) : 'รับแล้ว';
}

function deliveryDuration(order: Order, closedAt: string | null) {
  if (!closedAt) return '—';
  const minutes = getDeliveryDurationMinutes(order.inTransitAt, closedAt);
  return minutes != null ? formatElapsedDuration(minutes) : '—';
}

// ระยะเวลารวมตั้งแต่ messenger กดรับเที่ยวจนปิดงาน — ต่างจาก "ใช้เวลา" ที่นับจากเริ่มจัดส่ง
// คืน null เมื่อไม่มีเวลารับเที่ยว (งานเก่า/งานที่ไม่ต้องกดรับ) เพื่อให้ UI ซ่อนบรรทัดนี้ได้
function acceptToCloseDuration(order: Order, closedAt: string | null) {
  if (!closedAt) return null;
  const minutes = getDeliveryDurationMinutes(order.deliveryRoute?.acceptedAt, closedAt);
  return minutes != null ? formatElapsedDuration(minutes) : null;
}

function statusBadgeVariant(status: OrderStatus) {
  if (status === 'delivered') return 'success' as const;
  if (status === 'failed') return 'warning' as const;
  if (status === 'returning') return 'info' as const;
  if (status === 'returned') return 'muted' as const;
  return 'muted' as const;
}

function searchText(order: Order, driver: Driver | null) {
  return [
    order.orderNo,
    order.code,
    order.customer.name,
    order.customer.phone,
    order.customer.address,
    order.deliveryRoute?.code,
    driver?.name,
    driver?.id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function buildRowsFromOrders(orders: Order[], drivers: Driver[]) {
  return orders
    .filter(isMessengerReportOrder)
    .map<ReportRow>((order) => ({
      order,
      driver: drivers.find((driver) => driver.id === order.assignedDriverId) ?? null,
      closedAt: getClosedAt(order),
      plannedAt: getPlannedAt(order),
    }))
    .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime());
}

function rowsFromApiItems(items: DeliveryReportItem[], drivers: Driver[]) {
  return items.map<ReportRow>((item) => {
    const driver =
      item.driver ??
      drivers.find((candidate) => candidate.id === item.order.assignedDriverId) ??
      null;
    const order: Order = {
      ...item.order,
      proofOfDelivery: item.proof ?? item.order.proofOfDelivery,
      proofHistory: item.proofHistory ?? item.order.proofHistory,
      resolution: item.resolution ?? item.order.resolution,
    };
    return {
      order,
      driver,
      closedAt: item.timestamps.closedAt ?? getClosedAt(order),
      plannedAt: item.timestamps.plannedAt ?? getPlannedAt(order),
    };
  });
}

function filterLocalRows(input: {
  rows: ReportRow[];
  dateFrom: string;
  dateTo: string;
  status: ReportStatusOption;
  driverCode: string;
  query: string;
}) {
  const query = input.query.trim().toLowerCase();
  return input.rows.filter(({ order, driver, closedAt }) => {
    if (!inDateRange(closedAt, input.dateFrom, input.dateTo)) return false;
    if (!statusGroupMatches(order, input.status)) return false;
    if (input.driverCode && order.assignedDriverId !== input.driverCode) return false;
    if (query && !searchText(order, driver).includes(query)) return false;
    return true;
  });
}

function csvEscape(value: string | number | null | undefined) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildReportCsv(rows: ReportRow[]) {
  const headers = [
    'Order',
    'สถานะ',
    'ลูกค้า',
    'เบอร์',
    'Messenger',
    'เวลามอบหมายเที่ยว',
    'กำหนดรับเที่ยว',
    'เวลารับจริง',
    'สถานะการรับ',
    'นาทีหลังมอบหมาย',
    'นาทีที่รับช้า',
    'Route',
    'วันนัด',
    'เวลาปิดงาน',
    'ใช้เวลา',
    'ใช้เวลาจากรับเที่ยว',
    'COD',
    'Proof',
  ];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach(({ order, driver, closedAt, plannedAt }) => {
    const acceptance = getOrderAcceptance(order);
    lines.push(
      [
        order.orderNo,
        statusLabel[order.status],
        order.customer.name,
        order.customer.phone,
        driver?.name ?? order.assignedDriverId ?? '',
        order.deliveryRoute?.publishedAt ? formatDateTime(order.deliveryRoute.publishedAt) : '',
        order.deliveryRoute?.acceptBy ? formatDateTime(order.deliveryRoute.acceptBy) : '',
        order.deliveryRoute?.acceptedAt ? formatDateTime(order.deliveryRoute.acceptedAt) : '',
        acceptanceLabel(acceptance),
        acceptance.responseMinutes ?? '',
        acceptance.lateMinutes || '',
        order.deliveryRoute ? shortRouteCode(order.deliveryRoute.code) : '',
        plannedAt ? formatDateTime(plannedAt) : '',
        closedAt ? formatDateTime(closedAt) : '',
        deliveryDuration(order, closedAt),
        acceptToCloseDuration(order, closedAt) ?? '',
        codSummary(order),
        proofSummary(order),
      ]
        .map(csvEscape)
        .join(','),
    );
  });
  return lines.join('\r\n');
}

export function DeliveryReportPage() {
  const { orders, drivers } = useRetailStore();
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [status, setStatus] = useState<ReportStatusOption>('all');
  const [driverCode, setDriverCode] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [acceptance, setAcceptance] = useState<AcceptanceSummary>(EMPTY_ACCEPTANCE_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingLocalFallback, setUsingLocalFallback] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [mapOrderId, setMapOrderId] = useState<string | null>(null);
  const requestId = useRef(0);

  const localRows = useMemo(() => buildRowsFromOrders(orders, drivers), [orders, drivers]);
  const selectedRow =
    rows.find((row) => row.order.id === selectedOrderId) ??
    localRows.find((row) => row.order.id === selectedOrderId) ??
    null;
  const mapRow =
    rows.find((row) => row.order.id === mapOrderId) ??
    localRows.find((row) => row.order.id === mapOrderId) ??
    null;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadLocalRows = useCallback(
    (take: number, skip: number) => {
      const filtered = filterLocalRows({
        rows: localRows,
        dateFrom,
        dateTo,
        status,
        driverCode,
        query: debouncedQuery,
      });
      return { rows: filtered.slice(skip, skip + take), total: filtered.length, allRows: filtered };
    },
    [dateFrom, dateTo, debouncedQuery, driverCode, localRows, status],
  );

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    if (!DELIVERY_REPORT_API_ENABLED) {
      const fallback = loadLocalRows(PAGE_SIZE, (page - 1) * PAGE_SIZE);
      setRows(fallback.rows);
      setTotal(fallback.total);
      setAcceptance(summarizeOrderAcceptance(fallback.allRows.map((row) => row.order)));
      setUsingLocalFallback(false);
      setLoading(false);
      return;
    }

    void fetchDeliveryReport({
      dateFrom,
      dateTo,
      status,
      driverCode: driverCode || undefined,
      query: debouncedQuery || undefined,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    })
      .then((result) => {
        if (id !== requestId.current) return;
        const nextRows = rowsFromApiItems(result.items, drivers);
        setRows(nextRows);
        setTotal(result.total);
        setAcceptance(
          result.acceptance ?? summarizeOrderAcceptance(nextRows.map((row) => row.order)),
        );
        setUsingLocalFallback(false);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        const fallback = loadLocalRows(PAGE_SIZE, (page - 1) * PAGE_SIZE);
        setRows(fallback.rows);
        setTotal(fallback.total);
        setAcceptance(summarizeOrderAcceptance(fallback.allRows.map((row) => row.order)));
        setUsingLocalFallback(true);
        setError(err instanceof Error ? err.message : 'โหลด report จาก backend ไม่สำเร็จ');
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [
    dateFrom,
    dateTo,
    debouncedQuery,
    driverCode,
    drivers,
    loadLocalRows,
    page,
    refreshKey,
    status,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function resetPageAnd<T>(setter: (value: T) => void, value: T) {
    setter(value);
    setPage(1);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      let exportRows: ReportRow[];
      if (DELIVERY_REPORT_API_ENABLED) {
        try {
          const result = await fetchDeliveryReport({
            dateFrom,
            dateTo,
            status,
            driverCode: driverCode || undefined,
            query: debouncedQuery || undefined,
            take: EXPORT_LIMIT,
            skip: 0,
          });
          exportRows = rowsFromApiItems(result.items, drivers);
        } catch {
          exportRows = loadLocalRows(EXPORT_LIMIT, 0).allRows;
        }
      } else {
        exportRows = loadLocalRows(EXPORT_LIMIT, 0).allRows;
      }
      downloadCsv(`delivery-report-${dateFrom}-to-${dateTo}.csv`, buildReportCsv(exportRows));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">รายงานงานส่ง</h1>
          <p className="text-sm text-muted-foreground">
            Audit งาน Messenger ย้อนหลังแบบ read-only พร้อมหลักฐาน, COD, timeline และเส้นทาง
          </p>
        </div>
        <Button variant="outline" onClick={() => void exportCsv()} disabled={exporting || loading}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[150px_150px_180px_220px_1fr_auto]">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            จากวันที่
            <DatePicker
              value={dateFrom}
              onChange={(value) => resetPageAnd(setDateFrom, value)}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ถึงวันที่
            <DatePicker
              value={dateTo}
              onChange={(value) => resetPageAnd(setDateTo, value)}
              className="h-9"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            สถานะ
            <Select
              value={status}
              onChange={(event) =>
                resetPageAnd(setStatus, event.target.value as ReportStatusOption)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Messenger
            <Select
              value={driverCode}
              onChange={(event) => resetPageAnd(setDriverCode, event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name} ({driver.id})
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ค้นหา
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="order / ลูกค้า / เบอร์ / route"
                className="h-9 pl-9"
              />
            </div>
          </label>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="รีเฟรช"
            >
              <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {usingLocalFallback && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Backend report endpoint ยังไม่พร้อมหรือโหลดไม่สำเร็จ — แสดงข้อมูลจากรายการที่โหลดอยู่ใน
            dashboard แทน ({error})
          </span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">ประสิทธิภาพการรับเที่ยว</CardTitle>
          <div className="text-xs text-muted-foreground">
            นับเที่ยวไม่ซ้ำตามช่วงและตัวกรองด้านบน · ตรงเวลาเทียบกำหนดรับเที่ยว
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {[
            {
              label: 'เที่ยวที่วัด SLA',
              value: acceptance.totalRoutes,
            },
            {
              label: 'รับตรงเวลา',
              value: acceptance.onTimeRoutes,
              tone: 'text-success',
            },
            {
              label: 'รับช้า',
              value: acceptance.lateRoutes,
              tone: 'text-destructive',
            },
            {
              label: 'ยังไม่รับเกินกำหนด',
              value: acceptance.overdueUnacceptedRoutes,
              tone: 'text-warning',
            },
            {
              label: 'รอรับในกำหนด',
              value: acceptance.pendingRoutes,
            },
            {
              label: 'ตรงเวลา',
              value:
                acceptance.onTimeRatePercent == null ? '—' : `${acceptance.onTimeRatePercent}%`,
            },
            {
              label: 'เวลารับเฉลี่ย',
              value:
                acceptance.averageResponseMinutes == null
                  ? '—'
                  : formatElapsedDuration(acceptance.averageResponseMinutes),
            },
            {
              label: 'รับช้าเฉลี่ย',
              value:
                acceptance.averageLateMinutes == null
                  ? '—'
                  : formatElapsedDuration(acceptance.averageLateMinutes),
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border px-3 py-2.5">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className={cn('mt-1 text-xl font-semibold tabular-nums', item.tone)}>
                {item.value}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b py-3">
          <div>
            <CardTitle className="text-sm">รายการงานส่ง</CardTitle>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {formatDateOnly(`${dateFrom}T00:00:00`)} ถึง {formatDateOnly(`${dateTo}T00:00:00`)}
            </div>
          </div>
          <Badge variant="muted">{total.toLocaleString('th-TH')} รายการ</Badge>
        </CardHeader>
        <CardContent className="relative p-0">
          <div className="hidden grid-cols-[1.15fr_1fr_1fr_1fr_0.9fr_1.1fr] gap-3 border-b bg-muted/30 px-4 py-2 text-[11px] font-medium text-muted-foreground lg:grid">
            <div>Order / ลูกค้า</div>
            <div>Messenger</div>
            <div>สถานะ / เวลา</div>
            <div>COD / Proof</div>
            <div>Route</div>
            <div className="text-right">ตรวจสอบ</div>
          </div>

          <div className="divide-y">
            {rows.map(({ order, driver, closedAt, plannedAt }) => {
              const orderAcceptance = getOrderAcceptance(order);
              const acceptToClose = acceptToCloseDuration(order, closedAt);
              return (
                <div
                  key={order.id}
                  className="grid gap-3 px-4 py-3 text-sm lg:grid-cols-[1.15fr_1fr_1fr_1fr_0.9fr_1.1fr] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{order.orderNo}</span>
                      <CopyOrderNoButton orderNo={order.orderNo} />
                      <Badge
                        variant={statusBadgeVariant(order.status)}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {statusLabel[order.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate font-medium">{order.customer.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {maskPhone(order.customer.phone)}
                    </div>
                  </div>

                  <div className="min-w-0 text-xs">
                    <div className="truncate font-medium">
                      {driver?.name ?? order.assignedDriverId ?? '—'}
                    </div>
                    <div className="text-muted-foreground">
                      {driver?.phone ? maskPhone(driver.phone) : '—'}
                    </div>
                    {orderAcceptance.state !== 'not_required' && (
                      <Badge
                        variant={
                          orderAcceptance.state === 'on_time'
                            ? 'success'
                            : orderAcceptance.state === 'late'
                              ? 'destructive'
                              : 'warning'
                        }
                        className="mt-1 h-5 px-1.5 text-[10px]"
                      >
                        {acceptanceLabel(orderAcceptance)}
                        {orderAcceptance.state === 'late' &&
                          ` ${formatElapsedDuration(orderAcceptance.lateMinutes)}`}
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDateTime(closedAt)}
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {deliveryDuration(order, closedAt)}
                    </div>
                    {acceptToClose && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" />
                        รับเที่ยว→ปิด {acceptToClose}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 text-xs">
                    <div>{codSummary(order)}</div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {proofSummary(order)}
                    </div>
                  </div>

                  <div className="min-w-0 text-xs">
                    <div className="truncate font-medium">
                      {order.deliveryRoute ? shortRouteCode(order.deliveryRoute.code) : '—'}
                    </div>
                    <div className="text-muted-foreground">
                      {plannedAt ? formatDateTime(plannedAt) : 'ไม่ระบุวันนัด'}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-start gap-1.5 lg:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      รายละเอียด
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMapOrderId(order.id)}>
                      <Map className="h-3.5 w-3.5" />
                      เส้นทาง
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {!loading && rows.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-success" />
              ไม่พบงานส่งตามเงื่อนไขที่เลือก
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex min-h-40 items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>

        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            {total === 0
              ? '0 รายการ'
              : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} จาก ${total.toLocaleString('th-TH')}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-16 text-center tabular-nums">
              {page}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              aria-label="หน้าถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <DetailDrawer
        open={!!selectedRow}
        title={
          <span className="inline-flex items-center gap-1 font-mono">
            {selectedRow?.order.orderNo}
            <CopyOrderNoButton orderNo={selectedRow?.order.orderNo} />
          </span>
        }
        subtitle={
          selectedRow ? `รายงานงานส่ง · ${statusLabel[selectedRow.order.status]}` : undefined
        }
        onClose={() => setSelectedOrderId(null)}
        widthClassName="lg:w-[620px] xl:w-[760px]"
      >
        {selectedRow && (
          <>
            <div className="flex flex-wrap gap-1">
              <Badge variant={statusBadgeVariant(selectedRow.order.status)}>
                {statusLabel[selectedRow.order.status]}
              </Badge>
              <Badge variant="muted">ปิดงาน {formatDateTime(selectedRow.closedAt)}</Badge>
              <Badge variant="muted">
                ใช้เวลา {deliveryDuration(selectedRow.order, selectedRow.closedAt)}
              </Badge>
              {acceptToCloseDuration(selectedRow.order, selectedRow.closedAt) && (
                <Badge variant="muted">
                  รับเที่ยว→ปิดงาน {acceptToCloseDuration(selectedRow.order, selectedRow.closedAt)}
                </Badge>
              )}
            </div>

            <div>
              <div className="text-[11px] font-medium text-muted-foreground">Order</div>
              <div className="mt-1">
                <OrderSummary order={selectedRow.order} />
              </div>
            </div>

            {selectedRow.order.proofOfDelivery && (
              <ProofOfDeliveryInfo
                order={selectedRow.order}
                driverName={selectedRow.driver?.name}
              />
            )}

            {selectedRow.order.resolution && <ResolutionInfo order={selectedRow.order} />}

            <div>
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                ข้อมูล Messenger
              </div>
              <DriverSummary driver={selectedRow.driver} order={selectedRow.order} />
            </div>

            <div className={cn('rounded-lg border p-3 text-xs', 'bg-muted/20')}>
              <div className="font-medium">Report snapshot</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">Route</div>
                  <div className="flex items-center gap-1">
                    {selectedRow.order.deliveryRoute
                      ? shortRouteCode(selectedRow.order.deliveryRoute.code)
                      : '—'}
                    <CopyRouteCodeButton code={selectedRow.order.deliveryRoute?.code} />
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">วันนัด</div>
                  <div>{formatDateTime(selectedRow.plannedAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">COD</div>
                  <div>{codSummary(selectedRow.order)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Proof</div>
                  <div>{proofSummary(selectedRow.order)}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMapOrderId(selectedRow.order.id)}
              >
                <Map className="h-4 w-4" />
                ดูเส้นทาง
              </Button>
            </div>

            <OrderTimeline
              order={selectedRow.order}
              description="กิจกรรมย้อนหลังของงานนี้"
              compact
            />
          </>
        )}
      </DetailDrawer>

      {mapOrderId && (
        <div className="fixed inset-0 z-[70] bg-background">
          <MessengerOrderMapPage
            order={mapRow?.order ?? null}
            orderId={mapOrderId}
            onBack={() => setMapOrderId(null)}
          />
        </div>
      )}
    </div>
  );
}
