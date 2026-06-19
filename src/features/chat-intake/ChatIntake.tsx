import { useRef, useState } from 'react';
import { FileSpreadsheet, Inbox, Loader2, Sparkles, UploadCloud, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChatIntakeResult } from './components/ChatIntakeResult';
import {
  MAX_CLIENT_FILE_BYTES,
  type ChatIntakeError,
  type TransformResult,
  createChatIntakeError,
  formatFileSize,
  isSupportedSpreadsheet,
  requestCsvTransform,
} from './utils/chatIntakeApi';

export function ChatIntakePage({ onOpenInbox }: { onOpenInbox: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState('');
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ChatIntakeError | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);

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
      setResult(await requestCsvTransform(file, instructions));
    } catch (caught) {
      // requestCsvTransform โยน ChatIntakeError เสมอ; กันเคสไม่คาดคิดไว้อีกชั้น
      setError(
        (caught as ChatIntakeError)?.title
          ? (caught as ChatIntakeError)
          : createChatIntakeError(
              'เกิดข้อผิดพลาด',
              caught instanceof Error ? caught.message : 'ลองใหม่อีกครั้ง',
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

      {result && <ChatIntakeResult result={result} />}
    </div>
  );
}
