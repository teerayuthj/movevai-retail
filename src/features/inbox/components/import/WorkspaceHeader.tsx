import {
  CheckCircle2,
  Coins,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTHB, type ShippingMethod } from '@/data/orderTypes';
import type { ImportBatch, ImportEntryStats } from '@/lib/retailApi';
import { ALL_SCOPE } from '@/features/inbox/utils/importCardModel';
import { ShippingMethodSelect } from './ShippingMethodSelect';

// หัว workspace: ชื่อไฟล์/สโคป + ผู้ส่ง + สรุปยอด และปุ่มอนุมัติทั้งหมด/export
export function WorkspaceHeader({
  scope,
  scopeBatch,
  stats,
  reviewCount,
  method,
  busy,
  downloading,
  onMethodChange,
  onApproveAll,
  onDownload,
}: {
  scope: string;
  scopeBatch?: ImportBatch;
  stats: ImportEntryStats;
  reviewCount: number;
  method: ShippingMethod;
  busy: boolean;
  downloading: boolean;
  onMethodChange: (method: ShippingMethod) => void;
  onApproveAll: () => void;
  onDownload: () => void;
}) {
  const title =
    scope === ALL_SCOPE
      ? `รวมทุกรายการ (${stats.batchCount.toLocaleString('th-TH')})`
      : (scopeBatch?.fileName ?? 'รายการนำเข้า');
  const senderName =
    scope === ALL_SCOPE
      ? null
      : scopeBatch?.lineSenderDisplayName?.trim() ||
        (scopeBatch?.lineSenderUserId
          ? `LINE ${scopeBatch.lineSenderUserId.slice(0, 8)}...`
          : null);

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          {scope === ALL_SCOPE ? (
            <Layers className="h-4 w-4 text-primary" />
          ) : (
            <FileSpreadsheet className="h-4 w-4 text-success" />
          )}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {senderName && (
            <span className="inline-flex items-center gap-1">
              {scopeBatch?.lineSenderPictureUrl ? (
                <img
                  src={scopeBatch.lineSenderPictureUrl}
                  alt=""
                  className="h-4 w-4 shrink-0 rounded-full object-cover"
                />
              ) : (
                <UserRound className="h-3 w-3 shrink-0" />
              )}
              ส่งโดย {senderName}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Coins className="h-3 w-3 text-muted-foreground" />
            {stats.total} ออเดอร์ · {stats.totalRows} แถว · มูลค่ารวม {formatTHB(stats.value)}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {reviewCount > 0 && (
          <>
            <ShippingMethodSelect value={method} onChange={onMethodChange} />
            <Button type="button" size="sm" disabled={busy} onClick={onApproveAll}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {scope === ALL_SCOPE || stats.review > reviewCount
                ? `อนุมัติที่โหลดแล้ว (${reviewCount})`
                : `อนุมัติทั้งหมด (${reviewCount})`}
            </Button>
          </>
        )}
        {scope !== ALL_SCOPE && scopeBatch && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={downloading}
            onClick={onDownload}
          >
            {downloading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export Text/CSV
          </Button>
        )}
      </div>
    </div>
  );
}
