import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { Order } from '@/data/orderTypes';
import OrderListItem from '@/features/inbox/components/OrderListItem';
import {
  FILTER_LABEL,
  INBOX_FILTERS,
  type InboxFilter,
} from '@/features/inbox/hooks/useOrderFiltering';
import { cn } from '@/lib/utils';

type OrderListPanelProps = {
  filteredOrders: Order[];
  selectedId: string | null;
  onSelect: (orderId: string) => void;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  query: string;
  onQueryChange: (query: string) => void;
  filterCounts: Record<InboxFilter, number>;
};

export default function OrderListPanel({
  filteredOrders,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
  query,
  onQueryChange,
  filterCounts,
}: OrderListPanelProps) {
  return (
    <Card className="flex h-[calc(100vh-12rem)] flex-col">
      <CardHeader className="pb-3">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="ค้นหา order / ลูกค้า / SKU..."
          className="h-8"
        />

        <div className="mt-2 flex gap-1">
          {INBOX_FILTERS.map((currentFilter) => (
            <button
              key={currentFilter}
              type="button"
              onClick={() => onFilterChange(currentFilter)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                filter === currentFilter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {FILTER_LABEL[currentFilter]}
              <span className="ml-1 opacity-70">{filterCounts[currentFilter] ?? 0}</span>
            </button>
          ))}
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 space-y-2 overflow-auto p-3">
        {filteredOrders.map((order) => (
          <OrderListItem
            key={order.id}
            order={order}
            selected={selectedId === order.id}
            onClick={() => onSelect(order.id)}
          />
        ))}

        {filteredOrders.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            ไม่มี orders ในหมวดนี้
          </div>
        )}
      </CardContent>
    </Card>
  );
}
