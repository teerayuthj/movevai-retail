import { Clock, Coins, Package, Truck } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';
import { formatTHB } from '@/data/orderTypes';
import { useRetailStore } from '@/state/retailStore';
import { StatCard } from './components/StatCard';
import { ActiveDriversCard } from './components/ActiveDriversCard';
import { InTransitCard } from './components/InTransitCard';

export function OverviewPage() {
  const { orders, drivers } = useRetailStore();
  const today = new Date();
  const activeDrivers = drivers.filter((d) => d.status !== 'off_duty').length;
  const ordersToday = orders.filter((o) => isSameDay(new Date(o.receivedAt), today)).length;
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
            ทองคำแท่ง · ทองรูปพรรณ · เงินแท่ง ·{' '}
            {format(today, 'EEEEที่ d MMMM yyyy', { locale: th })}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Orders วันนี้"
          value={String(ordersToday)}
          hint="รับเข้าวันนี้"
          icon={Package}
        />
        <StatCard title="รอจัดคิว" value={String(pending)} hint="ยังไม่ได้จ่ายงาน" icon={Clock} />
        <StatCard
          title="กำลังจัดส่ง"
          value={String(inTransit)}
          hint={`${activeDrivers} คนขับออนไลน์`}
          icon={Truck}
        />
        <StatCard
          title="มูลค่ารวม"
          value={formatTHB(totalValueToday)}
          hint={`${deliveredToday} ส่งแล้ว`}
          icon={Coins}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActiveDriversCard drivers={drivers} />
        <InTransitCard orders={orders} drivers={drivers} />
      </div>
    </div>
  );
}
