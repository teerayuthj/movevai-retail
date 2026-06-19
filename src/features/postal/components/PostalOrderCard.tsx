import { Badge } from '@/components/ui/badge';
import { type Order, formatTHB, paymentLabel, postalServiceLabel, statusLabel } from '@/data/mock';
import { cn } from '@/lib/utils';
import { CheckCircle2, ClipboardCheck, Coins, Mailbox, MapPin, Package, Phone } from 'lucide-react';

type PostalOrderCardProps = {
  order: Order;
  selected: boolean;
  onClick: () => void;
  checkbox?: boolean;
  onToggle?: (next: boolean) => void;
};

export function PostalOrderCard({
  order,
  selected,
  onClick,
  checkbox,
  onToggle,
}: PostalOrderCardProps) {
  const checked = !!checkbox;
  const postcode = order.customer.address.match(/\b\d{5}\b/)?.[0];
  const batch = order.postalBatch;
  return (
    <div
      className={cn(
        'w-full rounded-lg border bg-card p-4 text-left transition-all',
        selected ? 'border-primary ring-1 ring-primary shadow-xs' : 'hover:border-primary/40',
      )}
    >
      <div className="flex items-start gap-3">
        {onToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!checked);
            }}
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/30 hover:border-primary',
            )}
            aria-pressed={checked}
          >
            {checked && <CheckCircle2 className="h-3 w-3" />}
          </button>
        )}
        <button onClick={onClick} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-medium">{order.code}</span>
            <Badge
              variant={
                order.status === 'failed'
                  ? 'warning'
                  : order.status === 'ready'
                    ? 'success'
                    : 'muted'
              }
              className="h-5 px-1.5 text-[10px]"
            >
              {statusLabel[order.status]}
            </Badge>
            {batch?.service && (
              <Badge variant="muted" className="h-5 gap-1 px-1.5 text-[10px]">
                <Mailbox className="h-2.5 w-2.5" />
                {postalServiceLabel[batch.service]}
              </Badge>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{order.customer.address}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              <span>{order.customer.phone}</span>
              {postcode && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {postcode}
                </span>
              )}
            </div>
            {batch?.trackingNumber && (
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-foreground">
                <ClipboardCheck className="h-3 w-3" />
                {batch.trackingNumber}
              </div>
            )}
            {batch?.batchId && <div className="text-[10px]">Batch {batch.batchId}</div>}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Coins className="h-3 w-3 text-warning" />
              {paymentLabel[order.payment]}
            </div>
            <span className="text-sm font-semibold tabular-nums text-warning">
              {formatTHB(order.totalValue)}
            </span>
          </div>
        </button>
        <Badge variant="muted" className="shrink-0">
          <Package className="h-3 w-3" /> {order.items.length}
        </Badge>
      </div>
    </div>
  );
}
