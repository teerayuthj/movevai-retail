import type { ComponentType } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type StatCardProps = {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  // คำอธิบายสั้น ๆ ที่คำนวณจากข้อมูลจริงเท่านั้น (เช่น "3 ส่งแล้ว")
  // ไม่มี trend %/ลูกศร เพราะยังไม่มี baseline ย้อนหลังจาก backend
  hint?: string;
};

export function StatCard({ title, value, icon: Icon, hint }: StatCardProps) {
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
        {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
