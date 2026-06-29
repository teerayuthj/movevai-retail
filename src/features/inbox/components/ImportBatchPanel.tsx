import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Pencil,
  AlertTriangle,
  Coins,
  Copy,
  RotateCcw,
  Layers,
  Download,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  fetchImportBatches,
  fetchImportBatch,
  downloadImportBatchCsv,
  updateImportedOrder,
  parseAddress,
  type ImportBatch,
  type ImportBatchDetail,
  type ImportBatchRow,
  type ImportRejectReason,
} from '@/lib/retailApi';
import { downloadCsv } from '@/lib/export';
import { formatTHB, shippingMethodLabel, type Order, type ShippingMethod } from '@/data/mock';
import { useRetailStore } from '@/state/retailStore';
import { importRejectReasonLabel } from '@/state/retail/moderation';
import { cn } from '@/lib/utils';
import ThaiAddressPicker from '@/features/inbox/components/ThaiAddressPicker';
import {
  EMPTY_THAI_ADDRESS,
  composeThaiAddress,
  extractStreet,
  type ThaiAddressValue,
} from '@/features/inbox/utils/thaiAddress';

// order ที่ยังอยู่ขั้นตรวจใน Inbox (ยังไม่ปล่อยเข้าคิว)
const REVIEW_STATUSES: Order['status'][] = ['new', 'needs_review', 'parsing'];
const ALL_SCOPE = 'all';

function batchStatusVariant(status: ImportBatch['status']) {
  if (status === 'DONE') return 'success';
  if (status === 'ERROR') return 'destructive';
  if (status === 'PROCESSING') return 'info';
  return 'muted';
}

function batchStatusLabel(status: ImportBatch['status']) {
  if (status === 'DONE') return 'สำเร็จ';
  if (status === 'ERROR') return 'มีข้อผิดพลาด';
  if (status === 'PROCESSING') return 'กำลังนำเข้า...';
  return 'รอดำเนินการ';
}

function BatchListItem({
  batch,
  selected,
  onClick,
  onDownload,
  downloading,
}: {
  batch: ImportBatch;
  selected: boolean;
  onClick: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
      )}
    >
      <button type="button" onClick={onClick} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-xs font-medium">{batch.fileName}</span>
          </div>
          <Badge
            variant={batchStatusVariant(batch.status)}
            className="h-5 shrink-0 px-1.5 text-[10px]"
          >
            {batchStatusLabel(batch.status)}
          </Badge>
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>LINE Group</span>
          <span>·</span>
          <span>
            {new Date(batch.createdAt).toLocaleString('th', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {(batch.status === 'DONE' || batch.status === 'ERROR') && (
          <div className="mt-2 flex items-center gap-3 text-[11px]">
            <span className="text-success">✓ {batch.importedRows} orders</span>
            {batch.errorRows > 0 && (
              <span className="text-destructive">✗ {batch.errorRows} error</span>
            )}
            {batch.totalRows > 0 && (
              <span className="text-muted-foreground">/ {batch.totalRows} แถว</span>
            )}
          </div>
        )}
      </button>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          disabled={downloading}
          onClick={onDownload}
        >
          {downloading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          Export CSV
        </Button>
      </div>
    </div>
  );
}

type Tab = 'review' | 'approved' | 'rejected' | 'all';
type RowKind = 'error' | 'review' | 'approved' | 'rejected';

type RowVM = {
  rowId: string;
  rowIndex: number;
  fileName: string;
  rawData: Record<string, string>;
  kind: RowKind;
  orderId?: string;
  name: string;
  address: string;
  value?: number;
  errorMessage?: string | null;
  duplicateOfCode?: string | null;
};

type ImportEditDraft = {
  rawData: Record<string, string>;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  addr: ThaiAddressValue;
  customerIdCard: string;
  totalValue: string;
  payment: Order['payment'];
  note: string;
  itemName: string;
  itemSku: string;
  itemPurity: string;
  itemWeight: string;
  itemQty: string;
  itemUnitPrice: string;
  itemNote: string;
};

function rawField(raw: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const found = Object.entries(raw).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (found && found[1]) return found[1];
  }
  return '';
}

