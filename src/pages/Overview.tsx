import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { DriverAvatar } from "@/components/DriverAvatar";
import {
  TrendingUp,
  TrendingDown,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { weeklyVolume, sourceBreakdown, statusLabel, formatTHB } from "@/data/mock";
import { Coins } from "lucide-react";
import { useRetailStore } from "@/state/retailStore";

function StatCard({
  title,
  value,
  delta,
  trend,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  icon: any;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          <span
            className={
              trend === "up"
                ? "inline-flex items-center gap-0.5 text-emerald-600"
                : "inline-flex items-center gap-0.5 text-red-600"
            }
          >
            {trend === "up" ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta}
          </span>
          <span className="text-muted-foreground">{hint}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const { orders, drivers } = useRetailStore();
  const activeDrivers = drivers.filter((d) => d.status !== "off_duty").length;
  const inTransit = orders.filter((o) => o.status === "in_transit").length;
  const deliveredToday = orders.filter((o) => o.status === "delivered").length;
  const pending = orders.filter((o) =>
    ["new", "needs_review", "parsing", "ready"].includes(o.status)
  ).length;
  const totalValueToday = orders.reduce((s, o) => s + o.totalValue, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            ภาพรวมการจัดส่ง — Ausiris
          </h1>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>ปริมาณ Orders รายวัน</CardTitle>
                <CardDescription>7 วันล่าสุด</CardDescription>
              </div>
              <Badge variant="muted">สัปดาห์นี้</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyVolume} barCategoryGap={16}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" width={28} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="delivered" fill="#a7f3d0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ช่องทางรับ Orders</CardTitle>
            <CardDescription>สัดส่วนแหล่งที่มา</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={sourceBreakdown}
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {sourceBreakdown.map((s) => (
                    <Cell key={s.name} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-1.5">
              {sourceBreakdown.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1">{s.name}</span>
                  <span className="font-medium">{s.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>คนขับที่ปฏิบัติงานอยู่</CardTitle>
                <CardDescription>ภาระงานและความจุ</CardDescription>
              </div>
              <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                ดูทั้งหมด <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {drivers
              .filter((d) => d.status !== "off_duty")
              .map((d) => {
                const pct = (d.activeOrders / d.capacity) * 100;
                return (
                  <div key={d.id} className="flex items-center gap-3">
                    <DriverAvatar driver={d} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{d.name}</span>
                        <Badge
                          variant={d.status === "available" ? "success" : "muted"}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {d.status === "available" ? "ว่าง" : "กำลังส่ง"}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Progress value={pct} className="h-1.5 flex-1" />
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {d.activeOrders}/{d.capacity}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {d.zone} · ⭐ {d.rating}
                      </div>
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>กำลังจัดส่ง</CardTitle>
            <CardDescription>Realtime</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {orders
              .filter((o) => o.status === "in_transit")
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
                      คนขับ: {driver?.name ?? "-"}
                    </div>
                    <Progress value={65} className="mt-2 h-1.5" />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      ถึงใน ~18 นาที
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
