import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlanningRoute } from '@/lib/retailApi';
import { BellRing, RefreshCw, Route } from 'lucide-react';

export function PublishedRoutesCard({
  routes,
  onRetry,
}: {
  routes: PlanningRoute[];
  onRetry: (routeId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Routes ที่ Publish แล้ว</CardTitle>
        <CardDescription>สถานะงานและ Push notification ของวันที่เลือก</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {routes.map((route) => (
          <div key={route.id} className="rounded-xl border p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 font-medium">
                <Route className="h-4 w-4 shrink-0" />
                <span className="truncate">{route.code}</span>
              </div>
              <Badge
                variant={
                  route.pushStatus === 'succeeded'
                    ? 'success'
                    : route.pushStatus === 'failed'
                      ? 'warning'
                      : 'secondary'
                }
              >
                <BellRing className="h-3 w-3" /> {route.pushStatus}
              </Badge>
            </div>
            <div className="mt-2 text-muted-foreground">
              {route.driver.name} · {route.stops.length} จุดส่ง
            </div>
            {route.pushError && <div className="mt-2 text-destructive">{route.pushError}</div>}
            {route.pushStatus === 'failed' && (
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={() => onRetry(route.id)}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Retry Push
              </Button>
            )}
          </div>
        ))}
        {routes.length === 0 && (
          <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
            ยังไม่มี Route ที่ Publish ในวันนี้
          </div>
        )}
      </CardContent>
    </Card>
  );
}
