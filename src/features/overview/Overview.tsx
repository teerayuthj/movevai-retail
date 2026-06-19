import { Clock, Coins, Package, Truck } from 'lucide-react';
import { formatTHB } from '@/data/mock';
import { useRetailStore } from '@/state/retailStore';
import { StatCard } from './components/StatCard';
import { OverviewCharts } from './components/OverviewCharts';
import { ActiveDriversCard } from './components/ActiveDriversCard';
import { InTransitCard } from './components/InTransitCard';

export function OverviewPage() {
  const { orders, drivers } = useRetailStore();
  const activeDrivers = drivers.filter((d) => d.status !== 'off_duty').length;
  const inTransit = orders.filter((o) => o.status === 'in_transit').length;
  const deliveredToday = orders.filter((o) => o.status === 'delivered').length;
  const pending = orders.filter((o) =>
    ['new', 'needs_review', 'parsing', 'ready'].includes(o.status),
  ).length;
  const totalValueToday = orders.reduce((s, o) => s + o.totalValue, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ภาพรวมการจัดส่ง — Ausiris</h1>
          <p className="text-sm text-muted-foreground">
            ทองคำแท่ง · ทองรูปพรรณ · เงินแท่ง · อัพเดต 2 นาทีที่แล้ว · ศุกร์ที่ 24 เมษายน 2026
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Orders วันนี้"
          value="72"
          delta="+18%"
          trend="up"
          hint="เทียบเมื่อวาน"
          icon={Package}
        />
        <StatCard
          title="รอจัดคิว"
          value={String(pending)}
          delta="-3"
          trend="down"
          hint="ลดจากเช้านี้"
          icon={Clock}
        />
        <StatCard
          title="กำลังจัดส่ง"
          value={String(inTransit)}
          delta={`${activeDrivers} คนขับ`}
          trend="up"
          hint="ออนไลน์"
          icon={Truck}
        />
        <StatCard
          title="มูลค่าวันนี้"
          value={formatTHB(totalValueToday)}
          delta={`${deliveredToday} ส่งแล้ว`}
          trend="up"
          hint={`อัตราสำเร็จ 96%`}
          icon={Coins}
        />
      </div>

      <OverviewCharts />

      <div className="grid gap-4 lg:grid-cols-3">
        <ActiveDriversCard drivers={drivers} />
        <InTransitCard orders={orders} drivers={drivers} />
      </div>
    </div>
  );
}
