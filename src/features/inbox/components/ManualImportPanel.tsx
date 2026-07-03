import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { formatTHB, paymentLabel, shippingMethodLabel, type Order } from '@/data/orderTypes';
import { parseCsv } from '@/lib/csvScriptTransform';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import type { ManualImportOrderInput } from '@/state/retail/manualImport';

type ManualRow = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerIdCard: string;
  itemName: string;
  itemSku: string;
  itemPurity: string;
  itemWeight: string;
  itemQty: string;
  itemUnitPrice: string;
  totalValue: string;
  payment: Order['payment'];
  shippingMethod: ManualImportOrderInput['shippingMethod'];
  note: string;
  requiresIdCheck: boolean;
  insured: boolean;
  rawData?: Record<string, string>;
};

const SAMPLE_CSV = [
  'customerName,customerPhone,customerAddress,itemName,itemQty,itemUnitPrice,totalValue,payment,shippingMethod,note',
  'คุณสมชาย,0812345678,99 ถ.เยาวราช แขวงจักรวรรดิ เขตสัมพันธวงศ์ กทม. 10100,AUSIRIS ทองคำแท่ง 96.5%,1,45200,45200,prepaid,internal_driver,ส่งช่วงบ่าย',
].join('\n');

function newRow(seed?: Partial<ManualRow>): ManualRow {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerIdCard: '',
    itemName: '',
    itemSku: '',
    itemPurity: '96.5%',
    itemWeight: '1 บาท',
    itemQty: '1',
    itemUnitPrice: '0',
    totalValue: '0',
    payment: 'prepaid',
    shippingMethod: 'internal_driver',
    note: '',
    requiresIdCheck: true,
    insured: true,
    ...seed,
  };
}

function rawField(raw: Record<string, string>, ...keys: string[]) {
  const normalized = Object.entries(raw).map(([key, value]) => [
    key.toLowerCase().replace(/[\s_-]+/g, ''),
    value,
  ]);
  for (const key of keys) {
    const wanted = key.toLowerCase().replace(/[\s_-]+/g, '');
    const found = normalized.find(([rawKey]) => rawKey === wanted);
    if (found?.[1]) return found[1];
  }
  return '';
}

function toNumber(value: string, fallback = 0) {
  const next = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(next) ? next : fallback;
}

function toPositiveInt(value: string, fallback = 1) {
  const next = Number.parseInt(value.replace(/,/g, '').trim(), 10);
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function normalizePayment(value: string): Order['payment'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'cod' || normalized.includes('ปลายทาง')) return 'cod';
  if (normalized === 'transfer_on_delivery' || normalized.includes('โอนเมื่อรับ')) {
    return 'transfer_on_delivery';
  }
  return 'prepaid';
}

function normalizeShipping(value: string): ManualImportOrderInput['shippingMethod'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'thai_post' || normalized.includes('ไปรษณีย์')) return 'thai_post';
  return 'internal_driver';
}

function rowFromRaw(raw: Record<string, string>): ManualRow {
  const qty = rawField(raw, 'itemQty', 'qty', 'quantity', 'จำนวน') || '1';
  const unitPrice = rawField(raw, 'itemUnitPrice', 'unitPrice', 'price', 'ราคา') || '0';
  const total =
    rawField(raw, 'totalValue', 'total', 'amount', 'ราคารวม', 'มูลค่า') ||
    String(toPositiveInt(qty) * Math.max(0, toNumber(unitPrice)));

  return newRow({
    customerName: rawField(raw, 'customerName', 'name', 'receiver', 'ชื่อผู้รับ', 'ชื่อลูกค้า'),
    customerPhone: rawField(raw, 'customerPhone', 'phone', 'tel', 'เบอร์โทร', 'เบอร์'),
    customerAddress: rawField(raw, 'customerAddress', 'address', 'ที่อยู่', 'receiverAddress'),
    customerIdCard: rawField(raw, 'idCard', 'เลขบัตร', 'บัตรประชาชน'),
    itemName: rawField(raw, 'itemName', 'item', 'product', 'สินค้า', 'ชื่อสินค้า'),
    itemSku: rawField(raw, 'sku', 'itemSku', 'รหัสสินค้า'),
    itemPurity: rawField(raw, 'purity', 'ความบริสุทธิ์') || '96.5%',
    itemWeight: rawField(raw, 'weight', 'น้ำหนัก') || '1 บาท',
    itemQty: qty,
    itemUnitPrice: unitPrice,
    totalValue: total,
    payment: normalizePayment(rawField(raw, 'payment', 'การชำระ', 'ชำระ')),
    shippingMethod: normalizeShipping(rawField(raw, 'shippingMethod', 'delivery', 'จัดส่ง')),
    note: rawField(raw, 'note', 'หมายเหตุ'),
    rawData: raw,
  });
}

