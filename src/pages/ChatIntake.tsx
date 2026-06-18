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

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
};

type ChatIntakeError = {
  title: string;
  message: string;
  suggestions: string[];
  meta: string[];
};

const MAX_CLIENT_FILE_BYTES = 5 * 1024 * 1024;

function isSupportedSpreadsheet(file: File) {
  return /\.(csv|xls|xlsx)$/i.test(file.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createChatIntakeError(
  title: string,
  message: string,
  suggestions: string[] = [],
  meta: string[] = [],
): ChatIntakeError {
  return { title, message, suggestions, meta };
}

function parseJsonSafely(input: string) {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

function parseApiError(payload: unknown): ChatIntakeError {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const details = isRecord(error.details) ? error.details : {};
  const reason = typeof details.reason === 'string' ? details.reason : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const message =
    typeof error.message === 'string' && error.message.trim().length > 0
      ? error.message
      : 'แปลงไฟล์ไม่สำเร็จ';
  const suggestions = Array.isArray(details.suggestions)
    ? details.suggestions.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];
  const meta: string[] = [];

  if (typeof details.fileName === 'string' && details.fileName.trim().length > 0) {
    meta.push(`ไฟล์: ${details.fileName}`);
  }

  if (typeof details.actual === 'number' && typeof details.limit === 'number') {
    const unit =
      details.unit === 'rows'
        ? 'แถว'
        : details.unit === 'chars'
          ? 'ตัวอักษร'
          : details.unit === 'mb'
            ? 'MB'
            : details.unit === 'bytes'
              ? 'bytes'
              : '';
    if (unit) {
      meta.push(
        `ค่าปัจจุบัน ${details.actual.toLocaleString()} / จำกัด ${details.limit.toLocaleString()} ${unit}`,
      );
    }
  }

  if (typeof error.requestId === 'string' && error.requestId.trim().length > 0) {
    meta.push(`Request ID: ${error.requestId}`);
  }

  let title = 'แปลงไฟล์ไม่สำเร็จ';
  if (reason === 'too_many_rows') title = 'จำนวนแถวเกินกำหนด';
  else if (reason === 'file_too_large') title = 'ไฟล์ใหญ่เกินกำหนด';
  else if (reason === 'csv_text_too_large') title = 'ข้อมูลในไฟล์ยาวเกินกำหนด';
  else if (reason === 'unsupported_file_type') title = 'ชนิดไฟล์ไม่รองรับ';
  else if (reason === 'missing_header_or_rows') title = 'รูปแบบไฟล์ไม่ครบ';
  else if (reason === 'missing_sheet') title = 'ไม่พบชีตในไฟล์ Excel';
  else if (reason === 'ai_timeout') title = 'ประมวลผลนานเกินกำหนด';
  else if (reason === 'ai_rate_limit') title = 'เกินวงเงินการประมวลผลชั่วคราว';
  else if (reason === 'invalid_ai_json' || reason === 'invalid_ai_payload_shape')
    title = 'AI ส่งผลลัพธ์ไม่สมบูรณ์';
  else if (reason === 'ai_row_count_mismatch') title = 'จำนวนแถวผลลัพธ์ไม่ตรงกับต้นทาง';
  else if (code === 'VALIDATION_ERROR') title = 'ข้อมูลไฟล์ไม่ผ่านเงื่อนไข';

  return createChatIntakeError(
    title,
    message,
    suggestions.length > 0 ? suggestions : ['ตรวจสอบไฟล์แล้วลองใหม่อีกครั้ง'],
    meta,
  );
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
  const [error, setError] = useState<ChatIntakeError | null>(null);
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
      setError(
        createChatIntakeError('ชนิดไฟล์ไม่รองรับ', 'รองรับเฉพาะไฟล์ .csv, .xls และ .xlsx', [
          'บันทึกไฟล์ใหม่เป็น .csv, .xls หรือ .xlsx',
        ]),
      );
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (nextFile && nextFile.size > MAX_CLIENT_FILE_BYTES) {
      setFile(null);
      setError(
        createChatIntakeError(
          'ไฟล์ใหญ่เกินกำหนด',
          `ไฟล์มีขนาด ${formatFileSize(nextFile.size)} ซึ่งเกินกว่าที่ระบบรองรับสูงสุด ${formatFileSize(MAX_CLIENT_FILE_BYTES)}`,
          [
            'ลดจำนวนแถวหรือคอลัมน์ที่ไม่จำเป็นก่อนอัปโหลด',
            'ถ้าไฟล์ยังใหญ่ ให้แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละชุด',
          ],
        ),
      );
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

      const payloadText = await response.text();
      const payload = parseJsonSafely(payloadText);
      if (!response.ok) {
        setError(parseApiError(payload));
        return;
      }
      if (!payload || typeof payload !== 'object') {
        setError(
          createChatIntakeError(
            'ผลลัพธ์ไม่ถูกต้อง',
            'ระบบได้รับคำตอบกลับมาไม่ครบ จึงยังสร้างไฟล์ให้ไม่ได้',
            ['ลองส่งไฟล์เดิมอีกครั้ง'],
          ),
        );
        return;
      }

      setResult(payload as TransformResult);
    } catch (caught) {
      setError(
        createChatIntakeError(
          'เชื่อมต่อระบบไม่สำเร็จ',
          caught instanceof Error ? caught.message : 'ไม่สามารถเชื่อมต่อ backend ได้ในขณะนี้',
          ['ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง'],
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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

      <Card className="border-border">
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
              'rounded-2xl border border-dashed bg-muted p-6 transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
            )}
          >
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs">
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
              <FileSpreadsheet className="h-4 w-4 text-success" />
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
              className="min-h-24 w-full rounded-xl border bg-white px-3 py-2 text-sm outline-hidden transition-colors placeholder:text-muted-foreground focus:border-primary"
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
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <div className="font-medium text-destructive">{error.title}</div>
              <div className="mt-1">{error.message}</div>
              {error.suggestions.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-destructive">
                  {error.suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {error.meta.length > 0 && (
                <div className="mt-3 space-y-1 text-xs text-destructive">
                  {error.meta.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
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
