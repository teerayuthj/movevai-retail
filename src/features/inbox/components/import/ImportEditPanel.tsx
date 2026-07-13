import { toast } from 'sonner';
import { CheckCircle2, Copy, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import type { Order } from '@/data/orderTypes';
import ThaiAddressPicker from '@/components/ThaiAddressPicker';
import { composeThaiAddress } from '@/lib/thaiAddress';
import { displayOcrText, type RowVM } from '@/features/inbox/utils/importCardModel';
import {
  toPositiveInt,
  type ImportEditDraft,
  type ImportItemDraft,
} from '@/features/inbox/utils/importEditDraft';
import {
  copyTextToClipboard,
  ocrDisplayLines,
  ocrPlainText,
} from '@/features/inbox/utils/importOcr';
import { visibleRawEntries } from '@/features/inbox/utils/importRawFields';

// ฟอร์ม "แก้ไขข้อมูลจาก LINE import" — ข้อมูลลูกค้า/นัดส่ง + ตาราง SKU + กล่อง OCR + ข้อมูลต้นทาง
export function ImportEditPanel({
  row,
  draft,
  saving,
  autoFilling,
  onDraftChange,
  onAutoFill,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onCancel,
  onSave,
}: {
  row: RowVM;
  draft: ImportEditDraft;
  saving: boolean;
  autoFilling: boolean;
  onDraftChange: (draft: ImportEditDraft) => void;
  onAutoFill: (address: string) => void;
  onUpdateItem: (index: number, patch: Partial<ImportItemDraft>) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">แก้ไขข้อมูลจาก LINE import</div>
          <div className="text-xs text-muted-foreground">
            {row.fileName} · แถวที่ {row.rowIndex + 1}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={saving} onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={onSave}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            บันทึก
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">ชื่อผู้รับ</span>
          <input
            value={draft.customerName}
            onChange={(e) => onDraftChange({ ...draft, customerName: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">เบอร์โทร</span>
          <input
            value={draft.customerPhone}
            onChange={(e) => onDraftChange({ ...draft, customerPhone: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">เลขบัตร</span>
          <input
            value={draft.customerIdCard}
            onChange={(e) => onDraftChange({ ...draft, customerIdCard: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
        </label>
        <div className="space-y-2 text-xs md:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">ที่อยู่ (บ้านเลขที่ / ถนน)</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={autoFilling || !draft.customerAddress.trim()}
              onClick={() => onAutoFill(draft.customerAddress)}
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
            value={draft.customerAddress}
            onChange={(e) => onDraftChange({ ...draft, customerAddress: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
          <ThaiAddressPicker
            value={draft.addr}
            onChange={(addr) => onDraftChange({ ...draft, addr })}
          />
          <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-muted-foreground">
            ที่อยู่เต็ม: {composeThaiAddress(draft.customerAddress, draft.addr) || '—'}
          </p>
        </div>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">มูลค่ารวม</span>
          <input
            inputMode="decimal"
            value={draft.totalValue}
            onChange={(e) => onDraftChange({ ...draft, totalValue: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">วันนัดส่ง</span>
          <DatePicker
            size="sm"
            value={draft.deliveryDate}
            disablePastDates
            onChange={(value) => onDraftChange({ ...draft, deliveryDate: value })}
            className="w-full"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">เวลานัดส่ง</span>
          <input
            type="time"
            value={draft.deliveryTime}
            onChange={(e) => onDraftChange({ ...draft, deliveryTime: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">การชำระเงิน</span>
          <Select
            value={draft.payment}
            onChange={(e) =>
              onDraftChange({ ...draft, payment: e.target.value as Order['payment'] })
            }
            className="h-8"
          >
            <option value="prepaid">โอนแล้ว</option>
            <option value="cod">เก็บเงินปลายทาง</option>
            <option value="transfer_on_delivery">โอนตอนส่ง</option>
          </Select>
        </label>
        <label className="space-y-1 text-xs md:col-span-4">
          <span className="text-muted-foreground">หมายเหตุ</span>
          <input
            value={draft.note}
            onChange={(e) => onDraftChange({ ...draft, note: e.target.value })}
            className="h-8 w-full rounded-md border bg-background px-3"
          />
        </label>
      </div>

      <div className="mt-3 rounded-md border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-xs font-medium">
            สินค้าในออเดอร์
            <span className="ml-1.5 font-normal text-muted-foreground">
              {draft.items.length.toLocaleString('th-TH')} SKU ·{' '}
              {draft.items
                .reduce((sum, item) => sum + toPositiveInt(item.qty), 0)
                .toLocaleString('th-TH')}{' '}
              ชิ้น
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            disabled={saving}
            onClick={onAddItem}
          >
            <Plus className="h-3 w-3" /> เพิ่ม SKU
          </Button>
        </div>
        <div className="hidden gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground md:grid md:grid-cols-[2fr_1fr_1fr_1fr_72px_1fr_32px]">
          <span>สินค้า</span>
          <span>SKU</span>
          <span>Purity</span>
          <span>น้ำหนัก</span>
          <span>จำนวน</span>
          <span>ราคา/ชิ้น</span>
          <span />
        </div>
        <div className="divide-y">
          {draft.items.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 px-3 py-2 md:grid-cols-[2fr_1fr_1fr_1fr_72px_1fr_32px] md:items-center"
            >
              <input
                value={item.name}
                placeholder="ชื่อสินค้า"
                aria-label={`สินค้า SKU ที่ ${index + 1}`}
                onChange={(e) => onUpdateItem(index, { name: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3 text-xs"
              />
              <input
                value={item.sku}
                placeholder="SKU"
                aria-label={`รหัส SKU ที่ ${index + 1}`}
                onChange={(e) => onUpdateItem(index, { sku: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3 text-xs"
              />
              <input
                value={item.purity}
                placeholder="Purity"
                aria-label={`Purity SKU ที่ ${index + 1}`}
                onChange={(e) => onUpdateItem(index, { purity: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3 text-xs"
              />
              <input
                value={item.weight}
                placeholder="น้ำหนัก"
                aria-label={`น้ำหนัก SKU ที่ ${index + 1}`}
                onChange={(e) => onUpdateItem(index, { weight: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3 text-xs"
              />
              <input
                inputMode="numeric"
                value={item.qty}
                placeholder="จำนวน"
                aria-label={`จำนวน SKU ที่ ${index + 1}`}
                onChange={(e) => onUpdateItem(index, { qty: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3 text-xs"
              />
              <input
                inputMode="decimal"
                value={item.unitPrice}
                placeholder="ราคา/ชิ้น"
                aria-label={`ราคาต่อชิ้น SKU ที่ ${index + 1}`}
                onChange={(e) => onUpdateItem(index, { unitPrice: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-3 text-xs"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 justify-self-end text-muted-foreground hover:text-destructive"
                aria-label={`ลบ SKU ที่ ${index + 1}`}
                disabled={saving || draft.items.length <= 1}
                onClick={() => onRemoveItem(index)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {row.ocrText && (
        <div className="mt-3 rounded-md border bg-background">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="text-xs font-medium">ข้อความ OCR จากรูป</div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="คัดลอกข้อความ OCR ทั้งหมด"
              className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={async () => {
                const copied = await copyTextToClipboard(ocrPlainText(displayOcrText(row)));
                if (copied) {
                  toast.success('คัดลอกข้อความ OCR ทั้งหมดแล้ว');
                } else {
                  toast.error('คัดลอกไม่สำเร็จ — กรุณาเลือกข้อความแล้วคัดลอกเอง');
                }
              }}
            >
              <Copy className="h-3 w-3" /> คัดลอกทั้งหมด
            </Button>
          </div>
          <div
            className="min-h-24 w-full max-w-full resize overflow-auto px-3 py-2 text-xs leading-5"
            style={{
              height: `${Math.min(13, Math.max(6, ocrDisplayLines(displayOcrText(row)).length * 1.25 + 1.5))}rem`,
            }}
          >
            {ocrDisplayLines(displayOcrText(row)).map((line, index) =>
              line.kind === 'blank' ? (
                <div key={index} className="h-2" />
              ) : line.kind === 'heading' ? (
                <div key={index} className="mt-1 font-semibold first:mt-0">
                  {line.text}
                </div>
              ) : line.kind === 'bullet' ? (
                <div key={index} className="flex gap-1.5">
                  <span className="shrink-0 text-muted-foreground">•</span>
                  <span className="min-w-0 break-words">{line.text}</span>
                </div>
              ) : (
                <div key={index} className="break-words">
                  {line.text}
                </div>
              ),
            )}
          </div>
        </div>
      )}

      <div className="mt-3 rounded-md border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <div className="text-xs font-medium">ข้อมูลต้นทาง</div>
          <div className="text-[11px] text-muted-foreground">
            {visibleRawEntries(draft.rawData).length} คอลัมน์
          </div>
        </div>
        <div className="divide-y">
          {visibleRawEntries(draft.rawData).map(([key, value]) => (
            <div key={key} className="grid gap-2 px-3 py-2 md:grid-cols-[180px_1fr]">
              <div className="min-w-0 break-words rounded-md bg-muted/50 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                {key}
              </div>
              <textarea
                value={value}
                rows={value.length > 48 || value.includes('\n') ? 2 : 1}
                onChange={(e) =>
                  onDraftChange({ ...draft, rawData: { ...draft.rawData, [key]: e.target.value } })
                }
                className="min-h-8 w-full min-w-0 resize-y rounded-md border bg-background px-3 py-1.5 font-mono text-xs leading-5"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