function rowIssues(row: ManualRow) {
  return [
    !row.customerName.trim() && 'ชื่อผู้รับ',
    !row.customerAddress.trim() && 'ที่อยู่',
    !row.itemName.trim() && 'สินค้า',
    toPositiveInt(row.itemQty, 0) <= 0 && 'จำนวน',
  ].filter(Boolean) as string[];
}

function toManualInput(row: ManualRow): ManualImportOrderInput {
  const qty = toPositiveInt(row.itemQty);
  const unitPrice = Math.max(0, toNumber(row.itemUnitPrice));
  const totalValue = Math.max(0, toNumber(row.totalValue, qty * unitPrice));

  return {
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerAddress: row.customerAddress,
    customerIdCard: row.customerIdCard,
    itemName: row.itemName,
    itemSku: row.itemSku,
    itemPurity: row.itemPurity,
    itemWeight: row.itemWeight,
    itemQty: qty,
    itemUnitPrice: unitPrice,
    totalValue: totalValue || qty * unitPrice,
    payment: row.payment,
    shippingMethod: row.shippingMethod,
    note: row.note,
    rawData: row.rawData,
    requiresIdCheck: row.requiresIdCheck,
    insured: row.insured,
  };
}

function RowInput({
  value,
  onChange,
  className,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  inputMode?: 'numeric' | 'decimal' | 'tel';
}) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      className={cn('h-8 w-full rounded-md border bg-background px-3 text-xs', className)}
    />
  );
}

