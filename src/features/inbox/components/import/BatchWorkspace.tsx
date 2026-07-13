import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Merge, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  fetchImportRowSource,
  mergeImportOrders,
  splitImportOrderRows,
  syncAppOrder,
  type ImportBatch,
  type ImportRejectReason,
} from '@/lib/retailApi';
import { shippingMethodLabel, type Order, type ShippingMethod } from '@/data/orderTypes';
import { useRetailStore } from '@/state/retailStore';
import { cn } from '@/lib/utils';
import { isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import {
  ALL_SCOPE,
  type CardVM,
  type RowVM,
  type Tab,
} from '@/features/inbox/utils/importCardModel';
import { useImportEntries } from '@/features/inbox/hooks/useImportEntries';
import { useImportCards } from '@/features/inbox/hooks/useImportCards';
import { useImportEditor } from '@/features/inbox/hooks/useImportEditor';
import type { BatchWindowParams } from '@/features/inbox/hooks/useImportBatchList';
import { TabChip, TabEmptyState } from './TabChip';
import { WorkspaceHeader } from './WorkspaceHeader';
import { ImportOrderCard } from './ImportOrderCard';
import { ImportEditPanel } from './ImportEditPanel';
import { ShortcutConfirmDialog, type ShortcutConfirm } from './ShortcutConfirmDialog';
import { ImagePreviewDialog, type PreviewImage } from './ImagePreviewDialog';
import { BulkActionBar } from './BulkActionBar';

// พื้นที่ทำงานหลักของแท็บนำเข้า: แท็บสถานะ + ลิสต์ order card + ฟอร์มแก้ไข + bulk action
export function BatchWorkspace({
  scope,
  batches,
  windowParams,
  focusedOrderId,
  editOnOpen,
  onFastDispatchOrder,
  onPlanningOrder,
  onDownloadBatch,
  downloadingBatchId,
}: {
  scope: string; // batchId | 'all'
  batches: ImportBatch[];
  windowParams?: BatchWindowParams;
  focusedOrderId?: string | null;
  editOnOpen?: boolean;
  onFastDispatchOrder?: (orderId: string) => void;
  onPlanningOrder?: (orderId: string) => void;
  onDownloadBatch: (batch: Pick<ImportBatch, 'id' | 'fileName'>) => void;
  downloadingBatchId: string | null;
}) {
  const {
    approveImportOrders,
    rejectImportOrders,
    restoreImportOrders,
    clearPlannedOrders,
    syncFromBackend,
  } = useRetailStore();
  const [tab, setTab] = useState<Tab>('review');
  // ผู้ใช้กดเลือกแท็บเองหรือยัง — ถ้ายัง ให้ระบบเลือก default ที่มีของให้
  const [tabTouched, setTabTouched] = useState(false);
  const selectTab = (next: Tab) => {
    setTabTouched(true);
    setTab(next);
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<ShippingMethod>('internal_driver');
  const [reason, setReason] = useState<ImportRejectReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [shortcutConfirm, setShortcutConfirm] = useState<ShortcutConfirm | null>(null);
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const [previewLoadingRowId, setPreviewLoadingRowId] = useState<string | null>(null);
  const autoOpenedOrderRef = useRef<string | null>(null);

  const entryData = useImportEntries({
    batchId: scope === ALL_SCOPE ? undefined : scope,
    tab,
    query: search,
    windowParams: scope === ALL_SCOPE ? windowParams : undefined,
  });
  const {
    details,
    entryOrders,
    stats,
    loading,
    hasMore,
    total,
    page,
    error,
    loadMore,
    loadPrevious,
  } = entryData;
  const reloadDetails = entryData.reload;
  const processingBatches = useMemo(
    () =>
      batches.filter(
        (batch) =>
          (scope === ALL_SCOPE || batch.id === scope) &&
          (batch.status === 'PENDING' || batch.status === 'PROCESSING'),
      ),
    [batches, scope],
  );
  const batchProgressKey = useMemo(
    () =>
      processingBatches
        .map((batch) => `${batch.id}:${batch.status}:${batch.importedRows}:${batch.errorRows}`)
        .join('|'),
    [processingBatches],
  );
  const previousBatchProgressRef = useRef<string | null>(null);
  const reloadEntriesRef = useRef(reloadDetails);
  reloadEntriesRef.current = reloadDetails;

  useEffect(() => {
    const previous = previousBatchProgressRef.current;
    previousBatchProgressRef.current = batchProgressKey;
    if (previous != null && previous !== batchProgressKey) void reloadEntriesRef.current();
  }, [batchProgressKey]);

  const { ordersById, cards } = useImportCards(details, entryOrders);
  const editor = useImportEditor({ ordersById, reloadEntries: reloadDetails });

  useEffect(() => {
    if (!focusedOrderId || !editOnOpen) return;
    if (autoOpenedOrderRef.current === focusedOrderId) return;
    const targetCard = cards.find((card) => card.orderId === focusedOrderId);
    const targetRow = targetCard?.rows.find((row) => row.orderId === focusedOrderId);
    if (!targetRow) return;
    editor.startEditRow(targetRow);
    autoOpenedOrderRef.current = focusedOrderId;
    // startEditRow is an event helper that intentionally uses the current page snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, editOnOpen, focusedOrderId]);

  // ถ้าผู้ใช้ยังไม่กดแท็บเอง ให้เด้งไปแท็บแรกที่มีรายการ (ตรวจครบแล้ว → ไปดู "อนุมัติแล้ว" แทนหน้าว่าง)
  useEffect(() => {
    if (loading || tabTouched) return;
    if (stats.review + stats.error > 0) setTab('review');
    else if (stats.approved > 0) setTab('approved');
    else if (stats.cancelled > 0) setTab('cancelled');
    else if (stats.rejected > 0) setTab('rejected');
    else setTab('all');
  }, [
    loading,
    tabTouched,
    stats.review,
    stats.error,
    stats.approved,
    stats.cancelled,
    stats.rejected,
  ]);

  // เลือกได้เฉพาะออเดอร์ที่ยังรอตรวจ (มี order อยู่ใน store) — จำกัดตามผลค้นหาที่เห็นอยู่
  // (filter/search ทำบน backend เพื่อไม่ต้องถือ order หลักหมื่นไว้ใน browser)
  const selectableIds = useMemo(
    () =>
      cards
        .filter((c) => c.kind === 'review' && c.orderId && ordersById.has(c.orderId))
        .map((c) => c.orderId!),
    [cards, ordersById],
  );

  // รอตรวจทั้งหมดในสโคปนี้ (ไม่ผูกกับแท็บที่เปิดอยู่) — ใช้กับปุ่ม "อนุมัติทั้งหมด"
  const reviewIds = useMemo(
    () =>
      cards
        .filter((c) => c.kind === 'review' && c.orderId && ordersById.has(c.orderId))
        .map((c) => c.orderId!),
    [cards, ordersById],
  );

  // กลุ่มที่ backend เสนอว่า "น่าจะรวมได้" — โชว์เฉพาะกลุ่มที่ทุกออเดอร์ยังรอตรวจอยู่
  const mergeSuggestions = useMemo(() => {
    const reviewOrderIds = new Set(reviewIds);
    return details
      .flatMap((detail) =>
        (detail.groupSuggestions ?? []).map((s) => ({ ...s, fileName: detail.fileName })),
      )
      .map((s) => ({ ...s, orderIds: s.orderIds.filter((id) => reviewOrderIds.has(id)) }))
      .filter((s) => s.orderIds.length >= 2);
  }, [details, reviewIds]);

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
      await reloadDetails();
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

  const approveAllInScope = () => {
    if (reviewIds.length === 0) return;
    void runAction(
      `อนุมัติทั้งรายการ ${reviewIds.length} ออเดอร์ · ${shippingMethodLabel[method]}`,
      () => approveImportOrders(reviewIds, method),
    );
  };

  const ensureInternalDriverReady = async (orderId: string, opts?: { clearPlan?: boolean }) => {
    // order ที่จัดรอบไว้แล้วต้องถอดออกจากรอบก่อน ไม่งั้นจะไม่โผล่ในคิว "ส่งทันที"
    // (execution queue กรอง order ที่ releaseState 'planned' ออก)
    if (opts?.clearPlan) {
      await clearPlannedOrders([orderId]);
    }
    await approveImportOrders([orderId], 'internal_driver');
    const order = ordersById.get(orderId);
    if (!order) return;

    await syncAppOrder({
      ...order,
      status: 'ready',
      confidence: Math.max(order.confidence, 90),
      dispatchReadiness: order.dispatchReadiness ?? 'ready',
      shippingMethod: 'internal_driver',
      // ล้าง plan ในเพย์โหลดด้วย เพราะ ordersById ใน closure อาจยังไม่รีเฟรชหลัง clear
      ...(opts?.clearPlan ? { deliveryPlan: undefined } : {}),
    });
    await syncFromBackend();
  };

  const approveAndOpenFastDispatch = (orderId: string) => {
    const wasPlanned = isUnreleasedPlannedOrder(ordersById.get(orderId) ?? ({} as Order));
    void runAction(
      wasPlanned ? 'ถอดออกจากรอบ แล้วเปิดหน้าส่งทันที' : 'เปิดหน้าส่งทันที',
      async () => {
        await ensureInternalDriverReady(orderId, { clearPlan: wasPlanned });
        onFastDispatchOrder?.(orderId);
      },
    );
  };

  const approveAndOpenPlanning = (orderId: string) => {
    void runAction('เปิดหน้าจัดรอบส่ง', async () => {
      await ensureInternalDriverReady(orderId);
      onPlanningOrder?.(orderId);
    });
  };

  const confirmShortcutAction = () => {
    if (!shortcutConfirm) return;
    const { action, orderId } = shortcutConfirm;
    setShortcutConfirm(null);
    if (action === 'fast') approveAndOpenFastDispatch(orderId);
    else approveAndOpenPlanning(orderId);
  };

  // ปฏิเสธแล้วเด้ง toast ที่บอกชัดว่า "ไปอยู่แท็บ ปฏิเสธ" + ปุ่มดึงกลับ (undo) ในตัว
  // แก้ปัญหาแถวหายวับจากแท็บรอตรวจโดยไม่รู้ว่าไปไหน
  const rejectOrders = async (ids: string[], input?: { reason?: ImportRejectReason }) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await rejectImportOrders(ids, input?.reason ? { reason: input.reason } : undefined);
      await reloadDetails();
      setSelected(new Set());
      const count = ids.length;
      toast.success(count === 1 ? 'ปฏิเสธออเดอร์แล้ว' : `ปฏิเสธ ${count} รายการแล้ว`, {
        description: 'ย้ายไปที่แท็บ “ปฏิเสธ” แล้ว — ยังกดดึงกลับมาตรวจใหม่ได้',
        duration: 6000,
        action: {
          label: 'ดึงกลับ',
          onClick: () => {
            void restoreImportOrders(ids)
              .then(async () => {
                await reloadDetails();
                toast.success(
                  count === 1 ? 'ดึงกลับมาตรวจใหม่แล้ว' : `ดึงกลับ ${count} รายการแล้ว`,
                );
              })
              .catch((error) =>
                toast.error(error instanceof Error ? error.message : 'ดึงกลับไม่สำเร็จ'),
              );
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ปฏิเสธไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const bulkReject = () => {
    void rejectOrders([...selected], reason ? { reason } : undefined);
  };

  // รวมหลาย draft orders เป็นออเดอร์เดียว (ตัวแรกเป็นหลัก) — ย้อนกลับได้ด้วย "แยกตามแถวต้นทาง"
  const mergeOrders = (orderIds: string[]) => {
    if (orderIds.length < 2) return;
    void runAction(
      `รวม ${orderIds.length} รายการเป็น 1 ออเดอร์แล้ว — ตรวจอีกครั้งก่อนอนุมัติ`,
      async () => {
        await mergeImportOrders(orderIds);
        await syncFromBackend();
      },
    );
  };

  // แยกออเดอร์ที่มีหลายแถวต้นทาง กลับเป็น 1 ออเดอร์ต่อ 1 แถว (แถวแรกอยู่ที่ออเดอร์เดิม)
  const splitCard = (card: CardVM) => {
    if (!card.orderId || card.rows.length < 2) return;
    const rowIds = card.rows.slice(1).map((row) => row.rowId);
    void runAction(`แยกออเดอร์กลับเป็น ${card.rows.length} รายการตามแถวต้นทางแล้ว`, async () => {
      await splitImportOrderRows(card.orderId!, rowIds);
      await syncFromBackend();
    });
  };

  const openPreviewImage = async (row: RowVM) => {
    setPreviewLoadingRowId(row.rowId);
    try {
      const source = row.imageDataUrl
        ? { imageDataUrl: row.imageDataUrl, imageMimeType: row.imageMimeType ?? null }
        : await fetchImportRowSource(row.rowId);
      if (!source.imageDataUrl) {
        toast.error('ไม่พบรูปต้นฉบับของรายการนี้');
        return;
      }
      setPreviewImage({
        src: source.imageDataUrl,
        fileName: row.fileName,
        rowIndex: row.rowIndex,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดรูปต้นฉบับไม่สำเร็จ');
    } finally {
      setPreviewLoadingRowId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (stats.total === 0 && !loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">ไม่มีข้อมูลนำเข้า</div>;
  }

  const scopeBatch = scope === ALL_SCOPE ? undefined : batches.find((batch) => batch.id === scope);
  const showFile = scope === ALL_SCOPE;
  const errorSummary = scopeBatch?.errorSummary ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceHeader
        scope={scope}
        scopeBatch={scopeBatch}
        stats={stats}
        reviewCount={reviewIds.length}
        method={method}
        busy={busy}
        downloading={!!scopeBatch && downloadingBatchId === scopeBatch.id}
        onMethodChange={setMethod}
        onApproveAll={approveAllInScope}
        onDownload={() => scopeBatch && onDownloadBatch(scopeBatch)}
      />

      {/* กำลังนำเข้า — batch ยังประมวลผลอยู่ใน backend; รายการจะเด้งเข้ามาเองเมื่อเสร็จ (auto-poll) */}
      {processingBatches.length > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-info/40 bg-info/5 px-3 py-2.5">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-info">
              {scope === ALL_SCOPE
                ? `กำลังนำเข้า ${processingBatches.length} ไฟล์จาก LINE…`
                : 'กำลังอ่านข้อมูลจากไฟล์นี้…'}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              ระบบกำลังแปลงไฟล์เป็นออเดอร์ — รายการจะปรากฏที่นี่อัตโนมัติเมื่อเสร็จ ไม่ต้องรีเฟรช
            </div>
          </div>
          {(() => {
            const totalRows = processingBatches.reduce((sum, b) => sum + b.totalRows, 0);
            const importedRows = processingBatches.reduce((sum, b) => sum + b.importedRows, 0);
            return totalRows > 0 ? (
              <span className="shrink-0 text-xs font-medium tabular-nums text-info">
                {importedRows}/{totalRows} แถว
              </span>
            ) : null;
          })()}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <span>{error}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void reloadDetails()}>
            ลองใหม่
          </Button>
        </div>
      )}

      {/* status tabs */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TabChip
          active={tab === 'review'}
          onClick={() => selectTab('review')}
          label="รอตรวจ"
          count={stats.review + stats.error}
          tone="accent"
        />
        <TabChip
          active={tab === 'approved'}
          onClick={() => selectTab('approved')}
          label="อนุมัติแล้ว"
          count={stats.approved}
          tone="success"
        />
        {stats.cancelled > 0 && (
          <TabChip
            active={tab === 'cancelled'}
            onClick={() => selectTab('cancelled')}
            label="ยกเลิกแล้ว"
            count={stats.cancelled}
            tone="destructive"
          />
        )}
        <TabChip
          active={tab === 'rejected'}
          onClick={() => selectTab('rejected')}
          label="ปฏิเสธ"
          count={stats.rejected}
          tone="muted"
        />
        <TabChip
          active={tab === 'all'}
          onClick={() => selectTab('all')}
          label="ทั้งหมด"
          count={stats.total}
          tone="accent"
        />
      </div>

      {/* กลุ่มที่น่าจะรวมได้ — เสนอเท่านั้น admin ตัดสินใจกดรวมเอง (บางไฟล์ตั้งใจเป็นหลายออเดอร์จริง) */}
      {(tab === 'review' || tab === 'all') &&
        mergeSuggestions.map((suggestion) => (
          <div
            key={suggestion.key}
            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/40 bg-info/5 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <Merge className="h-3.5 w-3.5 shrink-0 text-info" />
              <span className="min-w-0">
                พบ {suggestion.rowIndexes.length} แถว (แถวที่{' '}
                {suggestion.rowIndexes.map((i) => i + 1).join(', ')}) ที่เบอร์+ที่อยู่เดียวกัน —
                อาจเป็น 1 ออเดอร์ / {suggestion.rowIndexes.length} SKU
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-info/60 text-xs text-info hover:bg-info/10"
              disabled={busy}
              onClick={() => mergeOrders(suggestion.orderIds)}
            >
              <Merge className="h-3 w-3" /> รวมเป็น 1 ออเดอร์
            </Button>
          </div>
        ))}

      {/* order review list */}
      <div
        className={cn(
          'mt-3 min-h-0 flex-1 space-y-2 overflow-auto rounded-lg border bg-muted/20 p-2',
          editor.editingRow && 'max-h-72 flex-none',
        )}
      >
        <div className="sticky top-0 z-10 -mx-2 -mt-2 flex flex-wrap items-center gap-2 border-b bg-muted/90 px-3 py-2 text-xs backdrop-blur">
          <label className="flex shrink-0 items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              aria-label="เลือกทั้งหมดที่รอตรวจ"
              checked={allSelected}
              onChange={toggleAll}
              disabled={selectableIds.length === 0}
              className="h-3.5 w-3.5"
            />
            เลือกออเดอร์รอตรวจ
          </label>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาเลขออเดอร์ / ชื่อ / เบอร์ / ที่อยู่..."
              className="h-7 bg-background pl-8 text-xs"
            />
          </div>
          <span className="shrink-0 text-muted-foreground">
            {total.toLocaleString('th-TH')} รายการ
          </span>
        </div>

        {cards.length === 0 && (
          <div className="px-3 py-10 text-center">
            {search.trim() ? (
              <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                <Search className="h-6 w-6 text-muted-foreground/50" />
                <div className="text-sm">ไม่พบออเดอร์ที่ตรงกับ “{search.trim()}”</div>
                <div className="text-[11px]">
                  ลองค้นด้วยเลขออเดอร์ (MV-ORD-... / mvord42) ชื่อ เบอร์ หรือที่อยู่ลูกค้า
                </div>
              </div>
            ) : processingBatches.length > 0 ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-info" />
                <div className="text-sm">กำลังประมวลผลไฟล์นำเข้า…</div>
                <div className="text-[11px]">
                  ออเดอร์จะแสดงที่นี่อัตโนมัติเมื่อระบบอ่านข้อมูลเสร็จ
                </div>
              </div>
            ) : (
              <TabEmptyState tab={tab} stats={stats} onJump={selectTab} />
            )}
          </div>
        )}

        <div className="space-y-2 pt-2">
          {cards.map((card) => (
            <ImportOrderCard
              key={card.key}
              card={card}
              order={card.orderId ? ordersById.get(card.orderId) : undefined}
              showFile={showFile}
              checked={!!card.orderId && selected.has(card.orderId)}
              busy={busy}
              editBusy={editor.savingEdit}
              previewLoading={previewLoadingRowId === card.primary.rowId}
              onToggle={() => card.orderId && toggle(card.orderId)}
              onApprove={() =>
                runAction('อนุมัติ 1 รายการ', () => approveImportOrders([card.orderId!], method))
              }
              onReject={() => void rejectOrders([card.orderId!])}
              onRestore={() =>
                runAction('ดึงกลับ 1 รายการ', () => restoreImportOrders([card.orderId!]))
              }
              onEdit={editor.startEditRow}
              onPreviewImage={(row) => void openPreviewImage(row)}
              onSplit={() => splitCard(card)}
              onFastDispatch={onFastDispatchOrder ? setShortcutConfirm : undefined}
              onPlanning={onPlanningOrder ? setShortcutConfirm : undefined}
            />
          ))}
        </div>
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || page <= 1}
              onClick={() => {
                setSelected(new Set());
                loadPrevious();
              }}
            >
              หน้าก่อนหน้า
            </Button>
            <span className="text-xs text-muted-foreground">
              หน้า {page.toLocaleString('th-TH')}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !hasMore}
              onClick={() => {
                setSelected(new Set());
                loadMore();
              }}
            >
              หน้าถัดไป
            </Button>
          </div>
        )}
      </div>

      {editor.editingRow && editor.editDraft && (
        <ImportEditPanel
          row={editor.editingRow}
          draft={editor.editDraft}
          saving={editor.savingEdit}
          autoFilling={editor.autoFilling}
          onDraftChange={editor.setEditDraft}
          onAutoFill={(address) => void editor.applyAutoFill(address)}
          onUpdateItem={editor.updateItemDraft}
          onAddItem={editor.addItemDraft}
          onRemoveItem={editor.removeItemDraft}
          onCancel={editor.cancelEdit}
          onSave={() => void editor.saveEditRow()}
        />
      )}

      {shortcutConfirm && (
        <ShortcutConfirmDialog
          confirm={shortcutConfirm}
          busy={busy}
          onClose={() => setShortcutConfirm(null)}
          onConfirm={confirmShortcutAction}
        />
      )}

      {previewImage && (
        <ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {errorSummary &&
        stats.error > 0 &&
        tab !== 'approved' &&
        tab !== 'cancelled' &&
        tab !== 'rejected' && (
          <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
            <div className="mb-1 text-[11px] font-medium text-destructive">สาเหตุข้อผิดพลาด</div>
            <pre className="whitespace-pre-wrap text-[10px] text-destructive/80">
              {errorSummary}
            </pre>
          </div>
        )}

      {selected.size > 0 && (
        <BulkActionBar
          selectedCount={selected.size}
          method={method}
          onMethodChange={setMethod}
          reason={reason}
          onReasonChange={setReason}
          busy={busy}
          onApprove={bulkApprove}
          onMerge={() => mergeOrders([...selected])}
          onReject={bulkReject}
        />
      )}
    </div>
  );
}
