import { useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileSpreadsheet,
  Image as ImageIcon,
  Inbox,
  MessageSquare,
  Paperclip,
  Send,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatTHB, statusLabel } from "@/data/mock";
import { cn } from "@/lib/utils";
import { useRetailStore } from "@/state/retailStore";

type IntakeFile = {
  name: string;
  size: number;
  type: string;
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ file }: { file: IntakeFile }) {
  if (file.type.includes("sheet") || file.name.match(/\.(xlsx|xls|csv)$/i)) {
    return <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />;
  }
  if (file.type.startsWith("image/") || file.name.match(/\.(png|jpe?g|webp)$/i)) {
    return <ImageIcon className="h-3.5 w-3.5 text-sky-600" />;
  }
  return <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function ChatIntakePage({ onOpenInbox }: { onOpenInbox: () => void }) {
  const { orders, createInternalChatOrder } = useRetailStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<IntakeFile[]>([]);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const canSubmit = message.trim().length > 0 || files.length > 0;
  const recentInternalOrders = orders
    .filter((order) => order.source === "internal_chat")
    .slice(0, 5);
  const createdOrder = orders.find((order) => order.id === createdOrderId);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles((current) => [
      ...current,
      ...Array.from(fileList).map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    ]);
  };

  const submit = () => {
    if (!canSubmit) return;
    const orderId = createInternalChatOrder({ message: message.trim(), files });
    setCreatedOrderId(orderId);
    setMessage("");
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chat Intake</h1>
          <p className="text-sm text-muted-foreground">
            ช่องทางรับข้อมูลภายในสำหรับพนักงาน ใช้เป็นทางเลือกแทนการส่งผ่าน LINE OA
          </p>
        </div>
        <Button variant="outline" onClick={onOpenInbox}>
          <Inbox className="h-4 w-4" />
          เปิด Order Inbox
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-background to-amber-50">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5 text-primary" />
                  ส่งข้อความหรือไฟล์เข้าระบบ
                </CardTitle>
                <CardDescription className="mt-1 text-xs">
                  ระบบจะสร้าง order draft และส่งต่อไปที่ Order Inbox เพื่อให้พนักงานตรวจข้อมูลก่อนยืนยัน
                </CardDescription>
              </div>
              <Badge variant="muted" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                Internal channel
              </Badge>
            </div>
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
                addFiles(event.dataTransfer.files);
              }}
              className={cn(
                "rounded-2xl border border-dashed bg-white/80 p-4 transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-sky-300"
              )}
            >
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={`ตัวอย่าง: ร้าน ABC สั่งทอง 96.5% 1 บาท x 2 ชิ้น รวม 90,400\nโทร 081-xxx-xxxx\nที่อยู่ ...\nแนบสลิปหรือ Excel ได้ในกล่องนี้`}
                className="min-h-56 w-full resize-none border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />

              {files.length > 0 && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs"
                    >
                      <FileIcon file={file} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{file.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFiles((current) => current.filter((_, i) => i !== index))
                        }
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`ลบไฟล์ ${file.name}`}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <div className="text-xs text-muted-foreground">
                  Drop สลิป, PDF, Excel หรือรูปภาพตรงนี้
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => addFiles(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => inputRef.current?.click()}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    แนบไฟล์
                  </Button>
                  <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
                    <Send className="h-3.5 w-3.5" />
                    สร้าง Order Draft
                  </Button>
                </div>
              </div>
            </div>

            {createdOrder && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  สร้าง {createdOrder.code} แล้ว ส่งไปที่ Order Inbox เพื่อให้ตรวจต่อ
                </div>
                <Button size="sm" variant="outline" onClick={onOpenInbox}>
                  เปิด Inbox
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">แนวทางใช้งาน</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              <div className="rounded-lg border bg-background p-3">
                <div className="font-medium text-foreground">เหมาะกับ</div>
                <div className="mt-1">
                  พนักงานรับข้อมูลจากโทรศัพท์, email, walk-in, supplier หรือไฟล์ภายใน แล้วต้องการส่งเข้าระบบกลาง
                </div>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <div className="font-medium text-foreground">ไม่แทนที่ Inbox</div>
                <div className="mt-1">
                  Chat เป็นช่องทางนำเข้า ส่วน Inbox เป็นจุดตรวจและยืนยัน order ก่อนเข้าคิวจัดส่ง
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                ตอนนี้เป็น prototype ฝั่ง frontend ยังไม่ได้ upload ไฟล์จริงหรือ OCR จริง
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">รายการจาก Chat ล่าสุด</CardTitle>
              <CardDescription className="text-xs">
                Draft ที่สร้างจากช่องทางภายใน
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recentInternalOrders.length > 0 ? (
                <div className="divide-y">
                  {recentInternalOrders.map((order) => (
                    <div key={order.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-xs font-semibold">{order.code}</div>
                        <Badge variant={order.status === "needs_review" ? "warning" : "muted"}>
                          {statusLabel[order.status]}
                        </Badge>
                      </div>
                      <div className="mt-1 truncate text-sm font-medium">
                        {order.customer.name}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{new Date(order.receivedAt).toLocaleTimeString("th", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="font-semibold text-amber-700">
                          {formatTHB(order.totalValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  ยังไม่มีรายการจาก Chat
                </div>
              )}
              <Separator />
              <div className="p-3">
                <Button variant="outline" size="sm" className="w-full" onClick={onOpenInbox}>
                  ดูทั้งหมดใน Order Inbox
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
