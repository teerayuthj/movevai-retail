import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Play,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { parseCsv, serializeCsv, type TransformResult } from '@/lib/csvScriptTransform';
import { TRANSFORM_TEMPLATES, type TransformTemplate } from '@/lib/transformTemplates';

function isExcelFile(file: File) {
  return /\.(xls|xlsx)$/i.test(file.name);
}

function isCsvFile(file: File) {
  return /\.csv$/i.test(file.name);
}

type LoadedWorkbook = {
  workbook: XLSX.WorkBook;
  sheetNames: string[];
};

async function readWorkbook(file: File): Promise<LoadedWorkbook> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  if (workbook.SheetNames.length === 0) throw new Error('ไม่พบ sheet ในไฟล์ Excel');
  return { workbook, sheetNames: workbook.SheetNames };
}

function workbookSheetToCsv(wb: XLSX.WorkBook, sheetName: string): string {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`ไม่พบ sheet "${sheetName}"`);
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: TransformTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!template.available}
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-start rounded-xl border p-4 text-left transition-all',
        template.available
          ? selected
            ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          : 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60',
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3">
          <CheckCircle2 className="h-4 w-4 text-primary" />
        </span>
      )}
      {!template.available && (
        <span className="absolute right-3 top-3">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      )}
      <div className="mb-1 text-sm font-semibold leading-tight">{template.label}</div>
      <div className="text-xs text-muted-foreground">
        {template.available ? `${template.fieldCount} fields` : 'เร็วๆ นี้'}
      </div>
    </button>
  );
}

