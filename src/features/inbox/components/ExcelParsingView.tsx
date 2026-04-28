import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Table2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Order } from '@/data/mock';
import { cn } from '@/lib/utils';

const COLUMN_MAPPINGS = [
  {
    original: 'ชื่อสินค้า',
    field: 'name',
    label: 'ชื่อสินค้า',
    issue: null,
  },
  {
    original: 'ความบริสุทธิ์ (%)',
    field: 'purity',
    label: 'ความบริสุทธิ์',
    issue: null,
  },
  {
    original: 'น้ำหนัก / หน่วย',
    field: 'weight',
    label: 'น้ำหนัก',
    issue: "รูปแบบไม่ standard — '1บ.' '5บ.' — ระบบแปลงเป็น '1 บาท' '5 บาท' แล้ว",
  },
  {
    original: 'จนวน',
    field: 'qty',
    label: 'จำนวน',
    issue: "ตัวสะกดผิด 'จนวน' → ระบบตีความว่า 'จำนวน' โปรดตรวจสอบ",
  },
  {
    original: 'ราคาต่อชิ้น (฿)',
    field: 'unitPrice',
    label: 'ราคา/ชิ้น',
    issue: null,
  },
  {
    original: 'ปลายทาง / ที่อยู่',
    field: 'address',
    label: 'ที่อยู่จัดส่ง',
    issue: 'column รวมชื่อร้าน + ที่อยู่ไว้ด้วยกัน ระบบแยก field ให้แล้ว โปรดตรวจ',
  },
  {
    original: 'เบอร์ติดต่อ',
    field: 'phone',
    label: 'เบอร์โทร',
    issue: null,
  },
  {
    original: 'หมายเหตุ',
    field: 'note',
    label: 'หมายเหตุ',
    issue: null,
  },
];

const EXCEL_ROWS = [
  {
    id: 1,
    raw: [
      'AUSIRIS ทองคำแท่ง 96.5%',
      '96.5%',
      '1บ.',
      '5',
      '45,200',
      'บจก.โกลด์ดิสทริบิวชั่น 02-118-4499\nอาคาร Silom Complex ชั้น 12',
      '-',
    ],
    warn: true,
  },
  {
    id: 2,
    raw: ['AUSIRIS ทองคำแท่ง 99.99%', '99.99%', '10g', '6', '32,500', 'same', '-'],
    warn: false,
  },
  {
    id: 3,
    raw: ['AUSIRIS เงินแท่ง 99.99%', '99.99%', '1KG', '3', '31,200', 'same', 'ห่อแยก'],
    warn: false,
  },
  {
    id: 4,
    raw: ['AUSIRIS ทองคำแท่ง 96.5%', '96.5%', '5บ.', '2', '225,800', 'same', '-'],
    warn: true,
  },
  {
    id: 5,
    raw: ['ทองรูปพรรณ 96.5% สร้อยคอ', '96.5%', '2สล.', '4', '23,100', 'same', 'กล่องของขวัญ'],
    warn: true,
  },
];

const PARSE_STEPS = [
  {
    label: 'กำลังอ่านไฟล์ Excel',
    detail: 'ausiris_orders_20260424.xlsx · 18 แถว · 8 columns',
  },
  {
    label: 'กำลัง Map Columns',
    detail: 'AI จับคู่ header ภาษาไทย → field ในระบบ',
  },
  {
    label: 'กำลังแปลงและ normalize ข้อมูล',
    detail: 'แปลงน้ำหนัก · จับคู่ SKU · ตรวจ format เบอร์โทร',
  },
  {
    label: 'เสร็จแล้ว — รอตรวจสอบ',
    detail: 'พบ 3 columns ที่ต้องตรวจ · 5 แถวแรกแสดงด้านล่าง',
  },
];

const WEIGHT_UNIT_RE = /บ\.|สล\./;
const EXCEL_WARN_COUNT = COLUMN_MAPPINGS.filter((column) => column.issue).length;

type ExcelParsingViewProps = {
  order: Order;
  onFinishParsing: (id: string) => void;
};

