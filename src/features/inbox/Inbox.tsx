import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import { MobileDetailSheet } from '@/components/MobileDetailSheet';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cancelReasonLabel, formatTHB, statusLabel, type CancelReason } from '@/data/mock';
import OrderDetail from '@/features/inbox/components/OrderDetail';
import OrderListPanel from '@/features/inbox/components/OrderListPanel';
import {
  INBOX_STATUSES,
  type InboxFilter,
  useOrderFiltering,
} from '@/features/inbox/hooks/useOrderFiltering';
import { useRetailStore } from '@/state/retailStore';

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({
  value,
  label: cancelReasonLabel[value],
}));

export function InboxPage() {
  const {
    orders,
    confirmOrder,
    finishParsingOrder,
    updateOrderCustomer,
    setShippingMethod,
    cancelOrder,
  } = useRetailStore();

  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return orders.find((order) => INBOX_STATUSES.includes(order.status))?.id ?? null;
  });
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [query, setQuery] = useState('');
  // มือถือ: เปิด overlay รายละเอียดเฉพาะตอนแตะรายการ (กัน auto-select เด้งทับ list)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const { inboxOrders, filteredOrders, filterCounts, inboxValue } = useOrderFiltering(
    orders,
    filter,
    query,
  );

  const selected = orders.find((order) => order.id === selectedId);

  useEffect(() => {
    if (!selectedId || !inboxOrders.some((order) => order.id === selectedId)) {
      setSelectedId(inboxOrders[0]?.id ?? null);
    }
  }, [inboxOrders, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Inbox — คำสั่งซื้อ</h1>
          <p className="text-sm text-muted-foreground">
            รวมออเดอร์จากทุกช่องทาง intake · ระบบช่วยอ่านสลิป/ไฟล์ + จับคู่ SKU · ตรวจสอบก่อนยืนยัน
            โดยใช้ order เดียวกันต่อเนื่องไปยัง Planning และคิวจัดส่ง
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="muted" className="gap-1">
            <Coins className="h-3 w-3 text-warning" />
            มูลค่าในคิว {formatTHB(inboxValue)}
          </Badge>
        </div>
      </div>

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
              onConfirm={confirmOrder}
              onFinishParsing={finishParsingOrder}
              onSaveCustomer={updateOrderCustomer}
              onChangeShippingMethod={setShippingMethod}
              onRequestCancel={setCancelTargetId}
            />
          ) : (
            <div>ไม่ได้เลือก</div>
          )}
        </Card>
      </div>

      {/* มือถือ: เปิดรายละเอียดออเดอร์เต็มจอ (action ต่าง ๆ อยู่ใน OrderDetail แล้ว) */}
      <MobileDetailSheet
        open={!!selected && mobileDetailOpen}
        title={<span className="font-mono">{selected?.code}</span>}
        subtitle={selected ? statusLabel[selected.status] : undefined}
        onClose={() => setMobileDetailOpen(false)}
      >
        {selected && (
          <OrderDetail
            order={selected}
            onConfirm={confirmOrder}
            onFinishParsing={finishParsingOrder}
            onSaveCustomer={updateOrderCustomer}
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
    </div>
  );
}

export default InboxPage;
