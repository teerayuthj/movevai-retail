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
  FileSpreadsheet,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPathForPage, type PageKey } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;

    try {
      return window.localStorage.getItem('movevai-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
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
  const planningCount = orders.filter((o) => canPlanOrder(o)).length;
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
    { key: 'queue', label: 'คิวคนขับ', icon: Truck, badge: String(queueCount) },
    {
      key: 'delivery_tracking',
      label: 'ติดตามการจัดส่ง',
      icon: Route,
      badge: String(trackingCount),
    },
    { key: 'planning', label: 'Planning', icon: CalendarClock, badge: String(planningCount) },
    { key: 'postal', label: 'ไปรษณีย์ไทย', icon: Mailbox, badge: String(postalCount) },
    { key: 'drivers', label: 'คนขับ', icon: Users },
    { key: 'rider', label: 'เปิดแอป Rider', icon: Smartphone, badge: String(riderJobCount) },
  ];
  const SidebarToggleIcon = isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

  useEffect(() => {
    try {
      window.localStorage.setItem('movevai-sidebar-collapsed', String(isSidebarCollapsed));
    } catch {
      // Ignore localStorage failures in restricted environments.
    }
  }, [isSidebarCollapsed]);

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
    onChangePage(nextPage);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-muted/30">
        <aside
          className={cn(
            'fixed left-0 top-0 flex h-screen flex-col border-r bg-background transition-[width] duration-200 ease-out',
            isSidebarCollapsed ? 'w-16' : 'w-60',
          )}
        >
          <div className={cn('border-b', isSidebarCollapsed ? 'px-1.5 py-2' : 'px-3 py-3')}>
            <div
              className={cn(
                'relative flex items-center',
                isSidebarCollapsed ? 'h-10 justify-center' : 'h-8 justify-between gap-2',
              )}
            >
              {!isSidebarCollapsed && (
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
              <CollapsedSidebarTooltip label="Open sidebar" enabled={isSidebarCollapsed}>
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed((prev) => !prev)}
                  aria-label={isSidebarCollapsed ? 'Open sidebar' : 'พับ sidebar'}
                  className={cn(
                    'inline-flex items-center justify-center border border-border/70 text-foreground/80 transition-all hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border/80',
                    isSidebarCollapsed
                      ? 'absolute left-1/2 top-1/2 z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background/95 shadow-sm backdrop-blur-sm'
                      : 'h-8 w-8 rounded-lg bg-background hover:border-border',
                  )}
                >
                  <SidebarToggleIcon className="h-[18px] w-[18px]" strokeWidth={2.25} />
                </button>
              </CollapsedSidebarTooltip>
            </div>
          </div>
          <nav className={cn('flex-1 space-y-1', isSidebarCollapsed ? 'p-1.5' : 'p-3')}>
            {nav.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <CollapsedSidebarTooltip
                  key={item.key}
                  label={item.label}
                  enabled={isSidebarCollapsed}
                >
                  <a
                    href={getPathForPage(item.key)}
                    onClick={(event) => handleNavigate(event, item.key)}
                    aria-label={item.label}
                    className={cn(
                      'relative flex items-center rounded-lg text-sm transition-colors',
                      isSidebarCollapsed
                        ? 'mx-auto h-9 w-9 justify-center'
                        : 'w-full gap-3 px-3 py-2',
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.15} />
                    {!isSidebarCollapsed && <span className="flex-1 text-left">{item.label}</span>}
                    {!isSidebarCollapsed && item.badge && (
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
          <div className={cn('border-t', isSidebarCollapsed ? 'p-1.5' : 'p-3')}>
            <CollapsedSidebarTooltip label="รีเซ็ตข้อมูลทดสอบ" enabled={isSidebarCollapsed}>
              <button
                onClick={resetDemoData}
                aria-label="รีเซ็ตข้อมูลทดสอบ"
                className={cn(
                  'relative flex items-center rounded-lg text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                  isSidebarCollapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full gap-3 px-3 py-2',
                )}
              >
                <Settings className="h-[18px] w-[18px]" strokeWidth={2.15} />
                {!isSidebarCollapsed && 'รีเซ็ตข้อมูลทดสอบ'}
              </button>
            </CollapsedSidebarTooltip>
          </div>
        </aside>

        <div
          className={cn(
            'transition-[padding-left] duration-200 ease-out',
            isSidebarCollapsed ? 'pl-16' : 'pl-60',
          )}
        >
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
                href={getPathForPage('chat')}
                onClick={(event) => handleNavigate(event, 'chat')}
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
    </TooltipProvider>
  );
}
