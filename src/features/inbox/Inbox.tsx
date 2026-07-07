import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Coins, FileSpreadsheet, MessageSquareText } from 'lucide-react';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { MobileDetailSheet } from '@/components/MobileDetailSheet';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cancelReasonLabel, formatTHB, statusLabel, type CancelReason } from '@/data/orderTypes';
import OrderDetail from '@/features/inbox/components/OrderDetail';
import OrderListPanel from '@/features/inbox/components/OrderListPanel';
import ImportBatchPanel from '@/features/inbox/components/ImportBatchPanel';
import ManualImportPanel from '@/features/inbox/components/ManualImportPanel';
import {
  INBOX_STATUSES,
  type InboxFilter,
  useOrderFiltering,
} from '@/features/inbox/hooks/useOrderFiltering';
import { useRetailStore } from '@/state/retailStore';
import { cn } from '@/lib/utils';

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({
  value,
  label: cancelReasonLabel[value],
}));

type InboxTab = 'manual_import' | 'line_import' | 'orders';

export function InboxPage({
  locationSearch,
  onOpenQueue,
  onOpenPlanning,
}: {
  locationSearch?: string;
  onOpenQueue?: (search?: string) => void;
  onOpenPlanning?: (search?: string) => void;
}) {
  const {
    orders,
    confirmOrder,
    updateOrderCustomer,
    updateOrderDetails,
    setShippingMethod,
    cancelOrder,
  } = useRetailStore();

  const [tab, setTab] = useState<InboxTab>('line_import');
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return orders.find((order) => INBOX_STATUSES.includes(order.status))?.id ?? null;
  });
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const params = new URLSearchParams(locationSearch ?? '');
  const focusedOrderId = params.get('order');
  const requestedTab = params.get('tab');
  const editOnOpen = params.get('edit') === '1';

  const { inboxOrders, filteredOrders, filterCounts, inboxValue } = useOrderFiltering(
    orders,
    filter,
    query,
  );

  const selected = orders.find((order) => order.id === selectedId);

  const openManualOrder = (orderId: string) => {
    setTab('orders');
    setFilter('all');
    setQuery('');
    setSelectedId(orderId);
    setMobileDetailOpen(true);
  };

  useEffect(() => {
    if (focusedOrderId && orders.some((order) => order.id === focusedOrderId)) {
      setTab(requestedTab === 'orders' ? 'orders' : 'line_import');
      setFilter('all');
      setQuery('');
      setSelectedId(focusedOrderId);
      setMobileDetailOpen(false);
      return;
    }

    if (!selectedId || !inboxOrders.some((order) => order.id === selectedId)) {
      setSelectedId(inboxOrders[0]?.id ?? null);
    }
  }, [focusedOrderId, inboxOrders, orders, requestedTab, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Inbox — คำสั่งซื้อ</h1>
          <p className="text-sm text-muted-foreground">
            รวมออเดอร์จากทุกช่องทาง intake · อ่านข้อมูลจาก CSV/รูป/ข้อความต้นทาง · แก้ไขก่อนยืนยัน
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="muted" className="gap-1">
            <Coins className="h-3 w-3 text-warning" />
            มูลค่าในคิว {formatTHB(inboxValue)}
          </Badge>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('line_import')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            tab === 'line_import'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          LINE Import
        </button>
        <button
          type="button"
          onClick={() => setTab('manual_import')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            tab === 'manual_import'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Manual Import
        </button>
        <button
          type="button"
          onClick={() => setTab('orders')}
          className={cn(
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            tab === 'orders'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          คำสั่งซื้อ
        </button>
      </div>

      {tab === 'manual_import' ? (
        <ManualImportPanel onOpenOrder={openManualOrder} />
      ) : tab === 'line_import' ? (
        <ImportBatchPanel
          locationSearch={locationSearch}
          onFastDispatchOrder={(orderId) =>
            onOpenQueue?.(`?tab=ready&order=${encodeURIComponent(orderId)}&mode=fast`)
          }
          onPlanningOrder={(orderId) => onOpenPlanning?.(`?order=${encodeURIComponent(orderId)}`)}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <OrderListPanel
              filteredOrders={filteredOrders}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setMobileDetailOpen(true);
              }}
              filter={filter}
              onFilterChange={setFilter}
              query={query}
              onQueryChange={setQuery}
              filterCounts={filterCounts}
            />

            <Card className="hidden h-[calc(100vh-12rem)] overflow-auto p-6 lg:block">
              {selected ? (
                <OrderDetail
                  order={selected}
                  editOnOpenKey={
                    editOnOpen && focusedOrderId === selected.id ? locationSearch : undefined
                  }
                  onConfirm={confirmOrder}
                  onSaveCustomer={updateOrderCustomer}
                  onSaveDetails={updateOrderDetails}
                  onChangeShippingMethod={setShippingMethod}
                  onRequestCancel={setCancelTargetId}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  เลือก order เพื่อดูรายละเอียด
                </div>
              )}
            </Card>
          </div>

          <MobileDetailSheet
            open={!!selected && mobileDetailOpen}
            title={<span className="font-mono">{selected?.code}</span>}
            subtitle={selected ? statusLabel[selected.status] : undefined}
            onClose={() => setMobileDetailOpen(false)}
          >
            {selected && (
              <OrderDetail
                order={selected}
                editOnOpenKey={
                  editOnOpen && focusedOrderId === selected.id ? locationSearch : undefined
                }
                onConfirm={confirmOrder}
                onSaveCustomer={updateOrderCustomer}
                onSaveDetails={updateOrderDetails}
                onChangeShippingMethod={setShippingMethod}
                onRequestCancel={setCancelTargetId}
              />
            )}
          </MobileDetailSheet>

          <ResolutionDialog
            open={!!cancelTargetId}
            title="ยกเลิกออเดอร์"
            description={
              cancelTargetId
                ? `${orders.find((order) => order.id === cancelTargetId)?.code ?? ''} — เลือกเหตุผลการยกเลิก`
                : undefined
            }
            reasons={CANCEL_REASONS}
            confirmLabel="ยืนยันยกเลิก"
            confirmVariant="destructive"
            onCancel={() => setCancelTargetId(null)}
            onConfirm={({ reason, note }) => {
              if (cancelTargetId) {
                const code = orders.find((order) => order.id === cancelTargetId)?.code ?? '';
                cancelOrder(cancelTargetId, { reason, note });
                toast.success(`ยกเลิกออเดอร์ ${code} แล้ว`);
              }
              setCancelTargetId(null);
            }}
          />
        </>
      )}
    </div>
  );
}

export default InboxPage;
