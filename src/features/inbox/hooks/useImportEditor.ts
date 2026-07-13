import { useState } from 'react';
import { toast } from 'sonner';
import type { Order } from '@/data/orderTypes';
import {
  addOrderActivity,
  parseAddress,
  updateImportedOrder,
  type ImportOrderItemInput,
} from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';
import { composeThaiAddress, extractStreet, type ThaiAddressValue } from '@/lib/thaiAddress';
import {
  buildNoteWithRequestedDelivery,
  getRequestedDeliveryDraft,
} from '@/features/inbox/utils/orderSchedule';
import {
  EMPTY_ITEM_DRAFT,
  draftFromRow,
  fillMissingPostalCode,
  normalizePaymentMethod,
  toNonNegativeNumber,
  toPositiveInt,
  type ImportEditDraft,
  type ImportItemDraft,
} from '@/features/inbox/utils/importEditDraft';
import {
  SOURCE_EXTRACTION_CONFIDENCE_COLUMN,
  SOURCE_MISSING_FIELDS_COLUMN,
} from '@/features/inbox/utils/importRawFields';
import type { RowVM } from '@/features/inbox/utils/importCardModel';

export type ImportEditorState = ReturnType<typeof useImportEditor>;

// state + logic ของฟอร์ม "แก้ไขข้อมูลจาก LINE import" — เปิดแถว, autofill ที่อยู่, แก้ draft, บันทึก
export function useImportEditor({
  ordersById,
  reloadEntries,
}: {
  ordersById: Map<string, Order>;
  reloadEntries: () => Promise<void>;
}) {
  const { syncFromBackend } = useRetailStore();
  const [editingRow, setEditingRow] = useState<RowVM | null>(null);
  const [editDraft, setEditDraft] = useState<ImportEditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);

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

  const startEditRow = (row: RowVM) => {
    if (!row.orderId) return;
    const draft = draftFromRow(row, ordersById.get(row.orderId));
    setEditingRow(row);
    setEditDraft(draft);
    // ที่อยู่จาก CSV มักมายาว ๆ บรรทัดเดียว → เดา ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์ ให้อัตโนมัติ
    void applyAutoFill(draft.customerAddress, { silent: true });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditDraft(null);
  };

  const updateItemDraft = (index: number, patch: Partial<ImportItemDraft>) => {
    setEditDraft((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
          }
        : prev,
    );
  };

  const addItemDraft = () => {
    setEditDraft((prev) =>
      prev ? { ...prev, items: [...prev.items, { ...EMPTY_ITEM_DRAFT }] } : prev,
    );
  };

  const removeItemDraft = (index: number) => {
    setEditDraft((prev) =>
      prev && prev.items.length > 1
        ? { ...prev, items: prev.items.filter((_, i) => i !== index) }
        : prev,
    );
  };

  const saveEditRow = async () => {
    if (!editingRow?.orderId || !editDraft) return;
    let addr = editDraft.addr;
    try {
      addr = await fillMissingPostalCode(editDraft.addr);
      if (addr.postalCode !== editDraft.addr.postalCode) {
        setEditDraft((prev) => (prev ? { ...prev, addr } : prev));
      }
    } catch {
      // ถ้า lookup ไม่สำเร็จ ให้ validation ด้านล่างแจ้งผู้ใช้กรอกเอง
    }
    // customerAddress = ส่วน free-text, addr = ที่เลือกจาก picker → รวมเป็นที่อยู่เต็ม
    const fullAddress = composeThaiAddress(editDraft.customerAddress, addr);
    // นับเฉพาะแถวสินค้าที่กรอกชื่อแล้ว — แถวว่างที่เผลอกดเพิ่มไว้ถูกตัดทิ้งตอนบันทึก
    const filledItems = editDraft.items.filter((item) => item.name.trim() !== '');
    const missing = [
      !editDraft.customerName.trim() && 'ชื่อผู้รับ',
      !editDraft.customerPhone.trim() && 'เบอร์โทร',
      !fullAddress.trim() && 'ที่อยู่',
      // กันลืมรหัสไปรษณีย์ (เผลอกด X แล้วไม่เติมกลับ) — ต้องครบ 5 หลัก
      !/^\d{5}$/.test(addr.postalCode.trim()) && 'รหัสไปรษณีย์ (5 หลัก)',
      filledItems.length === 0 && 'สินค้า (อย่างน้อย 1 รายการ)',
    ].filter(Boolean);
    if (missing.length > 0) {
      toast.error(`กรอกข้อมูลให้ครบก่อนบันทึก: ${missing.join(', ')}`);
      return;
    }

    setSavingEdit(true);
    try {
      const existingOrder = ordersById.get(editingRow.orderId);
      const beforeDelivery = existingOrder
        ? getRequestedDeliveryDraft(existingOrder)
        : { date: '', time: '' };
      const afterDelivery = {
        date: editDraft.deliveryDate,
        time: editDraft.deliveryTime,
      };
      const beforeQty = existingOrder?.items.reduce((sum, item) => sum + item.qty, 0) ?? 0;
      const itemsPayload = filledItems.map((item) => ({
        sku: item.sku.trim() || '-',
        name: item.name.trim(),
        purity: item.purity.trim() || '-',
        weight: item.weight.trim() || '0',
        qty: toPositiveInt(item.qty),
        unitPrice: toNonNegativeNumber(item.unitPrice),
        note: item.note.trim() || undefined,
      })) satisfies ImportOrderItemInput[];
      const afterQty = itemsPayload.reduce((sum, item) => sum + item.qty, 0);
      const firstItem = itemsPayload[0]!;
      const nextMissingFields = [
        !editDraft.customerName.trim() && 'customerName',
        !editDraft.customerPhone.trim() && 'customerPhone',
        !fullAddress.trim() && 'customerAddress',
      ].filter(Boolean) as string[];
      // คอลัมน์สินค้าใน rawData เป็นตัวแทนของแถวต้นทาง (รับได้ 1 SKU) — ใช้ SKU แรก
      const nextRawData = {
        ...editDraft.rawData,
        customerName: editDraft.customerName.trim(),
        customerPhone: editDraft.customerPhone.trim(),
        customerAddress: fullAddress.trim(),
        itemName: firstItem.name,
        sku: firstItem.sku,
        purity: firstItem.purity,
        weight: firstItem.weight,
        qty: String(firstItem.qty),
        unitPrice: String(firstItem.unitPrice),
        totalValue: String(toNonNegativeNumber(editDraft.totalValue)),
        payment: normalizePaymentMethod(editDraft.payment),
        note: editDraft.note.trim(),
        deliveryDate: afterDelivery.date,
        deliveryTime: afterDelivery.time,
        [SOURCE_MISSING_FIELDS_COLUMN]: nextMissingFields.join(','),
        [SOURCE_EXTRACTION_CONFIDENCE_COLUMN]:
          nextMissingFields.length === 0
            ? String(Math.max(editingRow.extractionConfidence ?? 0, 90))
            : String(editingRow.extractionConfidence ?? 60),
      };
      const changeRows = [
        beforeDelivery.date !== afterDelivery.date && {
          field: 'deliveryPlan.plannedDate',
          label: 'วันนัดส่ง',
          before: beforeDelivery.date || undefined,
          after: afterDelivery.date || undefined,
        },
        beforeDelivery.time !== afterDelivery.time && {
          field: 'deliveryPlan.plannedTime',
          label: 'เวลานัดส่ง',
          before: beforeDelivery.time || undefined,
          after: afterDelivery.time || undefined,
        },
        beforeQty !== afterQty && {
          field: 'items.qty',
          label: 'จำนวนสินค้า',
          before: beforeQty ? `${beforeQty} ชิ้น` : undefined,
          after: `${afterQty} ชิ้น`,
        },
      ].filter(Boolean);

      await updateImportedOrder(editingRow.orderId, {
        rawData: nextRawData,
        customer: {
          name: editDraft.customerName.trim(),
          phone: editDraft.customerPhone.trim(),
          address: fullAddress.trim(),
          idCard: editDraft.customerIdCard.trim() || undefined,
        },
        items: itemsPayload,
        totalValue: toNonNegativeNumber(editDraft.totalValue),
        payment: normalizePaymentMethod(editDraft.payment),
        note: buildNoteWithRequestedDelivery(editDraft.note.trim(), afterDelivery).trim() || null,
      });
      // บันทึก activity log เป็น audit trail เสริม — ไม่ควร block การบันทึกข้อมูลหลัก
      // (บาง backend ยังไม่มี route /orders/:id/activity → 404 "Cannot POST" ก็ยังต้อง save สำเร็จ)
      if (changeRows.length > 0) {
        try {
          await addOrderActivity(editingRow.orderId, {
            type: 'order_details_updated',
            actor: {
              kind: 'operator',
              handler: existingOrder?.handledBy ?? {
                name: 'พนักงาน Ausiris',
                department: 'Import Review',
              },
            },
            summary: 'แก้ไขวันนัด / จำนวนสินค้า',
            details: `${editingRow.fileName} · แถวที่ ${editingRow.rowIndex + 1}`,
            changes: changeRows,
          });
        } catch (activityError) {
          console.warn(
            'บันทึก activity log ไม่สำเร็จ (ข้าม ไม่กระทบการบันทึกข้อมูล)',
            activityError,
          );
        }
      }
      await Promise.all([reloadEntries(), syncFromBackend()]);
      toast.success('บันทึกข้อมูลจาก LINE import แล้ว');
      setEditingRow(null);
      setEditDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSavingEdit(false);
    }
  };

  return {
    editingRow,
    editDraft,
    setEditDraft,
    savingEdit,
    autoFilling,
    startEditRow,
    cancelEdit,
    applyAutoFill,
    updateItemDraft,
    addItemDraft,
    removeItemDraft,
    saveEditRow,
  };
}
