import type { ComponentType } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp } from 'lucide-react';

type StatCardProps = {
  title: string;
  value: string;
  delta: string;
  trend: 'up' | 'down';
  icon: ComponentType<{ className?: string }>;
  hint: string;
};

export function StatCard({ title, value, delta, trend, icon: Icon, hint }: StatCardProps) {
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
              trend === 'up'
                ? 'inline-flex items-center gap-0.5 text-success'
                : 'inline-flex items-center gap-0.5 text-destructive'
            }
          >
            {trend === 'up' ? (
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