export default function ManualImportPanel({
  onOpenOrder,
}: {
  onOpenOrder?: (orderId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { createManualImportOrders } = useRetailStore();
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<ManualRow[]>(() => [newRow()]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const stats = useMemo(() => {
    let ready = 0;
    let value = 0;
    for (const row of rows) {
      if (rowIssues(row).length === 0) ready += 1;
      value += Math.max(0, toNumber(row.totalValue));
    }
    return { ready, blocked: rows.length - ready, value };
  }, [rows]);

  const applyCsv = (text: string) => {
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      toast.error('ไม่พบรายการใน CSV');
      return;
    }
    setRows(parsed.rows.map(rowFromRaw));
    toast.success(`โหลด preview จาก CSV ${parsed.rows.length} รายการ`);
  };

  const readFile = (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Manual import รองรับไฟล์ .csv ในขั้นตอนนี้');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setCsvText(text);
      applyCsv(text);
    };
    reader.onerror = () => toast.error('อ่านไฟล์ไม่สำเร็จ');
    reader.readAsText(file);
  };

  const updateRow = (id: string, patch: Partial<ManualRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    setRows((current) => {
      const next = current.filter((row) => row.id !== id);
      return next.length > 0 ? next : [newRow()];
    });
  };

  const importRows = () => {
    const invalid = rows.filter((row) => rowIssues(row).length > 0);
    if (invalid.length > 0) {
      toast.error(`ยังมีรายการไม่ครบ ${invalid.length} แถว กรุณาแก้หรือลบออกก่อนนำเข้า`);
      return;
    }
    setImporting(true);
    try {
      const createdIds = createManualImportOrders(rows.map(toManualInput));
      toast.success(`นำเข้า Manual Import ${createdIds.length} รายการแล้ว`);
      setRows([newRow()]);
      setCsvText('');
      if (createdIds[0]) onOpenOrder?.(createdIds[0]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Manual Import</div>
              <div className="mt-1 text-xs text-muted-foreground">
                เพิ่มเองหรือวาง CSV แล้วตรวจ preview ก่อนนำเข้า
              </div>
            </div>
            <Badge variant="info">Manual</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              readFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              'rounded-lg border border-dashed bg-muted/40 p-4 text-center transition-colors',
              dragging && 'border-primary bg-primary/5',
            )}
          >
            <UploadCloud className="mx-auto h-5 w-5 text-primary" />
            <div className="mt-2 text-xs font-medium">ลากไฟล์ CSV มาวาง</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              หรือเลือกไฟล์จากเครื่องเพื่อสร้าง preview
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => readFile(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              เลือก CSV
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">วาง CSV</span>
              <button
                type="button"
                className="text-[11px] font-medium text-primary"
                onClick={() => setCsvText(SAMPLE_CSV)}
              >
                ใส่ตัวอย่าง
              </button>
            </div>
            <textarea
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder="customerName,customerPhone,customerAddress,itemName,itemQty,itemUnitPrice,totalValue"
              className="min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!csvText.trim()}
              onClick={() => applyCsv(csvText)}
            >
              สร้าง Preview จาก CSV
            </Button>
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md border bg-muted/40 px-2 py-2">
              <div className="font-semibold">{rows.length}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">ทั้งหมด</div>
            </div>
            <div className="rounded-md border bg-success/10 px-2 py-2">
              <div className="font-semibold text-success">{stats.ready}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">พร้อมนำเข้า</div>
            </div>
            <div className="rounded-md border bg-muted/40 px-2 py-2">
              <div className="font-semibold">{formatTHB(stats.value)}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">มูลค่า</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[calc(100vh-16rem)] overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Preview รายการก่อนนำเข้า</div>
              <div className="mt-1 text-xs text-muted-foreground">
                ออเดอร์จะเข้า Inbox เป็น Manual draft เพื่อแก้ไขและยืนยันเข้าคิวต่อ
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRows([newRow()])}>
                ล้าง
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRows((r) => [...r, newRow()])}
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มแถว
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={importing || rows.length === 0}
                onClick={importRows}
              >
                {importing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                นำเข้า {rows.length} รายการ
              </Button>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <div className="max-h-[calc(100vh-22rem)] overflow-auto">
            <table className="w-full min-w-[1080px] text-xs">
              <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  <th className="w-28 px-3 py-2 font-medium">สถานะ</th>
                  <th className="w-44 px-2 py-2 font-medium">ผู้รับ</th>
                  <th className="w-32 px-2 py-2 font-medium">เบอร์</th>
                  <th className="min-w-72 px-2 py-2 font-medium">ที่อยู่</th>
                  <th className="w-48 px-2 py-2 font-medium">สินค้า</th>
                  <th className="w-20 px-2 py-2 font-medium">จำนวน</th>
                  <th className="w-28 px-2 py-2 font-medium">ราคา/ชิ้น</th>
                  <th className="w-28 px-2 py-2 font-medium">รวม</th>
                  <th className="w-32 px-2 py-2 font-medium">ชำระ</th>
                  <th className="w-32 px-2 py-2 font-medium">จัดส่ง</th>
                  <th className="w-16 px-2 py-2 text-right font-medium">ลบ</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, index) => {
                  const issues = rowIssues(row);
                  const ready = issues.length === 0;
                  return (
                    <tr key={row.id} className={cn(!ready && 'bg-warning/5')}>
                      <td className="px-3 py-2 align-top">
                        {ready ? (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            พร้อม
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            ขาด {issues.length}
                          </Badge>
                        )}
                        {!ready && (
                          <div className="mt-1 text-[10px] text-warning">
                            แถว {index + 1}: {issues.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <RowInput
                          value={row.customerName}
                          onChange={(customerName) => updateRow(row.id, { customerName })}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <RowInput
                          value={row.customerPhone}
                          inputMode="tel"
                          onChange={(customerPhone) => updateRow(row.id, { customerPhone })}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <RowInput
                          value={row.customerAddress}
                          onChange={(customerAddress) => updateRow(row.id, { customerAddress })}
                        />
                      </td>
                      <td className="space-y-1 px-2 py-2 align-top">
                        <RowInput
                          value={row.itemName}
                          onChange={(itemName) => updateRow(row.id, { itemName })}
                        />
                        <div className="grid grid-cols-3 gap-1">
                          <RowInput
                            value={row.itemSku}
                            onChange={(itemSku) => updateRow(row.id, { itemSku })}
                          />
                          <RowInput
                            value={row.itemPurity}
                            onChange={(itemPurity) => updateRow(row.id, { itemPurity })}
                          />
                          <RowInput
                            value={row.itemWeight}
                            onChange={(itemWeight) => updateRow(row.id, { itemWeight })}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <RowInput
                          value={row.itemQty}
                          inputMode="numeric"
                          onChange={(itemQty) => updateRow(row.id, { itemQty })}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <RowInput
                          value={row.itemUnitPrice}
                          inputMode="decimal"
                          onChange={(itemUnitPrice) => {
                            const qty = toPositiveInt(row.itemQty);
                            updateRow(row.id, {
                              itemUnitPrice,
                              totalValue: String(qty * Math.max(0, toNumber(itemUnitPrice))),
                            });
                          }}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <RowInput
                          value={row.totalValue}
                          inputMode="decimal"
                          onChange={(totalValue) => updateRow(row.id, { totalValue })}
                        />
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Select
                          value={row.payment}
                          onChange={(event) =>
                            updateRow(row.id, { payment: event.target.value as Order['payment'] })
                          }
                          className="h-8 text-xs"
                        >
                          {Object.entries(paymentLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <Select
                          value={row.shippingMethod}
                          onChange={(event) =>
                            updateRow(row.id, {
                              shippingMethod: event.target
                                .value as ManualImportOrderInput['shippingMethod'],
                            })
                          }
                          className="h-8 text-xs"
                        >
                          {Object.entries(shippingMethodLabel).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-2 py-2 text-right align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeRow(row.id)}
                          aria-label={`ลบแถว ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stats.blocked > 0 && (
            <div className="border-t bg-warning/5 px-4 py-2 text-xs text-warning">
              ยังนำเข้าไม่ได้จนกว่าจะแก้หรือลบแถวที่ข้อมูลไม่ครบ {stats.blocked} รายการ
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
