import { FileSpreadsheet, Loader2, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ImportBatch } from '@/lib/retailApi';

export function BatchListItem({
  batch,
  selected,
  unread,
  onClick,
}: {
  batch: ImportBatch;
  selected: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  const senderName = batch.lineSenderDisplayName?.trim();
  const senderId = batch.lineSenderUserId?.trim();
  const senderLabel = senderName || (senderId ? `LINE ${senderId.slice(0, 8)}...` : null);
  const isProcessing = batch.status === 'PENDING' || batch.status === 'PROCESSING';

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-border bg-muted' : 'border-transparent hover:bg-muted/60',
      )}
    >
      <button type="button" onClick={onClick} className="w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
            <FileSpreadsheet
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                unread ? 'text-primary' : 'text-muted-foreground',
              )}
            />
            <span className={cn('truncate text-xs font-medium', unread && 'font-semibold')}>
              {batch.fileName}
            </span>
          </div>
          {isProcessing ? (
            <Badge variant="info" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              กำลังนำเข้า
            </Badge>
          ) : (
            unread && (
              <Badge variant="info" className="h-5 shrink-0 px-1.5 text-[10px]">
                รายการใหม่
              </Badge>
            )
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          {senderLabel && (
            <>
              <span className="inline-flex min-w-0 items-center gap-1">
                {batch.lineSenderPictureUrl ? (
                  <img
                    src={batch.lineSenderPictureUrl}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <UserRound className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{senderLabel}</span>
              </span>
              <span>·</span>
            </>
          )}
          <span>
            {new Date(batch.createdAt).toLocaleString('th', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {isProcessing && (
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-info">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span>
                {batch.status === 'PENDING' ? 'รอเข้าคิวประมวลผล…' : 'กำลังอ่านข้อมูลจากไฟล์…'}
              </span>
              {batch.totalRows > 0 && (
                <span className="text-muted-foreground">
                  {batch.importedRows}/{batch.totalRows} แถว
                </span>
              )}
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-info/15">
              <div
                className={cn(
                  'h-full rounded-full bg-info transition-all',
                  batch.totalRows > 0 ? '' : 'w-1/3 animate-pulse',
                )}
                style={
                  batch.totalRows > 0
                    ? {
                        width: `${Math.min(100, Math.round((batch.importedRows / batch.totalRows) * 100))}%`,
                      }
                    : undefined
                }
              />
            </div>
          </div>
        )}

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
    </div>
  );
}