function rowKindForOrder(order: Order | undefined): RowKind {
  if (!order) return 'review';
  if (order.status === 'rejected') return 'rejected';
  if (REVIEW_STATUSES.includes(order.status)) return 'review';
  return 'approved';
}

function toRowVM(row: ImportBatchRow, fileName: string, ordersById: Map<string, Order>): RowVM {
  if (row.status === 'ERROR' || !row.orderId) {
    return {
      rowId: row.id,
      rowIndex: row.rowIndex,
      fileName,
      rawData: row.rawData,
      kind: 'error',
      name: rawField(row.rawData, 'customerName', 'ชื่อลูกค้า', 'ชื่อ', 'name') || '(ไม่ระบุชื่อ)',
      address: rawField(row.rawData, 'customerAddress', 'address', 'ที่อยู่') || '—',
      errorMessage: row.errorMessage,
    };
  }
  const order = ordersById.get(row.orderId);
  return {
    rowId: row.id,
    rowIndex: row.rowIndex,
    fileName,
    rawData: row.rawData,
    kind: rowKindForOrder(order),
    orderId: row.orderId,
    name:
      order?.customer.name ||
      rawField(row.rawData, 'customerName', 'ชื่อลูกค้า', 'ชื่อ', 'name') ||
      '(รอโหลด)',
    address:
      order?.customer.address ||
      rawField(row.rawData, 'customerAddress', 'address', 'ที่อยู่') ||
      '—',
    value: order?.totalValue,
    duplicateOfCode: row.duplicateOfCode,
  };
}

function draftFromRow(row: RowVM, order: Order | undefined): ImportEditDraft {
  const item = order?.items[0];
  const rawTotalValue = Number(rawField(row.rawData, 'totalValue', 'total', 'ราคารวม', 'มูลค่า'));
  const rawItemQty = Number(rawField(row.rawData, 'qty', 'quantity', 'จำนวน'));
  const rawItemUnitPrice = Number(rawField(row.rawData, 'price', 'unitPrice', 'itemPrice', 'ราคา'));
  const rawPayment = rawField(row.rawData, 'payment', 'การชำระ', 'ชำระ');
  return {
    rawData: row.rawData,
    customerName:
      order?.customer.name ??
      rawField(row.rawData, 'customerName', 'customer_name', 'ชื่อลูกค้า', 'ชื่อ', 'name'),
    customerPhone:
      order?.customer.phone ??
      rawField(row.rawData, 'customerPhone', 'phone', 'tel', 'เบอร์โทร', 'เบอร์'),
    customerAddress:
      order?.customer.address ?? rawField(row.rawData, 'customerAddress', 'address', 'ที่อยู่'),
    customerIdCard:
      order?.customer.idCard ?? rawField(row.rawData, 'idCard', 'เลขบัตร', 'บัตรประชาชน'),
    totalValue: String(order?.totalValue ?? (Number.isFinite(rawTotalValue) ? rawTotalValue : 0)),
    payment: normalizePaymentMethod(order?.payment ?? rawPayment),
    note: order?.note ?? rawField(row.rawData, 'note', 'หมายเหตุ'),
    itemName:
      item?.name ?? rawField(row.rawData, 'itemName', 'item', 'product', 'สินค้า', 'ชื่อสินค้า'),
    itemSku: item?.sku ?? rawField(row.rawData, 'sku', 'itemSku', 'รหัสสินค้า') ?? '-',
    itemPurity: item?.purity ?? rawField(row.rawData, 'purity', 'ความบริสุทธิ์') ?? '-',
    itemWeight: item?.weight ?? rawField(row.rawData, 'weight', 'น้ำหนัก') ?? '0',
    itemQty: String(item?.qty ?? (Number.isFinite(rawItemQty) && rawItemQty > 0 ? rawItemQty : 1)),
    itemUnitPrice: String(
      item?.unitPrice ?? (Number.isFinite(rawItemUnitPrice) ? rawItemUnitPrice : 0),
    ),
    itemNote: item?.note ?? '',
    addr: EMPTY_THAI_ADDRESS,
  };
}

