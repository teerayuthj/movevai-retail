import { useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Image as ImageIcon,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
  Check,
  AlertTriangle,
  Phone,
  MapPin,
  StickyNote,
  Pencil,
  Loader2,
  ShieldCheck,
  IdCard,
  Wallet,
  Coins,
  Scale,
  UserCircle2,
  Headset,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Table2,
  Truck,
  Mailbox,
  Bot,
  Ban,
} from "lucide-react";
import {
  CancelReason,
  Order,
  OrderItem,
  ShippingMethod,
  cancelReasonLabel,
  sourceLabel,
  statusLabel,
  paymentLabel,
  formatTHB,
} from "@/data/mock";
import { cn } from "@/lib/utils";
import { useRetailStore, CANCELLABLE } from "@/state/retailStore";
import { ResolutionDialog } from "@/components/ResolutionDialog";

const CANCEL_REASONS: { value: CancelReason; label: string }[] = (
  Object.keys(cancelReasonLabel) as CancelReason[]
).map((value) => ({ value, label: cancelReasonLabel[value] }));

const INBOX_STATUSES: Order["status"][] = ["new", "parsing", "needs_review", "ready"];
const SHIPPING_EDITABLE_STATUSES: Order["status"][] = ["new", "needs_review", "ready"];
const FILTER_LABEL: Record<"all" | "needs_review" | "new" | "ready", string> = {
  all: "ทั้งหมด",
  needs_review: "ต้องตรวจ",
  new: "ใหม่",
  ready: "พร้อม",
};
const STATUS_COLORS: Partial<Record<Order["status"], "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "muted">> = {
  new: "muted",
  parsing: "muted",
  needs_review: "warning",
  ready: "success",
  in_transit: "muted",
  delivered: "muted",
};

function SourceIcon({ source }: { source: Order["source"] }) {
  const map = {
    line_text: MessageSquare,
    line_image: ImageIcon,
    line_excel: FileSpreadsheet,
    internal_chat: Bot,
    manual: Pencil,
  };
  const Icon = map[source];
  return <Icon className="h-3.5 w-3.5" />;
}

function PurityBadge({ purity }: { purity: string }) {
  return (
    <Badge
      variant="muted"
      className="h-5 gap-1 px-1.5 text-[10px] font-semibold"
    >
      <Coins className="h-2.5 w-2.5" />
      {purity}
    </Badge>
  );
}