export default function ExcelParsingView({ order, onFinishParsing }: ExcelParsingViewProps) {
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStep(0);

    timerRef.current = setInterval(() => {
      setStep((currentStep) => Math.min(currentStep + 1, PARSE_STEPS.length - 1));
    }, 1400);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [order.id]);

  useEffect(() => {
    if (step >= PARSE_STEPS.length - 1 && timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [step]);

  const done = step === PARSE_STEPS.length - 1;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold">{order.code}</span>
            <Badge variant="muted" className="gap-1">
              <FileSpreadsheet className="h-3 w-3" /> LINE Excel
            </Badge>
            {!done && (
              <Badge variant="muted" className="gap-1 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" /> AI กำลังประมวลผล
              </Badge>
            )}
            {done && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {EXCEL_WARN_COUNT} columns ต้องตรวจ
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            ส่งเมื่อ {new Date(order.receivedAt).toLocaleTimeString('th')} · จาก{' '}
            {order.lineContact?.displayName} · รับเรื่องโดย {order.handledBy.name}
          </div>
        </div>

        {done && (
          <Button size="sm" onClick={() => onFinishParsing(order.id)}>
            <Check className="h-3.5 w-3.5" /> ยืนยันส่งเข้า Inbox
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <div className="text-sm font-medium">ausiris_orders_20260424.xlsx</div>
          <div className="text-[11px] text-muted-foreground">
            24 KB · 18 แถวข้อมูล · 8 columns · sheet &quot;รายการส่งพรุ่งนี้&quot;
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {PARSE_STEPS.map((parseStep, index) => {
          const isActive = index === step && !done;
          const isDone = index < step || done;

          return (
            <div
              key={parseStep.label}
              className={cn(
                'flex items-start gap-3 rounded-lg px-3 py-2 transition-colors',
                isActive && 'border border-primary/20 bg-primary/5',
                isDone && index !== PARSE_STEPS.length - 1 && 'opacity-50',
                index === PARSE_STEPS.length - 1 &&
                  done &&
                  'border border-emerald-200 bg-emerald-50',
              )}
            >
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {isDone && index < PARSE_STEPS.length - 1 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : index === PARSE_STEPS.length - 1 && done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                )}
              </div>

              <div>
                <div
                  className={cn(
                    'text-sm font-medium',
                    isActive && 'text-primary',
                    index === PARSE_STEPS.length - 1 && done && 'text-emerald-800',
                  )}
                >
                  {parseStep.label}
                </div>
                {(isActive || (done && index === PARSE_STEPS.length - 1)) && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{parseStep.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {step >= 1 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Column Mapping</span>
            <Badge variant="muted" className="text-[10px]">
              {COLUMN_MAPPINGS.length} columns
            </Badge>
            {EXCEL_WARN_COUNT > 0 && (
              <Badge variant="warning" className="gap-1 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5" /> {EXCEL_WARN_COUNT} ต้องตรวจ
              </Badge>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {COLUMN_MAPPINGS.map((column) => (
                  <div
                    key={column.field}
                    className={cn(
                      'flex items-start gap-3 px-4 py-2.5',
                      column.issue && 'bg-amber-50/50',
                    )}
                  >
                    <div className="w-44 shrink-0">
                      <div className="rounded border bg-muted/60 px-2 py-1 font-mono text-[11px]">
                        {column.original}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        header ใน Excel
                      </div>
                    </div>

                    <ChevronRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{column.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ({column.field})
                        </span>
                      </div>
                      {column.issue && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{column.issue}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {column.issue ? (
                        <Badge variant="warning" className="h-6 gap-1 px-2 text-[10px]">
                          <AlertTriangle className="h-3 w-3" />
                          ต้องตรวจ
                        </Badge>
                      ) : (
                        <Badge variant="muted" className="h-6 gap-1 px-2 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" />
                          จับคู่แล้ว
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step >= 2 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">ตัวอย่างแถวที่แปลงได้</span>
            <Badge variant="muted" className="text-[10px]">
              5 จาก 18 แถว
            </Badge>
          </div>

          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    ชื่อสินค้า
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    บริสุทธิ์
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">น้ำหนัก</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">จำนวน</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    ราคา/ชิ้น
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    หมายเหตุ
                  </th>
                </tr>
              </thead>
              <tbody>
                {EXCEL_ROWS.map((row) => (
                  <tr
                    key={row.id}
                    className={cn('border-b last:border-0', row.warn && 'bg-amber-50/60')}
                  >
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.id}</td>
                    <td className="px-3 py-2 font-medium">{row.raw[0]}</td>
                    <td className="px-3 py-2">
                      <Badge variant="muted" className="h-4 px-1 text-[9px]">
                        {row.raw[1]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          row.warn &&
                            row.raw[2].match(WEIGHT_UNIT_RE) &&
                            'font-medium text-amber-700',
                        )}
                      >
                        {row.raw[2]}
                      </span>
                      {row.raw[2].match(WEIGHT_UNIT_RE) && (
                        <span className="ml-1 text-muted-foreground">→ AI แปลง</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.raw[3]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.raw[4]}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.raw[6] !== '-' ? row.raw[6] : ''}
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30">
                  <td colSpan={7} className="px-3 py-1.5 text-center text-muted-foreground">
                    · · · อีก 13 แถว · · ·
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {done && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>
                AI จับคู่ SKU และแปลงหน่วยน้ำหนักครบแล้ว · กด <strong>ยืนยันส่งเข้า Inbox</strong>{' '}
                เพื่อให้พนักงานตรวจทีละแถว
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