function normalizePaymentMethod(value: unknown): Order['payment'] {
  if (typeof value !== 'string') return 'prepaid';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'cod' || normalized.includes('ปลายทาง')) return 'cod';
  if (normalized.includes('โอนตอนส่ง') || normalized.includes('โอนเมื่อส่ง')) {
    return 'transfer_on_delivery';
  }
  if (
    normalized === 'transfer_on_delivery' ||
    normalized === 'prepaid' ||
    normalized === 'transfer' ||
    normalized === 'paid' ||
    normalized === 'โอน' ||
    normalized === 'โอนแล้ว' ||
    normalized.includes('ชำระแล้ว')
  ) {
    return normalized === 'transfer_on_delivery' ? 'transfer_on_delivery' : 'prepaid';
  }
  return 'prepaid';
}

function toPositiveInt(value: string, fallback = 1) {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function toNonNegativeNumber(value: string, fallback = 0) {
  const next = Number(value.replace(/,/g, ''));
  return Number.isFinite(next) && next >= 0 ? next : fallback;
}

function TabChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: 'accent' | 'muted' | 'success' | 'warning';
}) {
  const activeClass =
    tone === 'success'
      ? 'border-success bg-success/10 text-success'
      : tone === 'warning'
        ? 'border-warning bg-warning/10 text-warning'
        : tone === 'muted'
          ? 'border-foreground/40 text-foreground'
          : 'border-primary bg-primary/5 text-primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? activeClass : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {label} {count}
    </button>
  );
}

function RowStatusBadge({ kind }: { kind: RowKind }) {
  if (kind === 'error') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <XCircle className="h-3 w-3 shrink-0" /> ผิดพลาด
      </span>
    );
  }
  if (kind === 'review') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
        <AlertTriangle className="h-3 w-3 shrink-0" /> รอตรวจ
      </span>
    );
  }
  if (kind === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <XCircle className="h-3 w-3 shrink-0" /> ปฏิเสธ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
      <CheckCircle2 className="h-3 w-3 shrink-0" /> เข้าคิวแล้ว
    </span>
  );
}

const REJECT_REASONS: ImportRejectReason[] = [
  'incomplete_data',
  'duplicate',
  'wrong_group',
  'other',
];