function OrderListItem({
  order,
  selected,
  onClick,
}: {
  order: Order;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/60"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-medium">{order.code}</span>
        <Badge variant={STATUS_COLORS[order.status] ?? "secondary"} className="h-5 px-1.5 text-[10px]">
          {statusLabel[order.status]}
        </Badge>
      </div>
      <div className="mt-1 truncate text-sm font-medium">{order.customer.name}</div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <SourceIcon source={order.source} />
        <span>{sourceLabel[order.source]}</span>
        <span>·</span>
        <span>{new Date(order.receivedAt).toLocaleTimeString("th", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {order.status !== "parsing" && (
        <>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">มูลค่ารวม</span>
            <span className="text-xs font-semibold tabular-nums text-amber-700">
              {formatTHB(order.totalValue)}
            </span>
          </div>
          {order.confidence < 80 && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              ต้องตรวจข้อมูล
            </div>
          )}
        </>
      )}
    </button>
  );
}

function ItemRow({ item, index }: { item: OrderItem; index: number }) {
  const lineTotal = item.qty * item.unitPrice;
  return (
    <div className="px-6 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xs font-semibold text-amber-900">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{item.name}</span>
            <PurityBadge purity={item.purity} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Scale className="h-3 w-3" />
              {item.weight}
            </span>
            <span className="font-mono">{item.sku}</span>
            <span>ราคา/ชิ้น {formatTHB(item.unitPrice)}</span>
          </div>
          {item.note && (
            <div className="mt-1 flex items-start gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{item.note}</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">× {item.qty}</div>
          <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {formatTHB(lineTotal)}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildRawText(order: Order): string {
  const lines: string[] = [];
  lines.push(`สวัสดีค่ะ ขอสั่งของตามนี้นะคะ`);
  lines.push(`ชื่อ: ${order.customer.name}`);
  lines.push(`โทร: ${order.customer.phone}`);
  lines.push(`ที่อยู่: ${order.customer.address}`);
  lines.push("");
  lines.push("รายการ:");
  order.items.forEach((it, i) => {
    lines.push(
      `${i + 1}. ${it.name} ${it.purity} ${it.weight} x ${it.qty} ชิ้น`
    );
  });
  lines.push("");
  lines.push(`รวม ${formatTHB(order.totalValue)}`);
  lines.push(`ชำระ: ${paymentLabel[order.payment]}`);
  if (order.note) {
    lines.push("");
    lines.push(`หมายเหตุ: ${order.note}`);
  }
  return lines.join("\n");
}

// ---- Mock data สำหรับ Excel parsing demo ----
const COLUMN_MAPPINGS = [
  { original: "ชื่อสินค้า",        field: "name",      label: "ชื่อสินค้า",         issue: null },
  { original: "ความบริสุทธิ์ (%)", field: "purity",    label: "ความบริสุทธิ์",       issue: null },
  { original: "น้ำหนัก / หน่วย",  field: "weight",    label: "น้ำหนัก",             issue: "รูปแบบไม่ standard — '1บ.' '5บ.' — ระบบแปลงเป็น '1 บาท' '5 บาท' แล้ว" },
  { original: "จนวน",              field: "qty",       label: "จำนวน",               issue: "ตัวสะกดผิด 'จนวน' → ระบบตีความว่า 'จำนวน' โปรดตรวจสอบ" },
  { original: "ราคาต่อชิ้น (฿)",   field: "unitPrice", label: "ราคา/ชิ้น",           issue: null },
  { original: "ปลายทาง / ที่อยู่", field: "address",   label: "ที่อยู่จัดส่ง",       issue: "column รวมชื่อร้าน + ที่อยู่ไว้ด้วยกัน ระบบแยก field ให้แล้ว โปรดตรวจ" },
  { original: "เบอร์ติดต่อ",       field: "phone",     label: "เบอร์โทร",             issue: null },
  { original: "หมายเหตุ",          field: "note",      label: "หมายเหตุ",             issue: null },
];

const EXCEL_ROWS = [
  { id: 1, raw: ["AUSIRIS ทองคำแท่ง 96.5%", "96.5%", "1บ.", "5",  "45,200", "บจก.โกลด์ดิสทริบิวชั่น 02-118-4499\nอาคาร Silom Complex ชั้น 12", "-"]         , warn: true },
  { id: 2, raw: ["AUSIRIS ทองคำแท่ง 99.99%", "99.99%","10g", "6",  "32,500", "same",                                                                             "-"]         , warn: false },
  { id: 3, raw: ["AUSIRIS เงินแท่ง 99.99%",  "99.99%","1KG", "3",  "31,200", "same",                                                                             "ห่อแยก"]   , warn: false },
  { id: 4, raw: ["AUSIRIS ทองคำแท่ง 96.5%",  "96.5%", "5บ.", "2",  "225,800","same",                                                                             "-"]         , warn: true  },
  { id: 5, raw: ["ทองรูปพรรณ 96.5% สร้อยคอ", "96.5%", "2สล.","4",  "23,100", "same",                                                                             "กล่องของขวัญ"], warn: true  },
];

const PARSE_STEPS = [
  { label: "กำลังอ่านไฟล์ Excel",          detail: "ausiris_orders_20260424.xlsx · 18 แถว · 8 columns" },
  { label: "กำลัง Map Columns",             detail: "AI จับคู่ header ภาษาไทย → field ในระบบ" },
  { label: "กำลังแปลงและ normalize ข้อมูล", detail: "แปลงน้ำหนัก · จับคู่ SKU · ตรวจ format เบอร์โทร" },
  { label: "เสร็จแล้ว — รอตรวจสอบ",        detail: "พบ 3 columns ที่ต้องตรวจ · 5 แถวแรกแสดงด้านล่าง" },
];
const WEIGHT_UNIT_RE = /บ\.|สล\./;
const EXCEL_WARN_COUNT = COLUMN_MAPPINGS.filter((c) => c.issue).length;

function ExcelParsingView({ order, onFinishParsing }: { order: Order; onFinishParsing: (id: string) => void }) {
  const [step, setStep] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setStep(0);
    timerRef.current = setInterval(() => {
      setStep((s) => Math.min(s + 1, PARSE_STEPS.length - 1));
    }, 1400);
    return () => clearInterval(timerRef.current!);
  }, [order.id]);

  useEffect(() => {
    if (step >= PARSE_STEPS.length - 1) clearInterval(timerRef.current!);
  }, [step]);

  const done = step === PARSE_STEPS.length - 1;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold">{order.code}</span>
            <Badge variant="muted" className="gap-1">
              <FileSpreadsheet className="h-3 w-3" /> LINE Excel
            </Badge>
            {!done && <Badge variant="muted" className="gap-1 animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" /> AI กำลังประมวลผล
            </Badge>}
            {done && <Badge variant="warning" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {EXCEL_WARN_COUNT} columns ต้องตรวจ
            </Badge>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            ส่งเมื่อ {new Date(order.receivedAt).toLocaleTimeString("th")} · จาก {order.lineContact?.displayName}
            {" · "}รับเรื่องโดย {order.handledBy.name}
          </div>
        </div>
        {done && (
          <Button size="sm" onClick={() => onFinishParsing(order.id)}>
            <Check className="h-3.5 w-3.5" /> ยืนยันส่งเข้า Inbox
          </Button>
        )}
      </div>

      {/* File info */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <div className="text-sm font-medium">ausiris_orders_20260424.xlsx</div>
          <div className="text-[11px] text-muted-foreground">
            24 KB · 18 แถวข้อมูล · 8 columns · sheet "รายการส่งพรุ่งนี้"
          </div>
        </div>
      </div>

      {/* Step progress */}
      <div className="space-y-2">
        {PARSE_STEPS.map((s, i) => {
          const isActive = i === step && !done;
          const isDone = i < step || done;
          return (
            <div key={i} className={cn("flex items-start gap-3 rounded-lg px-3 py-2 transition-colors",
              isActive && "bg-primary/5 border border-primary/20",
              isDone && i !== PARSE_STEPS.length - 1 && "opacity-50",
              i === PARSE_STEPS.length - 1 && done && "bg-emerald-50 border border-emerald-200",
            )}>
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {isDone && i < PARSE_STEPS.length - 1 ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : i === PARSE_STEPS.length - 1 && done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                )}
              </div>
              <div>
                <div className={cn("text-sm font-medium",
                  isActive && "text-primary",
                  i === PARSE_STEPS.length - 1 && done && "text-emerald-800"
                )}>
                  {s.label}
                </div>
                {(isActive || (done && i === PARSE_STEPS.length - 1)) && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{s.detail}</div>
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
            <Badge variant="muted" className="text-[10px]">{COLUMN_MAPPINGS.length} columns</Badge>
            {EXCEL_WARN_COUNT > 0 && (
              <Badge variant="warning" className="gap-1 text-[10px]">
                <AlertTriangle className="h-2.5 w-2.5" /> {EXCEL_WARN_COUNT} ต้องตรวจ
              </Badge>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {COLUMN_MAPPINGS.map((col, i) => (
                  <div key={i} className={cn("flex items-start gap-3 px-4 py-2.5",
                    col.issue && "bg-amber-50/50"
                  )}>
                    {/* Original header */}
                    <div className="w-44 shrink-0">
                      <div className="rounded border bg-muted/60 px-2 py-1 font-mono text-[11px]">
                        {col.original}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">header ใน Excel</div>
                    </div>

                    <ChevronRight className="mt-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                    {/* Mapped field */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{col.label}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">({col.field})</span>
                      </div>
                      {col.issue && (
                        <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{col.issue}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {col.issue ? (
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
            <Badge variant="muted" className="text-[10px]">5 จาก 18 แถว</Badge>
          </div>
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">ชื่อสินค้า</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">บริสุทธิ์</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">น้ำหนัก</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">จำนวน</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">ราคา/ชิ้น</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {EXCEL_ROWS.map((row) => (
                  <tr key={row.id} className={cn("border-b last:border-0",
                    row.warn && "bg-amber-50/60"
                  )}>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.id}</td>
                    <td className="px-3 py-2 font-medium">{row.raw[0]}</td>
                    <td className="px-3 py-2">
                      <Badge variant="muted"
                        className="h-4 px-1 text-[9px]">
                        {row.raw[1]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(row.warn && row.raw[2].match(WEIGHT_UNIT_RE) && "font-medium text-amber-700")}>
                        {row.raw[2]}
                      </span>
                      {row.raw[2].match(WEIGHT_UNIT_RE) && (
                        <span className="ml-1 text-muted-foreground">→ AI แปลง</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.raw[3]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.raw[4]}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.raw[6] !== "-" ? row.raw[6] : ""}</td>
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
                AI จับคู่ SKU และแปลงหน่วยน้ำหนักครบแล้ว · กด <strong>ยืนยันส่งเข้า Inbox</strong> เพื่อให้พนักงานตรวจทีละแถว
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShippingMethodSelector({
  value,
  onChange,
  disabled,
}: {
  value: ShippingMethod;
  onChange: (method: ShippingMethod) => void;
  disabled?: boolean;
}) {
  const options: {
    key: ShippingMethod;
    title: string;
    desc: string;
    Icon: typeof Truck;
  }[] = [
    {
      key: "internal_driver",
      title: "คนขับภายใน",
      desc: "เข้าคิวมอบหมาย driver + สร้าง Route",
      Icon: Truck,
    },
    {
      key: "thai_post",
      title: "ไปรษณีย์ไทย",
      desc: "เข้าคิวจัดแบทช์ + export CSV ให้ไปรษณีย์",
      Icon: Mailbox,
    },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Truck className="h-4 w-4 text-muted-foreground" /> วิธีจัดส่ง
        </CardTitle>
        <CardDescription className="text-xs">
          เลือกช่องทางจัดส่งก่อนยืนยันเข้าคิว
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2">
        {options.map((opt) => {
          const active = value === opt.key;
          const Icon = opt.Icon;
          return (
            <button
              key={opt.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.key)}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-muted/60",
                disabled && "opacity-60 cursor-not-allowed"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{opt.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {opt.desc}
                </div>
              </div>
              {active && (
                <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />
              )}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OrderDetail({
  order,
  onConfirm,
  onFinishParsing,
  onSaveCustomer,
  onChangeShippingMethod,
  onRequestCancel,
}: {
  order: Order;
  onConfirm: (orderId: string, shippingMethod: ShippingMethod) => void;
  onFinishParsing: (orderId: string) => void;
  onSaveCustomer: (orderId: string, customer: Order["customer"]) => void;
  onChangeShippingMethod: (orderId: string, method: ShippingMethod) => void;
  onRequestCancel: (orderId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftCustomer, setDraftCustomer] = useState(order.customer);

  useEffect(() => {
    setEditing(false);
    setDraftCustomer(order.customer);
  }, [order.id]); // reset only on order switch, not on external customer updates during editing

  if (order.status === "parsing") {
    return <ExcelParsingView order={order} onFinishParsing={onFinishParsing} />;
  }

  const lowConfidence = order.confidence < 80;
  const isHighValue = order.totalValue >= 500000;
  const shippingMethod: ShippingMethod =
    order.shippingMethod ?? "internal_driver";
  const shippingLocked = !SHIPPING_EDITABLE_STATUSES.includes(order.status);
  const confirmLabel =
    order.status === "ready"
      ? "อยู่ในคิวแล้ว"
      : shippingMethod === "thai_post"
      ? "ยืนยันเข้าคิวไปรษณีย์"
      : "ยืนยันเข้าคิว";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-base font-semibold">{order.code}</span>
            <Badge variant="muted">
              <SourceIcon source={order.source} />
              <span className="ml-1">{sourceLabel[order.source]}</span>
            </Badge>
            {lowConfidence && (
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                ต้องตรวจ
              </Badge>
            )}
            {isHighValue && (
              <Badge variant="warning" className="gap-1 border-red-300 bg-red-50 text-red-700">
                <ShieldCheck className="h-3 w-3" />
                High-value
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            เข้าระบบเมื่อ {new Date(order.receivedAt).toLocaleString("th")}
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftCustomer(order.customer);
                  setEditing(false);
                }}
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSaveCustomer(order.id, draftCustomer);
                  setEditing(false);
                }}
              >
                <Check className="h-3.5 w-3.5" /> บันทึก
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> แก้ไข
            </Button>
          )}
          {CANCELLABLE.includes(order.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRequestCancel(order.id)}
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              <Ban className="h-3.5 w-3.5" /> ยกเลิก
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onConfirm(order.id, shippingMethod)}
            disabled={order.status === "ready"}
          >
            <Check className="h-3.5 w-3.5" />
            {confirmLabel}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          {order.lineContact ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-9 w-9 bg-[#06c755]/10">
                  <AvatarFallback className="bg-[#06c755]/10 text-[#06c755]">
                    {order.lineContact.displayName.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#06c755] text-[8px] font-bold text-white">
                  L
                </span>
              </div>
              <div className="leading-tight">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  ส่งจาก LINE OA
                </div>
                <div className="text-sm font-medium">{order.lineContact.displayName}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {order.lineContact.lineUserId}
                  {order.lineContact.isOfficialContact && " · ✓ ผูกบัญชีลูกค้าแล้ว"}
                </div>
              </div>
            </div>
          ) : order.source === "internal_chat" ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9 bg-primary/10">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  ส่งจาก Chat ภายใน
                </div>
                <div className="text-sm font-medium">Internal order intake</div>
                <div className="text-[10px] text-muted-foreground">
                  พนักงาน drop ข้อความหรือไฟล์เข้าระบบโดยตรง
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9">
                <AvatarFallback>
                  <UserCircle2 className="h-5 w-5 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  ที่มา
                </div>
                <div className="text-sm font-medium">บันทึกหน้าเคาน์เตอร์</div>
                <div className="text-[10px] text-muted-foreground">ไม่ผ่าน LINE OA</div>
              </div>
            </div>
          )}

          <ArrowRight className="h-4 w-4 text-muted-foreground" />

          <div className="flex items-center gap-2">
            <Avatar className="h-9 w-9 bg-primary/10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {order.handledBy.name.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                <Headset className="mr-1 inline h-3 w-3" />
                รับเรื่อง / ส่งเข้าระบบโดย
              </div>
              <div className="text-sm font-medium">{order.handledBy.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {order.handledBy.department}
                {order.handledBy.role && ` · ${order.handledBy.role}`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 rounded-lg border bg-gradient-to-r from-amber-50 to-background p-4 md:grid-cols-4">
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">มูลค่ารวม</div>
          <div className="mt-0.5 text-xl font-semibold tabular-nums text-amber-800">
            {formatTHB(order.totalValue)}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">การชำระเงิน</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            {paymentLabel[order.payment]}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">ตรวจบัตรประชาชน</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium">
            <IdCard className="h-3.5 w-3.5 text-muted-foreground" />
            {order.requiresIdCheck ? "ต้องตรวจ" : "ไม่ต้องตรวจ"}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-muted-foreground">ประกันขนส่ง</div>
          <div className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium">
            <ShieldCheck
              className={cn(
                "h-3.5 w-3.5",
                order.insured ? "text-emerald-600" : "text-muted-foreground"
              )}
            />
            {order.insured ? "คุ้มครอง 100%" : "ยังไม่ทำประกัน"}
          </div>
        </div>
      </div>

      <ShippingMethodSelector
        value={shippingMethod}
        disabled={shippingLocked}
        onChange={(method) => onChangeShippingMethod(order.id, method)}
      />

      {lowConfidence && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
          <div className="text-xs">
            <div className="font-medium text-amber-900">ต้องตรวจข้อมูลบางรายการ</div>
            <div className="text-amber-700">
              โปรดตรวจจำนวนชิ้น น้ำหนัก และยอดรวมเทียบกับสลิปก่อนยืนยันเข้าคิว
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="parsed">
        <TabsList>
          <TabsTrigger value="parsed" className="gap-2 pr-4">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-sm">
              <Sparkles className="h-3 w-3" />
            </span>
            <span>ข้อมูลที่ AI แปลง</span>
          </TabsTrigger>
          <TabsTrigger value="raw">ต้นฉบับ</TabsTrigger>
        </TabsList>

        <TabsContent value="parsed" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">ข้อมูลผู้รับ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">ชื่อผู้รับ / ร้าน</label>
                <Input
                  value={draftCustomer.name}
                  disabled={!editing}
                  onChange={(e) =>
                    setDraftCustomer((current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> เบอร์โทร
                  </label>
                  <Input
                    value={draftCustomer.phone}
                    disabled={!editing}
                    onChange={(e) =>
                      setDraftCustomer((current) => ({
                        ...current,
                        phone: e.target.value,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <IdCard className="h-3 w-3" /> เลขบัตร / นิติบุคคล
                  </label>
                  <Input
                    value={draftCustomer.idCard ?? ""}
                    disabled={!editing}
                    onChange={(e) =>
                      setDraftCustomer((current) => ({
                        ...current,
                        idCard: e.target.value,
                      }))
                    }
                    placeholder="สำหรับตรวจสอบตอนรับของ"
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> ที่อยู่จัดส่ง
                </label>
                <Input
                  value={draftCustomer.address}
                  disabled={!editing}
                  onChange={(e) =>
                    setDraftCustomer((current) => ({
                      ...current,
                      address: e.target.value,
                    }))
                  }
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Coins className="h-4 w-4 text-amber-600" /> รายการทองคำ / เงิน
                </CardTitle>
                <Badge variant="muted">{order.items.length} รายการ</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {order.items.map((item, i) => (
                  <ItemRow key={i} item={item} index={i} />
                ))}
              </div>
              <Separator />
              <div className="flex items-center justify-between px-6 py-3">
                <span className="text-xs text-muted-foreground">
                  ราคาปิด (อ้างอิงสมาคมค้าทองคำ {new Date(order.receivedAt).toLocaleDateString("th")})
                </span>
                <span className="text-base font-semibold tabular-nums text-amber-800">
                  {formatTHB(order.totalValue)}
                </span>
              </div>
            </CardContent>
          </Card>

          {order.note && (
            <div className="flex gap-3 rounded-lg border bg-muted/30 p-3">
              <StickyNote className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">{order.note}</div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="raw">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {order.lineContact
                  ? "บทสนทนาใน LINE OA"
                  : order.source === "internal_chat"
                  ? "ข้อความ / ไฟล์จาก Chat ภายใน"
                  : "บันทึกข้อมูลหน้าเคาน์เตอร์"}
              </CardTitle>
              <CardDescription>
                {order.lineContact
                  ? `ลูกค้า ${order.lineContact.displayName} → Ausiris LINE OA`
                  : order.source === "internal_chat"
                  ? "พนักงานส่งข้อมูลเข้าระบบโดยตรง ไม่ต้องผ่าน LINE"
                  : `บันทึกโดย ${order.handledBy.name}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {order.source === "internal_chat" && (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <Avatar className="h-7 w-7 bg-primary/10">
                      <AvatarFallback className="bg-primary/10 text-xs text-primary">
                        <Bot className="h-3.5 w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="max-w-xl">
                      <div className="mb-0.5 text-[10px] text-muted-foreground">
                        Internal Chat
                      </div>
                      <div className="rounded-2xl rounded-bl-sm border bg-sky-50 p-3 font-mono text-xs whitespace-pre-line text-sky-950">
                        {order.rawText ?? "ไม่มีข้อความต้นฉบับ"}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(order.receivedAt).toLocaleTimeString("th", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    ระบบสร้างรายการเบื้องต้นจากข้อมูลที่ส่งมา · พนักงานต้องตรวจสินค้า จำนวน น้ำหนัก และยอดรวมก่อนยืนยัน
                  </div>
                </div>
              )}
              {order.source === "line_image" && order.rawPreview && order.lineContact && (
                <div className="space-y-3">
                  <div className="flex items-end gap-2">
                    <Avatar className="h-7 w-7 bg-[#06c755]/10">
                      <AvatarFallback className="bg-[#06c755]/10 text-xs text-[#06c755]">
                        {order.lineContact.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="max-w-sm">
                      <div className="mb-0.5 text-[10px] text-muted-foreground">
                        {order.lineContact.displayName}
                      </div>
                      <div className="overflow-hidden rounded-2xl rounded-bl-sm border bg-white">
                        <img src={order.rawPreview} alt="order slip" className="w-full object-cover" />
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(order.receivedAt).toLocaleTimeString("th", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                    AI ทำ OCR + จับคู่ SKU อัตโนมัติ ·{" "}
                    <span className="font-medium text-foreground">{order.handledBy.name}</span> เป็นผู้ยืนยันส่งเข้าระบบ
                  </div>
                </div>
              )}
              {order.source === "line_text" && order.lineContact && (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <Avatar className="h-7 w-7 bg-[#06c755]/10">
                      <AvatarFallback className="bg-[#06c755]/10 text-xs text-[#06c755]">
                        {order.lineContact.displayName.slice(0, 1)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="max-w-xl">
                      <div className="mb-0.5 text-[10px] text-muted-foreground">
                        {order.lineContact.displayName}
                      </div>
                      <div className="rounded-2xl rounded-bl-sm border bg-[#eaf4d8] p-3 font-mono text-xs whitespace-pre-line text-green-950">
                        {buildRawText(order)}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(order.receivedAt).toLocaleTimeString("th", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {order.source === "line_excel" && (
                <div className="space-y-3">
                  {order.lineContact && (
                    <div className="flex items-end gap-2">
                      <Avatar className="h-7 w-7 bg-[#06c755]/10">
                        <AvatarFallback className="bg-[#06c755]/10 text-xs text-[#06c755]">
                          {order.lineContact.displayName.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="mb-0.5 text-[10px] text-muted-foreground">
                          {order.lineContact.displayName}
                        </div>
                        <div className="rounded-2xl rounded-bl-sm border p-3">
                          <div className="flex items-center gap-2 text-sm">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                            <span className="font-medium">ausiris_orders_20260424.xlsx</span>
                            <Badge variant="muted">24 KB</Badge>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            ไฟล์รายการสั่งซื้อรายเดือน — sheet "รายการส่งพรุ่งนี้" · 18 แถว
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {order.source === "manual" && (
                <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
                  ออเดอร์นี้ไม่ได้มาจาก LINE OA · บันทึกจากหน้าเคาน์เตอร์ / ระบบ ERP โดย{" "}
                  <span className="font-medium text-foreground">{order.handledBy.name}</span> (
                  {order.handledBy.department})
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function InboxPage() {
  const {
    orders,
    confirmOrder,
    finishParsingOrder,
    updateOrderCustomer,
    setShippingMethod,
    cancelOrder,
  } = useRetailStore();
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const inboxOrders = useMemo(
    () => orders.filter((o) => INBOX_STATUSES.includes(o.status)),
    [orders]
  );
  const [selectedId, setSelectedId] = useState(inboxOrders[0]?.id ?? null);
  const [filter, setFilter] = useState<"all" | "needs_review" | "new" | "ready">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () =>
      inboxOrders.filter((o) => {
        const matchesFilter = filter === "all" ? true : o.status === filter;
        const q = query.trim().toLowerCase();
        const matchesQuery =
          !q ||
          [
            o.code,
            o.customer.name,
            o.customer.phone,
            o.customer.address,
            ...o.items.map((item) => `${item.sku} ${item.name}`),
          ]
            .join(" ")
            .toLowerCase()
            .includes(q);
        return matchesFilter && matchesQuery;
      }),
    [inboxOrders, filter, query]
  );

  const selected = orders.find((o) => o.id === selectedId);
  const inboxValue = useMemo(
    () => inboxOrders.reduce((s, o) => s + o.totalValue, 0),
    [inboxOrders]
  );

  useEffect(() => {
    if (!selectedId || !inboxOrders.some((order) => order.id === selectedId)) {
      setSelectedId(inboxOrders[0]?.id ?? null);
    }
  }, [inboxOrders, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Order Inbox — คำสั่งซื้อทองคำ/เงิน</h1>
          <p className="text-sm text-muted-foreground">
            รวมออเดอร์จากทุกช่องทาง intake · ระบบช่วยอ่านสลิป/ไฟล์ + จับคู่ SKU · ตรวจสอบก่อนยืนยันเข้าคิวจัดส่งของมีค่า
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="muted" className="gap-1">
            <Coins className="h-3 w-3 text-amber-600" />
            มูลค่าในคิว {formatTHB(inboxValue)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-[calc(100vh-12rem)] flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหา order / ลูกค้า / SKU..."
                className="h-8"
              />
            </div>
            <div className="mt-2 flex gap-1">
              {(["all", "needs_review", "new", "ready"] as const).map((f) => {
                const count = inboxOrders.filter((o) =>
                  f === "all" ? true : o.status === f
                ).length;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      filter === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {FILTER_LABEL[f]}
                    <span className="ml-1 opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </CardHeader>
          <Separator />
          <CardContent className="flex-1 overflow-auto p-3 space-y-2">
            {filtered.map((o) => (
              <OrderListItem
                key={o.id}
                order={o}
                selected={selectedId === o.id}
                onClick={() => setSelectedId(o.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                ไม่มี orders ในหมวดนี้
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-[calc(100vh-12rem)] overflow-auto p-6">
          {selected ? (
            <OrderDetail
              order={selected}
              onConfirm={confirmOrder}
              onFinishParsing={finishParsingOrder}
              onSaveCustomer={updateOrderCustomer}
              onChangeShippingMethod={setShippingMethod}
              onRequestCancel={(id) => setCancelTargetId(id)}
            />
          ) : (
            <div>ไม่ได้เลือก</div>
          )}
        </Card>
      </div>

      <ResolutionDialog
        open={!!cancelTargetId}
        title="ยกเลิกออเดอร์"
        description={
          cancelTargetId
            ? `${orders.find((o) => o.id === cancelTargetId)?.code ?? ""} — เลือกเหตุผลการยกเลิก`
            : undefined
        }
        reasons={CANCEL_REASONS}
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => setCancelTargetId(null)}
        onConfirm={({ reason, note }) => {
          if (cancelTargetId) {
            cancelOrder(cancelTargetId, { reason, note });
          }
          setCancelTargetId(null);
        }}
      />
    </div>
  );
}
