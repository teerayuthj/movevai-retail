import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type TransformResult, downloadCsv } from '../utils/chatIntakeApi';

export function ChatIntakeResult({ result }: { result: TransformResult }) {
  const previewLines = useMemo(() => result.csvContent.trim().split(/\r?\n/).slice(0, 8), [result]);

  return (
    <Card className="border-success/30">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">ผลลัพธ์พร้อมดาวน์โหลด</CardTitle>
            <CardDescription>
              แปลงแล้ว {result.rowCount} แถว ผ่าน {result.provider} / {result.model}
            </CardDescription>
          </div>
          <Button type="button" onClick={() => downloadCsv(result.fileName, result.csvContent)}>
            <Download className="h-4 w-4" />
            ดาวน์โหลด CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Alias
            </div>
            <div className="mt-1 text-sm font-medium">{result.alias}</div>
          </div>
          <div className="rounded-xl border bg-muted px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Request ID
            </div>
            <div className="mt-1 truncate font-mono text-xs">{result.requestId}</div>
          </div>
          <div className="rounded-xl border bg-muted px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Latency
            </div>
            <div className="mt-1 text-sm font-medium">{(result.latencyMs / 1000).toFixed(1)}s</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">ตัวอย่างผลลัพธ์</div>
          <pre className="overflow-x-auto rounded-xl border bg-slate-950 p-4 text-xs text-slate-100">
            {previewLines.join('\n')}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
