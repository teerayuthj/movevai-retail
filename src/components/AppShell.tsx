import React, { useEffect, useState } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
  CalendarClock,
  Route,
  History,
  FileSpreadsheet,
  Smartphone,
  Menu,
  ChevronsUpDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPathForPage, type PageKey } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRetailStore } from '@/state/retailStore';
import { canPlanOrder, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';
import { getDeliveryTrackingTab, getDriverQueueTab } from '@/lib/deliveryExecution';

type Props = {
  page: PageKey;
  onChangePage: (p: PageKey) => void;
  children: React.ReactNode;
};

type CollapsedSidebarTooltipProps = {
  label: string;
  enabled: boolean;
  children: React.ReactElement;
};

function CollapsedSidebarTooltip({ label, enabled, children }: CollapsedSidebarTooltipProps) {
  if (!enabled) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppShell({ page, onChangePage, children }: Props) {
  const [q, setQ] = useState('');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;

    try {
      return window.localStorage.getItem('movevai-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  // สถานะพับใช้เฉพาะบนเดสก์ท็อป — บนมือถือ drawer แสดงเต็มความกว้างเสมอ
  const collapsed = isDesktop && isSidebarCollapsed;
  const { orders, resetDemoData } = useRetailStore();
  const inboxCount = orders.filter((o) =>
    ['new', 'parsing', 'needs_review', 'ready'].includes(o.status),
  ).length;
  const chatCount = orders.filter(
    (o) => o.source === 'internal_chat' && ['new', 'needs_review'].includes(o.status),
  ).length;
  const queueCount = orders.filter(
    (o) =>
      getDriverQueueTab(o) &&
      (o.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
      !isUnreleasedPlannedOrder(o),
  ).length;
  const trackingCount = orders.filter(
    (o) =>
      getDeliveryTrackingTab(o) &&
      (o.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
      !isUnreleasedPlannedOrder(o),
  ).length;
  const planningCount = orders.filter((o) => canPlanOrder(o) && isUnreleasedPlannedOrder(o)).length;
  const riderJobCount = orders.filter((o) =>
    ['assigned', 'in_transit', 'pending_confirmation'].includes(o.status),
  ).length;
  const postalCount = orders.filter(
    (o) => o.shippingMethod === 'thai_post' && o.status === 'ready',
  ).length;

  const nav: { key: PageKey; label: string; icon: React.ElementType; badge?: string }[] = [
    { key: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
    { key: 'chat', label: 'Chat Intake', icon: MessageCircle, badge: String(chatCount) },
    { key: 'script_transform', label: 'Script Transform', icon: FileSpreadsheet },
    { key: 'inbox', label: 'Order Inbox', icon: Inbox, badge: String(inboxCount) },
    { key: 'queue', label: 'จ่ายงานวันนี้', icon: Truck, badge: String(queueCount) },
    {
      key: 'delivery_tracking',
      label: 'ติดตามการจัดส่ง',
      icon: Route,
      badge: String(trackingCount),
    },
    { key: 'tracking_history', label: 'ประวัติการติดตาม', icon: History },
    { key: 'planning', label: 'Planning', icon: CalendarClock, badge: String(planningCount) },
    { key: 'postal', label: 'ไปรษณีย์ไทย', icon: Mailbox, badge: String(postalCount) },
    { key: 'drivers', label: 'คนขับ', icon: Users },
    { key: 'rider', label: 'เปิดแอป Rider', icon: Smartphone, badge: String(riderJobCount) },
  ];
  const SidebarToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  useEffect(() => {
    try {
      window.localStorage.setItem('movevai-sidebar-collapsed', String(isSidebarCollapsed));
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      if (event.matches) setIsMobileNavOpen(false);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleNavigate = (event: React.MouseEvent<HTMLAnchorElement>, nextPage: PageKey) => {
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
    setIsMobileNavOpen(false);
    onChangePage(nextPage);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-muted/30">
        {/* backdrop สำหรับ drawer บนมือถือ */}
        {isMobileNavOpen && (
          <button
            type="button"
            aria-label="ปิดเมนู"
            onClick={() => setIsMobileNavOpen(false)}
            className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-xs lg:hidden"
          />
        )}
        <aside
          className={cn(
            'fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r bg-background transition-transform duration-200 ease-out',
            // มือถือ: ทำตัวเป็น drawer เลื่อนเข้า-ออก (ไม่สนใจสถานะพับ)
            isMobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
            // เดสก์ท็อป: ติดอยู่กับที่เสมอ + ใช้ความกว้างตามสถานะพับ
            'lg:translate-x-0 lg:shadow-none lg:transition-[width]',
            collapsed ? 'lg:w-16 lg:overflow-visible' : 'lg:w-60',
          )}
        >
          <div className={cn('border-b', collapsed ? 'px-1.5 py-2' : 'px-3 py-3')}>
            <div
              className={cn(
                'relative flex items-center',
                collapsed ? 'h-10 justify-center' : 'h-8 justify-between gap-2',
              )}
            >
              {!collapsed && (
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                    M
                  </div>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">MoveVai</div>
                    <div className="text-[11px] text-muted-foreground">Retail Logistics</div>
                  </div>
                </div>
              )}
              <CollapsedSidebarTooltip label="Open sidebar" enabled={collapsed}>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                  aria-label={collapsed ? 'Open sidebar' : 'พับ sidebar'}
                  className={cn(
                    'hidden items-center justify-center border border-border/70 text-foreground/80 transition-all hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-border/80 lg:inline-flex',
                    collapsed
                      ? 'absolute left-1/2 top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background/95 shadow-xs backdrop-blur-xs'
                      : 'h-8 w-8 rounded-lg bg-background hover:border-border',
                  )}
                >
                  <SidebarToggleIcon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </button>
              </CollapsedSidebarTooltip>
            </div>
          </div>
          <nav className={cn('flex-1 space-y-1', collapsed ? 'p-1.5' : 'p-3')}>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <CollapsedSidebarTooltip key={item.key} label={item.label} enabled={collapsed}>
                  <a
                    href={getPathForPage(item.key)}
                    onClick={(event) => handleNavigate(event, item.key)}
                    aria-label={item.label}
                    className={cn(
                      'relative flex items-center rounded-lg text-sm transition-colors',
                      collapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full gap-3 px-3 py-2',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.15} />
                    {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <Badge
                        variant={active ? 'default' : 'secondary'}
                        className="h-5 px-1.5 text-[10px]"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </a>
                </CollapsedSidebarTooltip>
              );
            })}
          </nav>
          <div className={cn('border-t', collapsed ? 'p-1.5' : 'p-3')}>
            <Popover open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
              <CollapsedSidebarTooltip
                label="James Teerayuth"
                enabled={collapsed && !isUserMenuOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="เมนูผู้ใช้"
                    className={cn(
                      'flex items-center rounded-lg transition-colors hover:bg-accent',
                      collapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full gap-2.5 px-2 py-1.5',
                    )}
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback>JT</AvatarFallback>
                    </Avatar>
                    {!collapsed && (
                      <>
                        <div className="min-w-0 flex-1 text-left leading-tight">
                          <div className="truncate text-sm font-medium">James Teerayuth</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            teerayuth.james@gmail.com
                          </div>
                        </div>
                        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </>
                    )}
                  </button>
                </PopoverTrigger>
              </CollapsedSidebarTooltip>
              <PopoverContent
                side={collapsed ? 'right' : 'top'}
                align={collapsed ? 'end' : 'start'}
                sideOffset={collapsed ? 12 : 8}
                className="w-56 p-1"
              >
                <div className="px-2 py-1.5">
                  <div className="truncate text-sm font-medium">James Teerayuth</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    teerayuth.james@gmail.com
                  </div>
                </div>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => {
                    resetDemoData();
                    setIsUserMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Settings className="h-4 w-4 shrink-0" strokeWidth={2.15} />
                  รีเซ็ตข้อมูลทดสอบ
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </aside>

        <div
          className={cn(
            'transition-[padding-left] duration-200 ease-out',
            collapsed ? 'lg:pl-16' : 'lg:pl-60',
          )}
        >
          <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:gap-4 sm:px-6">
            <button
              type="button"
              onClick={() => setIsMobileNavOpen(true)}
              aria-label="เปิดเมนู"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative w-full max-w-md sm:w-96">
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
                href={getPathForPage('chat')}
                onClick={(event) => handleNavigate(event, 'chat')}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success" />
              </a>
              <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
              </button>
            </div>
          </header>
          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
