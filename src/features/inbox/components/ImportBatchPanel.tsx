import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Clock, PanelLeftOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { downloadImportBatchCsv, type ImportBatch } from '@/lib/retailApi';
import { downloadCsv } from '@/lib/export';
import { ALL_SCOPE } from '@/features/inbox/utils/importCardModel';
import { useImportBatchList } from '@/features/inbox/hooks/useImportBatchList';
import {
  readStoredBatchIds,
  readStoredListCollapsed,
  writeStoredBatchIds,
  writeStoredListCollapsed,
} from '@/features/inbox/utils/importBatchStorage';
import { BatchSidebar } from '@/features/inbox/components/import/BatchSidebar';
import { BatchWorkspace } from '@/features/inbox/components/import/BatchWorkspace';

// หน้าประวัตินำเข้าจาก LINE: รายการ batch ด้านซ้าย (หุบได้) + workspace ตรวจออเดอร์ด้านขวา
export default function ImportBatchPanel({
  locationSearch,
  onFastDispatchOrder,
  onPlanningOrder,
}: {
  locationSearch?: string;
  onFastDispatchOrder?: (orderId: string) => void;
  onPlanningOrder?: (orderId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(ALL_SCOPE);
  const [readBatchIds, setReadBatchIds] = useState<Set<string>>(() => readStoredBatchIds());
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(() => readStoredListCollapsed());
  const params = useMemo(() => new URLSearchParams(locationSearch ?? ''), [locationSearch]);
  const focusedBatchId = params.get('batch');
  const focusedOrderId = params.get('order');
  const editOnOpen = params.get('edit') === '1';

  // เปลี่ยนหน้า batch แล้วสโคปเดิมอาจไม่อยู่ในลิสต์ → กลับไปมุมมองรวม
  const list = useImportBatchList({ onPageLoaded: () => setSelectedId(ALL_SCOPE) });
  const { batches, windowParams, windowKey } = list;

  const toggleListCollapsed = () => {
    setListCollapsed((prev) => {
      const next = !prev;
      writeStoredListCollapsed(next);
      return next;
    });
  };

  const markBatchRead = (batchId: string) => {
    setReadBatchIds((current) => {
      if (current.has(batchId)) return current;
      const next = new Set(current);
      next.add(batchId);
      writeStoredBatchIds(next);
      return next;
    });
  };

  const exportBatchCsv = async (batch: Pick<ImportBatch, 'id' | 'fileName'>) => {
    setDownloadingBatchId(batch.id);
    try {
      const result = await downloadImportBatchCsv(batch.id);
      downloadCsv(result.fileName ?? batch.fileName, result.content);
      toast.success(`บันทึกไฟล์ ${result.fileName ?? batch.fileName} แล้ว`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export ไม่สำเร็จ');
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const hasBatches = batches.length > 0;
  const unreadCount = batches.filter((batch) => !readBatchIds.has(batch.id)).length;
  const workspaceKey = selectedId === ALL_SCOPE ? `all:${windowKey}` : selectedId;

  useEffect(() => {
    if (!focusedBatchId) return;
    if (!batches.some((batch) => batch.id === focusedBatchId)) return;
    markBatchRead(focusedBatchId);
    setSelectedId(focusedBatchId);
  }, [batches, focusedBatchId]);

  const workspaceCard = (
    <Card className="app-scroll h-[calc(100vh-16rem)] overflow-auto p-4">
      {hasBatches ? (
        <BatchWorkspace
          key={workspaceKey}
          scope={selectedId}
          batches={batches}
          windowParams={windowParams ?? undefined}
          focusedOrderId={selectedId === focusedBatchId ? focusedOrderId : null}
          editOnOpen={selectedId === focusedBatchId && editOnOpen}
          onFastDispatchOrder={onFastDispatchOrder}
          onPlanningOrder={onPlanningOrder}
          onDownloadBatch={(batch) => void exportBatchCsv(batch)}
          downloadingBatchId={downloadingBatchId}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" /> ยังไม่มีรายการนำเข้า
          </div>
        </div>
      )}
    </Card>
  );

  if (listCollapsed) {
    return (
      <div className="grid gap-4 lg:grid-cols-[44px_1fr]">
        <Card className="flex h-[calc(100vh-16rem)] flex-col items-center gap-2 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={toggleListCollapsed}
                aria-label="ขยายรายการไฟล์/รูปนำเข้า"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">ขยายรายการนำเข้า</TooltipContent>
          </Tooltip>
          {unreadCount > 0 && (
            <Badge variant="info" className="h-5 min-w-5 justify-center px-1 text-[10px]">
              {unreadCount}
            </Badge>
          )}
          <span
            className="mt-1 text-[11px] font-medium text-muted-foreground"
            style={{ writingMode: 'vertical-rl' }}
          >
            รายการนำเข้า
          </span>
        </Card>
        {workspaceCard}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <BatchSidebar
        list={list}
        selectedId={selectedId}
        readBatchIds={readBatchIds}
        unreadCount={unreadCount}
        onSelectAll={() => setSelectedId(ALL_SCOPE)}
        onSelectBatch={(batchId) => {
          markBatchRead(batchId);
          setSelectedId(batchId);
        }}
        onCollapse={toggleListCollapsed}
      />
      {workspaceCard}
    </div>
  );
}
