import { useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  Truck,
  Users,
  Settings,
  Search,
  Bell,
  MessageCircle,
  Mailbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getPathForPage, type PageKey } from "@/lib/routes";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRetailStore } from "@/state/retailStore";

type Props = {
  page: PageKey;
  onChangePage: (p: PageKey) => void;
  children: React.ReactNode;
};

export function AppShell({ page, onChangePage, children }: Props) {
  const [q, setQ] = useState("");
  const { orders, resetDemoData } = useRetailStore();
  const inboxCount = orders.filter((o) =>
    ["new", "parsing", "needs_review", "ready"].includes(o.status)
  ).length;
  const chatCount = orders.filter((o) =>
    o.source === "internal_chat" && ["new", "needs_review"].includes(o.status)
  ).length;
  const queueCount = orders.filter(
    (o) =>
      o.status === "ready" &&
      (o.shippingMethod ?? "internal_driver") === "internal_driver"
  ).length;
  const postalCount = orders.filter(
    (o) => o.shippingMethod === "thai_post" && o.status === "ready"
  ).length;

  const nav: { key: PageKey; label: string; icon: any; badge?: string }[] = [
    { key: "overview", label: "ภาพรวม", icon: LayoutDashboard },
    { key: "chat", label: "Chat Intake", icon: MessageCircle, badge: String(chatCount) },
    { key: "inbox", label: "Order Inbox", icon: Inbox, badge: String(inboxCount) },
    { key: "queue", label: "คิวคนขับ", icon: Truck, badge: String(queueCount) },
    { key: "postal", label: "ไปรษณีย์ไทย", icon: Mailbox, badge: String(postalCount) },
    { key: "drivers", label: "คนขับ", icon: Users },
  ];

  const handleNavigate = (
    event: React.MouseEvent<HTMLAnchorElement>,
    nextPage: PageKey
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    onChangePage(nextPage);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed left-0 top-0 flex h-screen w-60 flex-col border-r bg-background">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            M
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">MoveVai</div>
            <div className="text-[11px] text-muted-foreground">Retail Logistics</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = page === item.key;
            return (
              <a
                key={item.key}
                href={getPathForPage(item.key)}
                onClick={(event) => handleNavigate(event, item.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <Badge variant={active ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                    {item.badge}
                  </Badge>
                )}
              </a>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <button
            onClick={resetDemoData}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            รีเซ็ตข้อมูลทดสอบ
          </button>
        </div>
      </aside>

      <div className="pl-60">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/95 backdrop-blur px-6">
          <div className="relative w-96 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา order, ลูกค้า, เบอร์โทร..."
              className="pl-9"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={getPathForPage("chat")}
              onClick={(event) => handleNavigate(event, "chat")}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
            </a>
            <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
            </button>
            <div className="ml-2 flex items-center gap-2">
              <Avatar>
                <AvatarFallback>JT</AvatarFallback>
              </Avatar>
              <div className="leading-tight">
                <div className="text-sm font-medium">James Teerayuth</div>
              </div>
            </div>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
