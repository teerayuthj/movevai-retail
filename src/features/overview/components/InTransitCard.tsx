import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { type Driver, type Order, statusLabel } from '@/data/mock';

export function InTransitCard({ orders, drivers }: { orders: Order[]; drivers: Driver[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>กำลังจัดส่ง</CardTitle>
        <CardDescription>Realtime</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {orders
          .filter((o) => o.status === 'in_transit')
          .map((o) => {
            const driver = drivers.find((d) => d.id === o.assignedDriverId);
            return (
              <div key={o.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium">{o.code}</span>
                  <Badge variant="muted" className="h-5 px-1.5 text-[10px]">
                    {statusLabel[o.status]}
                  </Badge>
                </div>
                <div className="mt-1 text-sm font-medium">{o.customer.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  คนขับ: {driver?.name ?? '-'}
                  {o.coDriverIds && o.coDriverIds.length > 0 && (
                    <span className="ml-1 text-info">+{o.coDriverIds.length} ร่วมส่ง</span>
                  )}
                </div>
                <Progress value={65} className="mt-2 h-1.5" />
                <div className="mt-1 text-[11px] text-muted-foreground">ถึงใน ~18 นาที</div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
