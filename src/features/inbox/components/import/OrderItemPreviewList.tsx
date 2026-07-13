import { Badge } from '@/components/ui/badge';
import { formatTHB, type Order } from '@/data/orderTypes';
import { hasItemValue } from '@/features/inbox/utils/importCardModel';

export function OrderItemPreviewList({ order }: { order: Order }) {
  const visibleItems = order.items.slice(0, 4);
  const hiddenCount = Math.max(0, order.items.length - visibleItems.length);

  return (
    <div className="mt-2 rounded-md border bg-background">
      <div className="divide-y">
        {visibleItems.map((item, index) => (
          <div
            key={`${item.sku}-${index}`}
            className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate text-xs font-medium">{item.name}</span>
                {hasItemValue(item.purity) && (
                  <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                    {item.purity}
                  </Badge>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {hasItemValue(item.sku) && <span className="font-mono">{item.sku}</span>}
                {hasItemValue(item.weight) && <span>นน. {item.weight}</span>}
                <span>ราคา/ชิ้น {formatTHB(item.unitPrice)}</span>
              </div>
            </div>
            <div className="text-right text-xs tabular-nums">
              <div className="font-semibold">× {item.qty}</div>
              <div className="text-[11px] text-muted-foreground">
                {formatTHB(item.qty * item.unitPrice)}
              </div>
            </div>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          อีก {hiddenCount.toLocaleString('th-TH')} SKU
        </div>
      )}
    </div>
  );
}
