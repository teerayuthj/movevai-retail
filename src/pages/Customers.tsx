import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  fetchCustomer,
  fetchCustomers,
  type CustomerDetail,
  type CustomerGeoFilter,
  type CustomerListSort,
  type CustomerSummary,
} from '@/lib/retailApi';
import {
  AlertCircle,
  BookUser,
  Loader2,
  MapPin,
  MapPinCheck,
  Phone,
  RefreshCw,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 30;

const SORT_OPTIONS: Array<{ value: CustomerListSort; label: string }> = [
  { value: 'recent', label: 'สั่งล่าสุด' },
  { value: 'name', label: 'ชื่อ (ก-ฮ)' },
  { value: 'orders', label: 'ออเดอร์เยอะสุด' },
  { value: 'value', label: 'มูลค่ารวมสูงสุด' },
];

const GEO_OPTIONS: Array<{ value: CustomerGeoFilter; label: string }> = [
  { value: 'all', label: 'พิกัด: ทั้งหมด' },
  { value: 'verified', label: 'ยืนยันแล้ว' },
  { value: 'unverified', label: 'ยังไม่ยืนยัน' },
];

const DAYS_OPTIONS = [
  { value: 0, label: 'ช่วงเวลา: ทั้งหมด' },
  { value: 7, label: 'สั่งใน 7 วัน' },
  { value: 30, label: 'สั่งใน 30 วัน' },
  { value: 90, label: 'สั่งใน 90 วัน' },
] as const;

const MIN_ORDERS_OPTIONS = [
  { value: 0, label: 'ลูกค้า: ทุกคน' },
  { value: 2, label: 'สั่งซ้ำ (2+ ออเดอร์)' },
  { value: 5, label: 'ประจำ (5+ ออเดอร์)' },
] as const;

const statusLabels: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'info' | 'muted' | 'destructive' }
> = {
  new: { label: 'ใหม่', variant: 'info' },
  needs_review: { label: 'รอตรวจ', variant: 'warning' },
  ready: { label: 'พร้อมส่ง', variant: 'info' },
  assigned: { label: 'มอบหมายแล้ว', variant: 'info' },
  in_transit: { label: 'กำลังส่ง', variant: 'warning' },
  pending_confirmation: { label: 'รอยืนยันปิดงาน', variant: 'warning' },
  delivered: { label: 'ส่งสำเร็จ', variant: 'success' },
  rejected: { label: 'ปฏิเสธ', variant: 'destructive' },
  cancelled: { label: 'ยกเลิก', variant: 'destructive' },
  returned: { label: 'ตีกลับ', variant: 'destructive' },
};

