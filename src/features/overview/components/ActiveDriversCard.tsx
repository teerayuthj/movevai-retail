import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DriverAvatar } from '@/components/DriverAvatar';
import { ArrowUpRight } from 'lucide-react';
import type { Driver } from '@/data/mock';

export function ActiveDriversCard({ drivers }: { drivers: Driver[] }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>คนขับที่ปฏิบัติงานอยู่</CardTitle>
            <CardDescription>สถานะและจำนวนงานปัจจุบัน</CardDescription>
          </div>
          <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            ดูทั้งหมด <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {drivers
          .filter((d) => d.status !== 'off_duty')
          .map((d) => (
            <div key={d.id} className="flex items-center gap-3">
              <DriverAvatar driver={d} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <Badge
                    variant={d.status === 'available' ? 'success' : 'muted'}
                    className="h-5 px-1.5 text-[10px]"
                  >
                    {d.status === 'available' ? 'ว่าง' : 'กำลังส่ง'}
                  </Badge>
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  งานที่รับอยู่ {d.activeOrders}
                </div>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
