import { useMemo, useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Inbox,
  Loader2,
  Sparkles,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type TransformResult = {
  requestId: string;
  alias: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  fileName: string;
  csvContent: string;
  rowCount: number;
  latencyMs: number;
};

function isSupportedSpreadsheet(file: File) {
  return /\.(csv|xls|xlsx)$/i.test(file.name);
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function encodeFileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function ChatIntakePage({ onOpenInbox }: { onOpenInbox: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);

  const previewLines = useMemo(
    () => (result ? result.csvContent.trim().split(/\r?\n/).slice(0, 8) : []),
    [result],
  );

  const pickFile = (nextFile: File | null) => {
    setError(null);
    setResult(null);
    if (nextFile && !isSupportedSpreadsheet(nextFile)) {
      setFile(null);
      setError('รองรับเฉพาะไฟล์ .csv, .xls และ .xlsx');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(nextFile);
    if (inputRef.current && !nextFile) {
      inputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!file) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const fileBase64 = await encodeFileAsBase64(file);
      const response = await fetch('/api/ai/chat-intake/csv-transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alias: 'test_chat',
          fileName: file.name,
          fileBase64,
          mimeType: file.type || undefined,
          instructions: instructions.trim() || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? 'แปลงไฟล์ไม่สำเร็จ');
      }

      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'แปลงไฟล์ไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chat Intake</h1>
          <p className="text-sm text-muted-foreground">
            ทดสอบแปลงไฟล์ CSV ผ่าน AI alias{' '}
            <span className="font-medium text-foreground">test_chat</span>
          </p>
        </div>
        <Button variant="outline" onClick={onOpenInbox}>
          <Inbox className="h-4 w-4" />
          เปิด Order Inbox
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">CSV Transform Test</CardTitle>
            <Badge variant="muted" className="gap-1">
              <Sparkles className="h-3 w-3" />
              movevai-csv-transform
            </Badge>
          </div>
          <CardDescription>
            เลือกไฟล์ `.csv`, `.xls` หรือ `.xlsx` 1 ไฟล์ แล้วระบบจะส่งเข้า backend เพื่อให้ AI
            แปลงและคืนไฟล์ CSV ใหม่กลับมา รองรับการนำเข้าและส่งออกสูงสุด 500 แถวต่อครั้ง
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pickFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              'rounded-2xl border border-dashed bg-slate-50 p-6 transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-slate-300',
            )}
          >
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                <UploadCloud className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">ลากไฟล์ CSV มาวาง หรือเลือกไฟล์</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  รองรับ `.csv`, `.xls`, `.xlsx` สูงสุด 500 แถว และจะคืนผลลัพธ์เป็น `.csv`
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <FileSpreadsheet className="h-4 w-4" />
                เลือกไฟล์
              </Button>
            </div>
          </div>

          {file && (
            <div className="flex items-center gap-3 rounded-xl border bg-white px-4 py-3">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => pickFile(null)}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`ลบไฟล์ ${file.name}`}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-sm font-medium">คำสั่งเสริมถึง AI</div>
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="ไม่บังคับ เช่น ให้คง order id เดิม หรือเน้น map ปลายทางเฉพาะบาง field"
              className="min-h-24 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-muted-foreground">
              backend จะคืนไฟล์ CSV ใหม่ตามจำนวนแถวที่แปลงสำเร็จ สูงสุด 500 แถวต่อครั้ง
            </div>
            <Button type="button" disabled={!file || submitting} onClick={handleSubmit}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              แปลงเป็น CSV ใหม่
            </Button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="border-emerald-200">
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
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Alias
                </div>
                <div className="mt-1 text-sm font-medium">{result.alias}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Request ID
                </div>
                <div className="mt-1 truncate font-mono text-xs">{result.requestId}</div>
              </div>
              <div className="rounded-xl border bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Latency
                </div>
                <div className="mt-1 text-sm font-medium">
                  {(result.latencyMs / 1000).toFixed(1)}s
                </div>
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
      )}
    </div>
  );
}