export function ScriptTransformPage() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<TransformTemplate>(
    TRANSFORM_TEMPLATES.find((t) => t.available) ?? TRANSFORM_TEMPLATES[0],
  );
  const [file, setFile] = useState<File | null>(null);
  const [loadedWorkbook, setLoadedWorkbook] = useState<LoadedWorkbook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransformResult | null>(null);

  const previewRows = useMemo(() => result?.rows.slice(0, 10) ?? [], [result]);

  const pickFile = async (next: File | null) => {
    setError(null);
    setResult(null);
    setLoadedWorkbook(null);
    setSelectedSheet(null);
    setSourceText('');
    if (!next) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (!isCsvFile(next) && !isExcelFile(next)) {
      setError('รองรับเฉพาะไฟล์ .csv, .xls, .xlsx');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (next.size > MAX_FILE_BYTES) {
      setError(`ไฟล์ใหญ่เกินกำหนด ${formatFileSize(MAX_FILE_BYTES)}`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    try {
      setFile(next);
      if (isExcelFile(next)) {
        const wb = await readWorkbook(next);
        setLoadedWorkbook(wb);
        // single sheet → auto-select
        if (wb.sheetNames.length === 1) {
          setSelectedSheet(wb.sheetNames[0]);
          setSourceText(workbookSheetToCsv(wb.workbook, wb.sheetNames[0]));
        }
      } else {
        setSourceText(await next.text());
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'อ่านไฟล์ไม่สำเร็จ');
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSelectSheet = (sheetName: string) => {
    if (!loadedWorkbook) return;
    setSelectedSheet(sheetName);
    setResult(null);
    setError(null);
    try {
      setSourceText(workbookSheetToCsv(loadedWorkbook.workbook, sheetName));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'อ่านไฟล์ไม่สำเร็จ');
    }
  };

  const handleSelectTemplate = (template: TransformTemplate) => {
    if (!template.available) return;
    setSelectedTemplate(template);
    setResult(null);
    setError(null);
  };

  const runTransform = () => {
    if (!sourceText || !selectedTemplate.available) return;
    try {
      const parsed = parseCsv(sourceText);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError('ไฟล์ว่างหรือไม่มีข้อมูลแถว');
        return;
      }
      const transformed = selectedTemplate.transform(parsed);
      setResult(transformed);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'แปลงไฟล์ไม่สำเร็จ');
    }
  };

  const handleDownload = () => {
    if (!result || !selectedTemplate) return;
    const csv = serializeCsv(selectedTemplate.headers, result.rows);
    const base = file?.name.replace(/\.(csv|xls|xlsx)$/i, '') ?? 'transform';
    downloadCsv(`${base}_${selectedTemplate.id}.csv`, csv);
  };

  const detectedEntries = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.detectedMapping);
  }, [result]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Script CSV Transform</h1>
        <p className="text-sm text-muted-foreground">
          แปลง CSV ต้นทาง → schema ปลายทางแบบ deterministic — ทุกอย่างรันในเบราว์เซอร์
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">1. เลือก Template ปลายทาง</CardTitle>
          <CardDescription>เลือก schema ที่ต้องการแปลงออก</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {TRANSFORM_TEMPLATES.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                selected={selectedTemplate.id === template.id}
                onSelect={() => handleSelectTemplate(template)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">2. อัปโหลดไฟล์ต้นทาง</CardTitle>
          <CardDescription>
            Template ที่เลือก:{' '}
            <span className="font-medium text-foreground">{selectedTemplate.label}</span>
            {' · '}
            {selectedTemplate.fieldCount} fields
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              'rounded-2xl border border-dashed bg-slate-50 p-6 transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-slate-300',
            )}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-xs">
                <UploadCloud className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">ลากไฟล์ .csv / .xls / .xlsx มาวาง</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  script รันได้ทุกขนาด ภายใน {formatFileSize(MAX_FILE_BYTES)}
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <FileSpreadsheet className="h-4 w-4" />
                เลือกไฟล์
              </Button>
            </div>
          </div>

          {file && (
            <div className="space-y-3">
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
                  aria-label="ลบไฟล์"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              </div>

              {loadedWorkbook && loadedWorkbook.sheetNames.length > 1 && (
                <div className="rounded-xl border bg-amber-50 px-4 py-3">
                  <div className="mb-2 text-xs font-medium text-amber-800">
                    พบ {loadedWorkbook.sheetNames.length} sheets — เลือก sheet ที่ต้องการแปลง
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {loadedWorkbook.sheetNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => handleSelectSheet(name)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          selectedSheet === name
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-muted-foreground">
              field mapping ตรวจจากชื่อ header อัตโนมัติ — เคสไม่มั่นใจจะ flag ใน warnings
            </div>
            <Button
              type="button"
              disabled={
                !sourceText ||
                (!!loadedWorkbook && loadedWorkbook.sheetNames.length > 1 && !selectedSheet)
              }
              onClick={runTransform}
            >
              <Play className="h-4 w-4" />
              แปลงด้วย script
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">3. ผลลัพธ์</CardTitle>
                  <CardDescription>
                    แปลง {result.rows.length} แถว จาก {result.sourceRowCount} แถว
                    {result.warnings.length > 0 && (
                      <span className="ml-2 text-amber-600">
                        · warning {result.warnings.length} จุด
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button type="button" onClick={handleDownload}>
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
                      className="flex items-center justify-between rounded-lg border bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span className="font-mono text-muted-foreground">{semantic}</span>
                      {header ? (
                        <Badge variant="secondary" className="gap-1 font-mono">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
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
                    <thead className="bg-slate-100 text-left">
                      <tr>
                        {selectedTemplate.headers.map((h) => (
                          <th key={h} className="whitespace-nowrap px-2 py-1.5 font-mono">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="border-t hover:bg-slate-50">
                          {selectedTemplate.headers.map((h) => (
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
            <Card className="border-amber-200">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <CardTitle className="text-base">Warnings ({result.warnings.length})</CardTitle>
                </div>
                <CardDescription>เคสที่ script ไม่มั่นใจ — ควรตรวจทานก่อนนำไปใช้</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto rounded-xl border bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100 text-left">
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
      )}
    </div>
  );
}
