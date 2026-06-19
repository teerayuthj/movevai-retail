import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TransformResult } from '@/lib/csvScriptTransform';
import type { TransformTemplate } from '@/lib/transformTemplates';

type TransformResultViewProps = {
  result: TransformResult;
  template: TransformTemplate;
  onDownload: () => void;
};

export function TransformResultView({ result, template, onDownload }: TransformResultViewProps) {
  const previewRows = useMemo(() => result.rows.slice(0, 10), [result]);
  const detectedEntries = useMemo(() => Object.entries(result.detectedMapping), [result]);

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">3. ผลลัพธ์</CardTitle>
              <CardDescription>
                แปลง {result.rows.length} แถว จาก {result.sourceRowCount} แถว
                {result.warnings.length > 0 && (
                  <span className="ml-2 text-warning">· warning {result.warnings.length} จุด</span>
                )}
              </CardDescription>
            </div>
            <Button type="button" onClick={onDownload}>
              <Download className="h-4 w-4" />
              ดาวน์โหลด CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 text-sm font-medium">Header mapping ที่ตรวจพบ</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {detectedEntries.map(([semantic, header]) => (
                <div
                  key={semantic}
                  className="flex items-center justify-between rounded-lg border bg-muted px-3 py-2 text-xs"
                >
                  <span className="font-mono text-muted-foreground">{semantic}</span>
                  {header ? (
                    <Badge variant="secondary" className="gap-1 font-mono">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      {header}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      ไม่พบ
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium">
              ตัวอย่างผลลัพธ์ ({previewRows.length} แถวแรก)
            </div>
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-muted text-left">
                  <tr>
                    {template.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap px-2 py-1.5 font-mono">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={idx} className="border-t hover:bg-muted">
                      {template.headers.map((h) => (
                        <td key={h} className="whitespace-nowrap px-2 py-1.5">
                          {(row as Record<string, string>)[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {result.warnings.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <CardTitle className="text-base">Warnings ({result.warnings.length})</CardTitle>
            </div>
            <CardDescription>เคสที่ script ไม่มั่นใจ — ควรตรวจทานก่อนนำไปใช้</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-72 overflow-y-auto rounded-xl border bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-muted text-left">
                  <tr>
                    <th className="px-3 py-2">แถว</th>
                    <th className="px-3 py-2">Field</th>
                    <th className="px-3 py-2">ข้อความ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.warnings.map((w, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{w.row}</td>
                      <td className="px-3 py-1.5 font-mono">{w.field}</td>
                      <td className="px-3 py-1.5">{w.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
