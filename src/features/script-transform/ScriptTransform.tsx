import { useRef, useState } from 'react';
import { FileSpreadsheet, Play, UploadCloud, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { parseCsv, serializeCsv, type TransformResult } from '@/lib/csvScriptTransform';
import { TRANSFORM_TEMPLATES, type TransformTemplate } from '@/lib/transformTemplates';
import { TemplateCard } from './components/TemplateCard';
import { TransformResultView } from './components/TransformResultView';
import {
  MAX_FILE_BYTES,
  type LoadedWorkbook,
  downloadCsv,
  formatFileSize,
  isCsvFile,
  isExcelFile,
  readWorkbook,
  workbookSheetToCsv,
} from './utils/workbook';

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
              'rounded-2xl border border-dashed bg-muted p-6 transition-colors',
              dragging ? 'border-primary bg-primary/5' : 'border-border',
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
                <FileSpreadsheet className="h-4 w-4 text-success" />
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
                <div className="rounded-xl border bg-warning/10 px-4 py-3">
                  <div className="mb-2 text-xs font-medium text-warning">
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
                            : 'border-border bg-white text-muted-foreground hover:border-border hover:bg-muted',
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
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
        <TransformResultView
          result={result}
          template={selectedTemplate}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
