import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isHighValueOrder } from '@/lib/deliveryExecution';
import { formatTHB, paymentLabel, type Order } from '@/data/mock';
import {
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  IdCard,
  MapPin,
  Navigation,
  Package,
  Phone,
  ShieldCheck,
} from 'lucide-react';

export function JobCard({
  order,
  onStart,
  onClose,
}: {
  order: Order;
  onStart: () => void;
  onClose: () => void;
}) {
  const isCod = order.payment === 'cod' || order.payment === 'transfer_on_delivery';

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium">{order.code}</span>
        <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
          <Package className="h-3 w-3" /> {order.items.length}
        </Badge>
      </div>
      <div className="mt-1 text-sm font-semibold">{order.customer.name}</div>

      <div className="mt-2 space-y-1.5 text-[12px] text-muted-foreground">
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{order.customer.address}</span>
        </div>
        <a href={`tel:${order.customer.phone}`} className="flex items-center gap-1.5 text-sky-600">
          <Phone className="h-3.5 w-3.5" />
          <span>{order.customer.phone}</span>
        </a>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {isHighValueOrder(order) && (
          <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <ShieldCheck className="h-2.5 w-2.5" />
            ของมีค่า
          </Badge>
        )}
        {order.requiresIdCheck && (
          <Badge variant="warning" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <IdCard className="h-2.5 w-2.5" />
            ตรวจบัตร
          </Badge>
        )}
        {isCod && (
          <Badge variant="muted" className="h-5 gap-0.5 px-1.5 text-[10px]">
            <Banknote className="h-2.5 w-2.5" />
            {paymentLabel[order.payment]}
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t pt-3">
        <span className="text-sm font-semibold tabular-nums text-amber-800">
          {formatTHB(order.totalValue)}
        </span>

        {order.status === 'assigned' && (
          <Button size="sm" onClick={onStart}>
            <Navigation className="h-4 w-4" />
            เริ่มเดินทาง
          </Button>
        )}
        {order.status === 'in_transit' && (
          <Button size="sm" onClick={onClose}>
            <CheckCircle2 className="h-4 w-4" />
            ปิดงาน
          </Button>
        )}
        {order.status === 'pending_confirmation' && (
          <Badge variant="warning" className="gap-1">
            <ClipboardCheck className="h-3 w-3" />
            รอ CS ยืนยัน
          </Badge>
        )}
        {order.status === 'delivered' && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            ส่งสำเร็จ
          </Badge>
        )}
      </div>
    </div>
  );
}