function orderStatusBadge(status: string) {
  const entry = statusLabels[status] ?? { label: status, variant: 'muted' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

const bahtFormat = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

function formatBaht(value: number) {
  return `฿${bahtFormat.format(value)}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** จัดเบอร์ normalize (ตัวเลขล้วน) ให้อ่านง่าย เช่น 0812345678 → 081-234-5678 */
function formatPhone(phone: string) {
  if (/^0\d{9}$/.test(phone)) {
    return `${phone.slice(0, 3)}-${phone.slice(3, 6)}-${phone.slice(6)}`;
  }
  if (/^0\d{8}$/.test(phone)) {
    return `${phone.slice(0, 2)}-${phone.slice(2, 5)}-${phone.slice(5)}`;
  }
  return phone;
}

function queryFromLocationSearch(locationSearch: string | undefined) {
  if (!locationSearch) return '';
  return new URLSearchParams(locationSearch).get('q') ?? '';
}

type Props = {
  /** query string จาก router (เช่นมาจากช่องค้นหา global บน topbar: ?q=...) */
  locationSearch?: string;
};

export function CustomersPage({ locationSearch }: Props) {
  const [query, setQuery] = useState(() => queryFromLocationSearch(locationSearch));
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [sort, setSort] = useState<CustomerListSort>('recent');
  const [geoFilter, setGeoFilter] = useState<CustomerGeoFilter>('all');
  const [days, setDays] = useState(0);
  const [minOrders, setMinOrders] = useState(0);

  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // กันผลลัพธ์ค้นหาเก่าที่ตอบช้ามาทับผลใหม่
  const listRequestSeq = useRef(0);

  // ค้นหาจาก topbar ระหว่างอยู่บนหน้านี้ — sync ?q= ใหม่เข้าช่องค้นหา
  useEffect(() => {
    const fromLocation = queryFromLocationSearch(locationSearch);
    if (fromLocation) setQuery(fromLocation);
  }, [locationSearch]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadCustomers = useCallback(
    async (cursor?: string) => {
      const seq = ++listRequestSeq.current;
      setListLoading(true);
      setListError(null);
      try {
        const result = await fetchCustomers({
          q: debouncedQuery || undefined,
          sort,
          geo: geoFilter,
          days: days > 0 ? days : undefined,
          minOrders: minOrders > 0 ? minOrders : undefined,
          cursor,
          limit: PAGE_SIZE,
        });
        if (seq !== listRequestSeq.current) return;
        setCustomers((current) => (cursor ? [...current, ...result.customers] : result.customers));
        setTotal(result.total);
        setNextCursor(result.nextCursor);
      } catch (error) {
        if (seq !== listRequestSeq.current) return;
        setListError(error instanceof Error ? error.message : String(error));
      } finally {
        if (seq === listRequestSeq.current) setListLoading(false);
      }
    },
    [debouncedQuery, sort, geoFilter, days, minOrders],
  );

  // filter/sort/คำค้นเปลี่ยน → โหลดหน้าแรกใหม่ (ไม่มี cursor)
  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    fetchCustomer(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch((error) => {
        if (!cancelled) setDetailError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // เลือกคนแรกอัตโนมัติเมื่อรายการเปลี่ยน (ถ้าคนที่เลือกอยู่หลุดจากผลค้นหา)
  useEffect(() => {
    if (customers.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !customers.some((customer) => customer.id === selectedId)) {
      setSelectedId(customers[0].id);
    }
  }, [customers, selectedId]);

  const verifiedCount = useMemo(
    () => customers.filter((customer) => customer.geoVerified).length,
    [customers],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <BookUser className="h-5 w-5 text-primary" />
            ลูกค้า
          </h1>
          <p className="text-sm text-muted-foreground">
            โปรไฟล์สะสมจากทุกออเดอร์ (รวม CSV import) — เบอร์เดิมนับเป็นลูกค้าคนเดียวกัน
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadCustomers()}
          disabled={listLoading}
        >
          {listLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          รีเฟรช
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="self-start">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                รายชื่อลูกค้า{total > 0 ? ` (${total})` : ''}
              </CardTitle>
              {verifiedCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <MapPinCheck className="h-3.5 w-3.5" />
                  พิกัดยืนยันแล้ว {verifiedCount}
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาชื่อ เบอร์โทร หรือที่อยู่"
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={sort}
                onChange={(event) => setSort(event.target.value as CustomerListSort)}
                aria-label="เรียงตาม"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    เรียง: {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={geoFilter}
                onChange={(event) => setGeoFilter(event.target.value as CustomerGeoFilter)}
                aria-label="กรองพิกัดยืนยัน"
              >
                {GEO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={String(days)}
                onChange={(event) => setDays(Number(event.target.value))}
                aria-label="กรองช่วงเวลาสั่งล่าสุด"
              >
                {DAYS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={String(minOrders)}
                onChange={(event) => setMinOrders(Number(event.target.value))}
                aria-label="กรองจำนวนออเดอร์ขั้นต่ำ"
              >
                {MIN_ORDERS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {listError ? (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {listError}
              </div>
            ) : customers.length === 0 && !listLoading ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                {debouncedQuery || geoFilter !== 'all' || days > 0 || minOrders > 0
                  ? 'ไม่พบลูกค้าที่ตรงกับเงื่อนไข'
                  : 'ยังไม่มีข้อมูลลูกค้า — โปรไฟล์จะถูกสร้างอัตโนมัติเมื่อมีออเดอร์เข้า'}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {customers.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(customer.id)}
                      className={cn(
                        'flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60',
                        selectedId === customer.id && 'bg-muted',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{customer.name}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {sort === 'value' && (
                            <span className="text-xs font-medium">
                              {formatBaht(customer.totalValue)}
                            </span>
                          )}
                          <Badge variant="secondary">{customer.ordersCount} ออเดอร์</Badge>
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        {formatPhone(customer.phone)}
                        {customer.geoVerified && (
                          <span className="flex items-center gap-0.5 text-success">
                            <MapPinCheck className="h-3 w-3" />
                            พิกัดยืนยันแล้ว
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {customer.address}
                      </span>
                      <span className="text-[11px] text-muted-foreground/80">
                        สั่งล่าสุด {formatDate(customer.lastOrderAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {nextCursor && !listError && (
              <div className="border-t border-border p-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={listLoading}
                  onClick={() => void loadCustomers(nextCursor)}
                >
                  {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  โหลดเพิ่ม ({customers.length}/{total})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!selectedId ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                เลือกลูกค้าจากรายชื่อด้านซ้ายเพื่อดูโปรไฟล์และประวัติออเดอร์
              </CardContent>
            </Card>
          ) : detailLoading && !detail ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                กำลังโหลดโปรไฟล์ลูกค้า…
              </CardContent>
            </Card>
          ) : detailError ? (
            <Card>
              <CardContent className="flex items-center gap-2 py-8 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {detailError}
              </CardContent>
            </Card>
          ) : detail ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{detail.customer.name}</CardTitle>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        {formatPhone(detail.customer.phone)}
                        {detail.customer.idCard && <span>· บัตร {detail.customer.idCard}</span>}
                      </p>
                    </div>
                    {detail.customer.geo ? (
                      <Badge variant="success" className="gap-1">
                        <MapPinCheck className="h-3.5 w-3.5" />
                        พิกัดยืนยันจากการส่งสำเร็จ
                      </Badge>
                    ) : (
                      <Badge variant="muted" className="gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        ยังไม่มีพิกัดยืนยัน
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">ที่อยู่ล่าสุด</p>
                    <p className="text-sm">{detail.customer.address}</p>
                  </div>
                  {detail.customer.geo && (
                    <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs">
                      <p className="font-medium text-success">
                        พิกัด {detail.customer.geo.lat.toFixed(6)},{' '}
                        {detail.customer.geo.lng.toFixed(6)}
                        {detail.customer.geo.verifiedAt &&
                          ` · ยืนยันเมื่อ ${formatDateTime(detail.customer.geo.verifiedAt)}`}
                      </p>
                      {detail.customer.geo.address && (
                        <p className="mt-0.5 text-muted-foreground">
                          ยืนยันกับที่อยู่: {detail.customer.geo.address}
                        </p>
                      )}
                      <p className="mt-0.5 text-muted-foreground">
                        ระบบจะใช้พิกัดนี้แทนการ geocode
                        เมื่อที่อยู่ออเดอร์ใหม่ตรงกับที่อยู่ที่ยืนยัน
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-md bg-muted px-3 py-2">
                      <p className="text-xs text-muted-foreground">ออเดอร์ทั้งหมด</p>
                      <p className="text-lg font-semibold">{detail.stats.totalOrders}</p>
                    </div>
                    <div className="rounded-md bg-muted px-3 py-2">
                      <p className="text-xs text-muted-foreground">ส่งสำเร็จ</p>
                      <p className="text-lg font-semibold text-success">
                        {detail.stats.deliveredOrders}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted px-3 py-2">
                      <p className="text-xs text-muted-foreground">มูลค่ารวม</p>
                      <p className="text-lg font-semibold">{formatBaht(detail.stats.totalValue)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ลูกค้าตั้งแต่ {formatDate(detail.customer.firstOrderAt)} · สั่งล่าสุด{' '}
                    {formatDate(detail.customer.lastOrderAt)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    ประวัติออเดอร์{detail.orders.length >= 50 ? ' (50 รายการล่าสุด)' : ''}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {detail.orders.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      ยังไม่มีออเดอร์
                    </p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {detail.orders.map((order) => (
                        <li key={order.id} className="flex flex-col gap-1 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-sm font-medium">{order.code}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {formatBaht(order.totalValue)}
                              </span>
                              {orderStatusBadge(order.status)}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{formatDateTime(order.receivedAt)}</span>
                            <span className="line-clamp-1">{order.address}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
