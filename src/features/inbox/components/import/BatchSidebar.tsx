import { useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarDays, Layers, Loader2, PanelLeftClose, RefreshCw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ALL_SCOPE } from '@/features/inbox/utils/importCardModel';
import {
  CUSTOM_DAYS,
  DAY_WINDOW_OPTIONS,
  type ImportBatchListState,
} from '@/features/inbox/hooks/useImportBatchList';
import { BatchListItem } from './BatchListItem';

// พาเนลซ้าย: ตัวกรองช่วงเวลา + รายการไฟล์/รูปนำเข้าจาก LINE พร้อมแบ่งหน้า
export function BatchSidebar({
  list,
  selectedId,
  readBatchIds,
  unreadCount,
  onSelectAll,
  onSelectBatch,
  onCollapse,
}: {
  list: ImportBatchListState;
  selectedId: string;
  readBatchIds: Set<string>;
  unreadCount: number;
  onSelectAll: () => void;
  onSelectBatch: (batchId: string) => void;
  onCollapse: () => void;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const {
    batches,
    loading,
    loadingMore,
    hasMore,
    total,
    page,
    days,
    setDays,
    range,
    setRange,
    customMode,
    rangeReady,
    inProgressCount,
    reload,
    loadMore,
    loadPrevious,
  } = list;
  const hasBatches = batches.length > 0;

  return (
    <Card className="flex h-[calc(100vh-16rem)] flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium">ไฟล์/รูปนำเข้าจาก LINE</span>
            {inProgressCount > 0 && (
              <Badge variant="info" className="h-5 shrink-0 gap-1 px-1.5 text-[10px]">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                นำเข้า {inProgressCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={reload}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onCollapse}
                  aria-label="หุบรายการไฟล์/รูปนำเข้า เพื่อขยายพื้นที่ทำงาน"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">หุบรายการ ขยายพื้นที่ทำงาน</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Select
            value={days}
            onChange={(e) => {
              const next = Number(e.target.value);
              setDays(next);
              if (next === CUSTOM_DAYS && !rangeReady) setRangeOpen(true);
            }}
            disabled={loading}
            containerClassName="flex-1"
            className="h-8"
            aria-label="ช่วงเวลาย้อนหลัง"
          >
            {DAY_WINDOW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          {total > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              หน้า {page.toLocaleString('th-TH')} · {total.toLocaleString('th-TH')}
            </span>
          )}
        </div>
        {customMode && (
          <div className="mt-2 flex items-center gap-2">
            <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 justify-start px-2 text-sm font-normal"
                >
                  <CalendarDays className="mr-1.5 h-4 w-4" />
                  {rangeReady ? (
                    <span>
                      {format(range!.from!, 'd MMM yy', { locale: th })} –{' '}
                      {format(range!.to!, 'd MMM yy', { locale: th })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">เลือกช่วงวันที่</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  locale={th}
                  selected={range}
                  onSelect={setRange}
                  numberOfMonths={1}
                  disabled={{ after: new Date() }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>
            {range?.from && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="ล้างช่วงวันที่"
                onClick={() => setRange(undefined)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <Separator />
      <CardContent className="app-scroll flex-1 space-y-2 overflow-auto p-3">
        {loading && batches.length === 0 && (
          <div className="flex h-20 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && customMode && !rangeReady && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            เลือกช่วงวันที่เพื่อดูรายการ
            <div className="mt-1 text-[11px]">กดปุ่มปฏิทินด้านบนแล้วเลือกวันเริ่ม–สิ้นสุด</div>
          </div>
        )}
        {!loading && !hasBatches && !(customMode && !rangeReady) && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {customMode ? 'ไม่พบรายการในช่วงวันที่ที่เลือก' : 'ยังไม่มีการนำเข้าไฟล์หรือรูป'}
            <div className="mt-1 text-[11px]">
              {customMode ? 'ลองขยายช่วงวันที่' : 'ส่งไฟล์ .csv หรือรูปภาพใน LINE เพื่อเริ่มต้น'}
            </div>
          </div>
        )}
        {hasBatches && (
          <button
            type="button"
            onClick={onSelectAll}
            className={cn(
              'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
              selectedId === ALL_SCOPE
                ? 'border-border bg-muted'
                : 'border-transparent hover:bg-muted/60',
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Layers className="h-3.5 w-3.5 text-primary" /> ทุกรายการ (รวม)
            </span>
            <span className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                  ใหม่ {unreadCount}
                </Badge>
              )}
              <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                {total.toLocaleString('th-TH')} รายการ
              </Badge>
            </span>
          </button>
        )}
        {batches.map((batch) => (
          <BatchListItem
            key={batch.id}
            batch={batch}
            selected={selectedId === batch.id}
            unread={!readBatchIds.has(batch.id)}
            onClick={() => onSelectBatch(batch.id)}
          />
        ))}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingMore || page <= 1}
              onClick={loadPrevious}
            >
              ก่อนหน้า
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loadingMore || !hasMore}
              onClick={loadMore}
            >
              {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              ถัดไป
            </Button>
          </div>
        )}
        {!loading && !loadingMore && hasBatches && !hasMore && page === 1 && (
          <div className="py-3 text-center text-[11px] text-muted-foreground">
            แสดงครบทุกรายการในช่วงเวลานี้แล้ว
          </div>
        )}
      </CardContent>
    </Card>
  );
}