function BatchWorkspace({
  scope,
  batches,
  onOpenOrder,
  onDownloadBatch,
  downloadingBatchId,
}: {
  scope: string; // batchId | 'all'
  batches: ImportBatch[];
  onOpenOrder?: (orderId: string) => void;
  onDownloadBatch: (batch: Pick<ImportBatch, 'id' | 'fileName'>) => void;
  downloadingBatchId: string | null;
}) {
  const { orders, approveImportOrders, rejectImportOrders, restoreImportOrders, syncFromBackend } =
    useRetailStore();
  const [details, setDetails] = useState<ImportBatchDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('review');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<ShippingMethod>('internal_driver');
  const [reason, setReason] = useState<ImportRejectReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [editingRow, setEditingRow] = useState<RowVM | null>(null);
  const [editDraft, setEditDraft] = useState<ImportEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

  const targetBatchIds = useMemo(
    () => (scope === ALL_SCOPE ? batches.map((b) => b.id) : [scope]),
    [scope, batches],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    Promise.all(targetBatchIds.map((id) => fetchImportBatch(id)))
      .then((res) => {
        if (!cancelled) setDetails(res);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error('โหลดรายการนำเข้าไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetBatchIds]);

  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const rows = useMemo<RowVM[]>(
    () =>
      details.flatMap((detail) =>
        detail.rows.map((row) => toRowVM(row, detail.fileName, ordersById)),
      ),
    [details, ordersById],
  );

  const stats = useMemo(() => {
    let review = 0;
    let approved = 0;
    let rejected = 0;
    let error = 0;
    let duplicate = 0;
    let value = 0;
    for (const r of rows) {
      if (r.kind === 'review') review += 1;
      else if (r.kind === 'approved') approved += 1;
      else if (r.kind === 'rejected') rejected += 1;
      else error += 1;
      if (r.duplicateOfCode) duplicate += 1;
      if (r.value) value += r.value;
    }
    return { review, approved, rejected, error, duplicate, value, total: rows.length };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (tab === 'all') return rows;
    if (tab === 'review') return rows.filter((r) => r.kind === 'review' || r.kind === 'error');
    if (tab === 'approved') return rows.filter((r) => r.kind === 'approved');
    return rows.filter((r) => r.kind === 'rejected');
  }, [rows, tab]);

  // เลือกได้เฉพาะแถวที่ยังรอตรวจ (มี order อยู่ใน store)
  const selectableIds = useMemo(
    () =>
      visibleRows
        .filter((r) => r.kind === 'review' && r.orderId && ordersById.has(r.orderId))
        .map((r) => r.orderId!),
    [visibleRows, ordersById],
  );

  const toggle = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableIds));

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      setSelected(new Set());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const bulkApprove = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    void runAction(`อนุมัติเข้าคิว ${ids.length} รายการ · ${shippingMethodLabel[method]}`, () =>
      approveImportOrders(ids, method),
    );
  };

  const bulkReject = () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    void runAction(`ปฏิเสธ ${ids.length} รายการ`, () =>
      rejectImportOrders(ids, reason ? { reason } : undefined),
    );
  };

  const reloadDetails = async () => {
    const res = await Promise.all(targetBatchIds.map((id) => fetchImportBatch(id)));
    setDetails(res);
  };

  const startEditRow = (row: RowVM) => {
    if (!row.orderId) return;
    const draft = draftFromRow(row, ordersById.get(row.orderId));
    setEditingRow(row);
    setEditDraft(draft);
    // ที่อยู่จาก CSV มักมายาว ๆ บรรทัดเดียว → เดา ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ให้อัตโนมัติ
    void applyAutoFill(draft.customerAddress, { silent: true });
  };

  // แยกที่อยู่ยาว ๆ → เติม picker อัตโนมัติ แล้วเหลือเฉพาะบ้านเลขที่/ถนนในช่อง free-text
  const applyAutoFill = async (rawText: string, opts?: { silent?: boolean }) => {
    const raw = rawText.trim();
    if (!raw) return;
    setAutoFilling(true);
    try {
      const parsed = await parseAddress(raw);
      if (!parsed || parsed.score === 0) {
        if (!opts?.silent) toast.error('ไม่สามารถแยกที่อยู่อัตโนมัติได้ กรุณาเลือกเอง');
        return;
      }
      const addr: ThaiAddressValue = {
        province: parsed.province,
        district: parsed.district,
        subdistrict: parsed.subdistrict,
        postalCode: parsed.postalCode,
      };
      setEditDraft((prev) =>
        prev ? { ...prev, addr, customerAddress: extractStreet(raw, addr) } : prev,
      );
      if (!opts?.silent) toast.success('แยกที่อยู่อัตโนมัติแล้ว — ตรวจสอบความถูกต้องอีกครั้ง');
    } catch {
      if (!opts?.silent) toast.error('แยกที่อยู่ไม่สำเร็จ');
    } finally {
      setAutoFilling(false);
    }
  };

  const saveEditRow = async () => {
    if (!editingRow?.orderId || !editDraft) return;
    // customerAddress = ส่วน free-text, addr = ที่เลือกจาก picker → รวมเป็นที่อยู่เต็ม
    const fullAddress = composeThaiAddress(editDraft.customerAddress, editDraft.addr);
    const missing = [
      !editDraft.customerName.trim() && 'ชื่อผู้รับ',
      !editDraft.customerPhone.trim() && 'เบอร์โทร',
      !fullAddress.trim() && 'ที่อยู่',
      !editDraft.itemName.trim() && 'สินค้า',
    ].filter(Boolean);
    if (missing.length > 0) {
      toast.error(`กรอกข้อมูลให้ครบก่อนบันทึก: ${missing.join(', ')}`);
      return;
    }

    setSavingEdit(true);
    try {
      await updateImportedOrder(editingRow.orderId, {
        rawData: editDraft.rawData,
        customer: {
          name: editDraft.customerName.trim(),
          phone: editDraft.customerPhone.trim(),
          address: fullAddress.trim(),
          idCard: editDraft.customerIdCard.trim() || undefined,
        },
        item: {
          sku: editDraft.itemSku.trim() || '-',
          name: editDraft.itemName.trim() || 'สินค้า',
          purity: editDraft.itemPurity.trim() || '-',
          weight: editDraft.itemWeight.trim() || '0',
          qty: toPositiveInt(editDraft.itemQty),
          unitPrice: toNonNegativeNumber(editDraft.itemUnitPrice),
          note: editDraft.itemNote.trim() || undefined,
        },
        totalValue: toNonNegativeNumber(editDraft.totalValue),
        payment: normalizePaymentMethod(editDraft.payment),
        note: editDraft.note.trim() || null,
      });
      await Promise.all([reloadDetails(), syncFromBackend()]);
      toast.success('บันทึกข้อมูลจาก CSV แล้ว');
      setEditingRow(null);
      setEditDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (details.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูลนำเข้า</div>;
  }

  const title = scope === ALL_SCOPE ? `รวมทุกไฟล์ (${details.length})` : details[0].fileName;
  const showFile = scope === ALL_SCOPE;
  const errorSummary = scope === ALL_SCOPE ? null : details[0].errorSummary;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header + summary */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            {scope === ALL_SCOPE ? (
              <Layers className="h-4 w-4 text-primary" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 text-success" />
            )}
            <span className="text-sm font-medium">{title}</span>
            <Badge variant="muted" className="text-[10px]">
              LINE Group
            </Badge>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="h-3 w-3 text-warning" />
            {stats.total} แถว · มูลค่ารวม {formatTHB(stats.value)}
          </div>
        </div>
        {scope !== ALL_SCOPE && details[0] && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={downloadingBatchId === details[0].id}
            onClick={() => onDownloadBatch(details[0])}
          >
            {downloadingBatchId === details[0].id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export CSV
          </Button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-warning/10 p-2.5 text-center">
          <div className="text-lg font-bold text-warning">{stats.review}</div>
          <div className="text-[11px] text-muted-foreground">รอตรวจ</div>
        </div>
        <div className="rounded-lg bg-success/10 p-2.5 text-center">
          <div className="text-lg font-bold text-success">{stats.approved}</div>
          <div className="text-[11px] text-muted-foreground">เข้าคิวแล้ว</div>
        </div>
        <div className="rounded-lg bg-muted p-2.5 text-center">
          <div className="text-lg font-bold text-muted-foreground">{stats.rejected}</div>
          <div className="text-[11px] text-muted-foreground">ปฏิเสธ</div>
        </div>
        <div className="rounded-lg bg-destructive/10 p-2.5 text-center">
          <div className="text-lg font-bold text-destructive">{stats.error + stats.duplicate}</div>
          <div className="text-[11px] text-muted-foreground">ผิดพลาด/ซ้ำ</div>
        </div>
      </div>

      {/* status tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TabChip
          active={tab === 'review'}
          onClick={() => setTab('review')}
          label="รอตรวจ"
          count={stats.review + stats.error}
          tone="warning"
        />
        <TabChip
          active={tab === 'approved'}
          onClick={() => setTab('approved')}
          label="อนุมัติแล้ว"
          count={stats.approved}
          tone="success"
        />
        <TabChip
          active={tab === 'rejected'}
          onClick={() => setTab('rejected')}
          label="ปฏิเสธ"
          count={stats.rejected}
          tone="muted"
        />
        <TabChip
          active={tab === 'all'}
          onClick={() => setTab('all')}
          label="ทั้งหมด"
          count={stats.total}
          tone="accent"
        />
      </div>

      {/* table */}
      <div
        className={cn(
          'mt-3 overflow-auto rounded-lg border',
          editingRow ? 'max-h-56 flex-none' : 'min-h-0 flex-1',
        )}
      >
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="text-left text-muted-foreground">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="เลือกทั้งหมดที่รอตรวจ"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  className="h-3.5 w-3.5 align-middle"
                />
              </th>
              <th className="w-24 px-2 py-2 font-medium">สถานะ</th>
              <th className="px-2 py-2 font-medium">ผู้รับ / ที่อยู่</th>
              <th className="w-20 px-2 py-2 text-right font-medium">มูลค่า</th>
              <th className="w-[220px] px-2 py-2 text-right font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  ไม่มีรายการในกลุ่มนี้
                </td>
              </tr>
            )}
            {visibleRows.map((r) => {
              const selectable = r.kind === 'review' && !!r.orderId && ordersById.has(r.orderId);
              const checked = !!r.orderId && selected.has(r.orderId);
              const editable = !!r.orderId && r.kind !== 'error';
              return (
                <tr
                  key={r.rowId}
                  className={cn(
                    'transition-colors hover:bg-muted/40',
                    checked && 'bg-primary/5',
                    r.duplicateOfCode && 'bg-destructive/5',
                  )}
                >
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="checkbox"
                      aria-label={`เลือกแถว ${r.rowIndex + 1}`}
                      checked={checked}
                      disabled={!selectable}
                      onChange={() => r.orderId && toggle(r.orderId)}
                      className="mt-0.5 h-3.5 w-3.5 disabled:opacity-30"
                    />
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <RowStatusBadge kind={r.kind} />
                  </td>
                  <td className="min-w-0 px-2 py-2.5 align-top">
                    <div className="truncate font-medium">
                      {r.name}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                        {showFile
                          ? `· ${r.fileName} · แถว ${r.rowIndex + 1}`
                          : `· แถว ${r.rowIndex + 1}`}
                      </span>
                    </div>
                    {r.duplicateOfCode ? (
                      <div className="flex items-center gap-1 text-[11px] text-destructive">
                        <Copy className="h-3 w-3" /> ซ้ำกับ {r.duplicateOfCode}
                      </div>
                    ) : (
                      <div className="truncate text-muted-foreground">
                        {r.kind === 'error' && r.errorMessage ? (
                          <span className="text-destructive">{r.errorMessage}</span>
                        ) : (
                          r.address
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right align-top tabular-nums">
                    {r.value != null ? formatTHB(r.value) : '—'}
                  </td>
                  <td className="px-2 py-2.5 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {editable && (
                        <button
                          type="button"
                          disabled={busy || savingEdit}
                          onClick={() => startEditRow(r)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-40"
                        >
                          <Pencil className="h-3 w-3" />
                          แก้ไข
                        </button>
                      )}
                      {r.kind === 'review' && r.orderId && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction('อนุมัติเข้าคิว 1 รายการ', () =>
                                approveImportOrders([r.orderId!], method),
                              )
                            }
                            className="rounded-md border border-success/60 px-2 py-1 text-[11px] font-medium text-success hover:bg-success/10 disabled:opacity-40"
                          >
                            อนุมัติ
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runAction('ปฏิเสธ 1 รายการ', () => rejectImportOrders([r.orderId!]))
                            }
                            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40"
                          >
                            ปฏิเสธ
                          </button>
                        </>
                      )}
                      {r.kind === 'rejected' && r.orderId && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            runAction('ดึงกลับ 1 รายการ', () => restoreImportOrders([r.orderId!]))
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-40"
                        >
                          <RotateCcw className="h-3 w-3" /> ดึงกลับ
                        </button>
                      )}
                      {r.orderId && onOpenOrder && (
                        <button
                          type="button"
                          aria-label="เปิดออเดอร์"
                          onClick={() => onOpenOrder(r.orderId!)}
                          className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-primary"
                        >
                          เปิด
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingRow && editDraft && (
        <div className="mt-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">แก้ไขข้อมูลจาก CSV</div>
              <div className="text-xs text-muted-foreground">
                {editingRow.fileName} · แถวที่ {editingRow.rowIndex + 1}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={savingEdit}
                onClick={() => {
                  setEditingRow(null);
                  setEditDraft(null);
                }}
              >
                ยกเลิก
              </Button>
              <Button type="button" size="sm" disabled={savingEdit} onClick={saveEditRow}>
                {savingEdit ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                บันทึก
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">ชื่อผู้รับ</span>
              <input
                value={editDraft.customerName}
                onChange={(e) => setEditDraft({ ...editDraft, customerName: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">เบอร์โทร</span>
              <input
                value={editDraft.customerPhone}
                onChange={(e) => setEditDraft({ ...editDraft, customerPhone: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">เลขบัตร</span>
              <input
                value={editDraft.customerIdCard}
                onChange={(e) => setEditDraft({ ...editDraft, customerIdCard: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <div className="space-y-2 text-xs md:col-span-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">ที่อยู่ (บ้านเลขที่ / ถนน)</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={autoFilling || !editDraft.customerAddress.trim()}
                  onClick={() => applyAutoFill(editDraft.customerAddress)}
                  title="แยกตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ จากข้อความที่อยู่อัตโนมัติ"
                >
                  {autoFilling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  เติมอัตโนมัติ
                </Button>
              </div>
              <input
                value={editDraft.customerAddress}
                onChange={(e) => setEditDraft({ ...editDraft, customerAddress: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
              <ThaiAddressPicker
                value={editDraft.addr}
                onChange={(addr) => setEditDraft({ ...editDraft, addr })}
              />
              <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-muted-foreground">
                ที่อยู่เต็ม: {composeThaiAddress(editDraft.customerAddress, editDraft.addr) || '—'}
              </p>
            </div>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">มูลค่ารวม</span>
              <input
                inputMode="decimal"
                value={editDraft.totalValue}
                onChange={(e) => setEditDraft({ ...editDraft, totalValue: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">การชำระเงิน</span>
              <select
                value={editDraft.payment}
                onChange={(e) =>
                  setEditDraft({ ...editDraft, payment: e.target.value as Order['payment'] })
                }
                className="h-8 w-full rounded-md border bg-background px-2"
              >
                <option value="prepaid">โอนแล้ว</option>
                <option value="cod">เก็บเงินปลายทาง</option>
                <option value="transfer_on_delivery">โอนตอนส่ง</option>
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">หมายเหตุ</span>
              <input
                value={editDraft.note}
                onChange={(e) => setEditDraft({ ...editDraft, note: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-6">
            <label className="space-y-1 text-xs md:col-span-2">
              <span className="text-muted-foreground">สินค้า</span>
              <input
                value={editDraft.itemName}
                onChange={(e) => setEditDraft({ ...editDraft, itemName: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">SKU</span>
              <input
                value={editDraft.itemSku}
                onChange={(e) => setEditDraft({ ...editDraft, itemSku: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Purity</span>
              <input
                value={editDraft.itemPurity}
                onChange={(e) => setEditDraft({ ...editDraft, itemPurity: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">น้ำหนัก</span>
              <input
                value={editDraft.itemWeight}
                onChange={(e) => setEditDraft({ ...editDraft, itemWeight: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">จำนวน</span>
              <input
                inputMode="numeric"
                value={editDraft.itemQty}
                onChange={(e) => setEditDraft({ ...editDraft, itemQty: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">ราคา/ชิ้น</span>
              <input
                inputMode="decimal"
                value={editDraft.itemUnitPrice}
                onChange={(e) => setEditDraft({ ...editDraft, itemUnitPrice: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2"
              />
            </label>
          </div>

          <div className="mt-3 rounded-md border bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
              <div className="text-xs font-medium">คอลัมน์ CSV ต้นทาง</div>
              <div className="text-[11px] text-muted-foreground">
                {Object.keys(editDraft.rawData).length} คอลัมน์
              </div>
            </div>
            <div className="divide-y">
              {Object.entries(editDraft.rawData).map(([key, value]) => (
                <div key={key} className="grid gap-2 px-3 py-2 md:grid-cols-[180px_1fr]">
                  <div className="min-w-0 break-words rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {key}
                  </div>
                  <textarea
                    value={value}
                    rows={value.length > 48 || value.includes('\n') ? 2 : 1}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        rawData: { ...editDraft.rawData, [key]: e.target.value },
                      })
                    }
                    className="min-h-8 w-full min-w-0 resize-y rounded-md border bg-background px-2 py-1.5 font-mono text-xs leading-5"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {errorSummary && stats.error > 0 && tab !== 'approved' && tab !== 'rejected' && (
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <div className="mb-1 text-[11px] font-medium text-destructive">สาเหตุข้อผิดพลาด</div>
          <pre className="whitespace-pre-wrap text-[10px] text-destructive/80">{errorSummary}</pre>
        </div>
      )}

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2">
          <span className="text-xs font-medium text-primary">เลือก {selected.size} รายการ</span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as ShippingMethod)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="internal_driver">คนขับภายใน</option>
              <option value="thai_post">ไปรษณีย์ไทย</option>
            </select>
            <Button size="sm" disabled={busy} onClick={bulkApprove}>
              <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ ({selected.size})
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as ImportRejectReason | '')}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">เหตุผล (ไม่บังคับ)</option>
              {REJECT_REASONS.map((value) => (
                <option key={value} value={value}>
                  {importRejectReasonLabel[value]}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" disabled={busy} onClick={bulkReject}>
              <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportBatchPanel({
  onOpenOrder,
}: {
  onOpenOrder?: (orderId: string) => void;
}) {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [selectedId, setSelectedId] = useState<string>(ALL_SCOPE);
  const [loading, setLoading] = useState(true);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);

  const exportBatchCsv = async (batch: Pick<ImportBatch, 'id' | 'fileName'>) => {
    setDownloadingBatchId(batch.id);
    try {
      const result = await downloadImportBatchCsv(batch.id);
      downloadCsv(result.fileName ?? batch.fileName, result.content);
      toast.success(`บันทึกไฟล์ ${result.fileName ?? batch.fileName} แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export CSV ไม่สำเร็จ');
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const load = () => {
    setLoading(true);
    fetchImportBatches({ limit: 30 })
      .then((res) => setBatches(res.batches))
      .catch((error) => {
        console.error(error);
        toast.error('โหลดประวัติการนำเข้าไม่สำเร็จ');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const hasBatches = batches.length > 0;
  const workspaceKey =
    selectedId === ALL_SCOPE ? `all:${batches.map((b) => b.id).join(',')}` : selectedId;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="flex h-[calc(100vh-16rem)] flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">ประวัติการนำเข้า LINE</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="flex-1 space-y-2 overflow-auto p-3">
          {loading && batches.length === 0 && (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && !hasBatches && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              ยังไม่มีการนำเข้าไฟล์
              <div className="mt-1 text-[11px]">ส่งไฟล์ .csv ใน LINE Group เพื่อเริ่มต้น</div>
            </div>
          )}
          {hasBatches && (
            <button
              type="button"
              onClick={() => setSelectedId(ALL_SCOPE)}
              className={cn(
                'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                selectedId === ALL_SCOPE ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Layers className="h-3.5 w-3.5 text-primary" /> ทุกไฟล์ (รวม)
              </span>
              <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                {batches.length} ไฟล์
              </Badge>
            </button>
          )}
          {batches.map((batch) => (
            <BatchListItem
              key={batch.id}
              batch={batch}
              selected={selectedId === batch.id}
              onClick={() => setSelectedId(batch.id)}
              onDownload={() => void exportBatchCsv(batch)}
              downloading={downloadingBatchId === batch.id}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="h-[calc(100vh-16rem)] overflow-auto p-4">
        {hasBatches ? (
          <BatchWorkspace
            key={workspaceKey}
            scope={selectedId}
            batches={batches}
            onOpenOrder={onOpenOrder}
            onDownloadBatch={(batch) => void exportBatchCsv(batch)}
            downloadingBatchId={downloadingBatchId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" /> ยังไม่มีไฟล์นำเข้า
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
