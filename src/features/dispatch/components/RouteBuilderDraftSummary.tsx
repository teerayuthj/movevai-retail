import { Archive, MapPin, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RouteBuilderDraft } from '@/features/dispatch/routeBuilderDraft';

export function RouteBuilderDraftSummary({
  draft,
  onContinue,
  onDelete,
}: {
  draft: RouteBuilderDraft | null;
  onContinue: () => void;
  onDelete: () => void;
}) {
  if (!draft || draft.jobs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Archive className="h-8 w-8 text-muted-foreground" />
          <div className="font-medium">ยังไม่มีเที่ยวฉบับร่าง</div>
          <p className="text-sm text-muted-foreground">
            เที่ยวที่กดเก็บเป็นฉบับร่างจะกลับมาแก้ไขและส่งใหม่ได้จากหน้านี้
          </p>
        </CardContent>
      </Card>
    );
  }

  const stops = draft.jobs.flatMap((job) => [job.pickup, job.dropoff]).filter(Boolean);
  const first = stops[0];
  const last = stops[stops.length - 1];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">
              เที่ยว {first?.name ?? 'จุดรับ'} → {last?.name ?? 'จุดส่ง'}
            </CardTitle>
            <CardDescription>
              {draft.jobs.length} งาน · {stops.length} จุด · บันทึกอยู่ในอุปกรณ์นี้
            </CardDescription>
          </div>
          <Badge variant="info">ฉบับร่าง</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {stops.map((stop, index) => (
            <div key={`${stop!.id}-${index}`} className="rounded-xl border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Badge variant={stop!.kind === 'pickup' ? 'info' : 'success'}>
                  {stop!.kind === 'pickup' ? 'รับ' : 'ส่ง'}
                </Badge>
                <span className="truncate">{stop!.name}</span>
              </div>
              <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{stop!.address}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={onContinue}>
            <Pencil className="h-4 w-4" /> แก้ไขเที่ยวต่อ
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" /> ลบฉบับร่าง
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
