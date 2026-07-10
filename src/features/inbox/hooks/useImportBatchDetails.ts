import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { fetchImportBatch, type ImportBatch, type ImportBatchDetail } from '@/lib/retailApi';
import { ALL_SCOPE } from '@/features/inbox/utils/importCardModel';

// โหลด/poll รายละเอียด batch นำเข้าตาม scope (batchId เดียว หรือ 'all')
// - โหลดครั้งแรกขึ้น spinner เต็มพาเนล; refetch เบื้องหลัง (PENDING/PROCESSING → DONE) ไม่ flash
// - onResetSelection ถูกเรียกตอนโหลดสด (mount/เปลี่ยน scope) เพื่อให้ผู้เรียกล้าง selection ได้
export function useImportBatchDetails({
  scope,
  batches,
  onResetSelection,
}: {
  scope: string;
  batches: ImportBatch[];
  onResetSelection?: () => void;
}) {
  const [details, setDetails] = useState<ImportBatchDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const targetBatchIds = useMemo(
    () => (scope === ALL_SCOPE ? batches.map((b) => b.id) : [scope]),
    [scope, batches],
  );

  // batch ที่ยังประมวลผลอยู่ในสโคปนี้ — driver ของ processing state + refetch เมื่อ backend อ่านเสร็จ
  const processingBatches = useMemo(
    () =>
      targetBatchIds
        .map((id) => batchById.get(id))
        .filter(
          (b): b is ImportBatch => !!b && (b.status === 'PENDING' || b.status === 'PROCESSING'),
        ),
    [targetBatchIds, batchById],
  );

  // signature เปลี่ยนเฉพาะเมื่อ batch ที่เกี่ยวข้องมี progress ขยับ (status/แถวนำเข้า) →
  // ให้ refetch rows ใหม่อัตโนมัติตอน PENDING/PROCESSING → DONE โดยไม่ต้องกด refresh
  const batchStatusKey = useMemo(
    () =>
      targetBatchIds
        .map((id) => {
          const b = batchById.get(id);
          return b ? `${id}:${b.status}:${b.importedRows}:${b.errorRows}` : id;
        })
        .join('|'),
    [targetBatchIds, batchById],
  );

  const initialLoadRef = useRef(false);
  const onResetSelectionRef = useRef(onResetSelection);
  onResetSelectionRef.current = onResetSelection;

  useEffect(() => {
    let cancelled = false;
    if (!initialLoadRef.current) {
      setLoading(true);
      onResetSelectionRef.current?.();
    }
    Promise.all(targetBatchIds.map((id) => fetchImportBatch(id)))
      .then((res) => {
        if (!cancelled) setDetails(res);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error('โหลดรายการนำเข้าไม่สำเร็จ');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          initialLoadRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
    // targetBatchIds ถูกจับผ่าน batchStatusKey แล้ว (id อยู่ใน key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchStatusKey]);

  const reloadDetails = async () => {
    const res = await Promise.all(targetBatchIds.map((id) => fetchImportBatch(id)));
    setDetails(res);
  };

  return { details, loading, processingBatches, reloadDetails };
}
