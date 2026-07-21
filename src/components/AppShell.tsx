import React, { useEffect, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPathForPage, type PageKey } from '@/lib/routes';
import { Badge } from '@/components/ui/badge';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useRetailStore } from '@/state/retailStore';
import {
  canPlanOrder,
  isUnreleasedPlannedOrder,
  isVisibleInExecutionQueue,
} from '@/lib/deliveryPlanning';
import { getDeliveryTrackingTab, getDriverQueueTab } from '@/lib/deliveryExecution';
import { NAV_SECTIONS } from '@/components/app-shell/navConfig';
import { CollapsedSidebarTooltip } from '@/components/app-shell/CollapsedSidebarTooltip';
import { SidebarUserMenu } from '@/components/app-shell/SidebarUserMenu';
import { Topbar } from '@/components/app-shell/Topbar';
import { fetchAppOrders } from '@/lib/retailApi';
import { matchesOrderReference, normalizeOrderNumberInput } from '@/lib/orderNumber';
import type { Order } from '@/data/orderTypes';
import { getTrackingAlert } from '@/features/delivery-tracking/utils/trackingAlerts';
import { useAdminAuth } from '@/auth/AuthContext';
import { canAccessPage } from '@/auth/permissions';

type Props = {
  page: PageKey;
  onChangePage: (p: PageKey, options?: { search?: string }) => void;
  children: React.ReactNode;
};

export function AppShell({ page, onChangePage, children }: Props) {
  const { user } = useAdminAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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
  const { orders } = useRetailStore();
  const [badgeNowMs, setBadgeNowMs] = useState(Date.now());

  // จำนวนงานค้างต่อเมนู (อ้างอิงด้วย PageKey ให้ตรงกับ navConfig)
  const badgeCounts: Partial<Record<PageKey, number>> = {
    inbox: orders.filter((o) => ['new', 'parsing', 'needs_review', 'ready'].includes(o.status))
      .length,
    queue: orders.filter(
      (o) =>
        getDriverQueueTab(o) &&
        (o.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
        isVisibleInExecutionQueue(o),
    ).length,
    delivery_tracking: orders.filter(
      (o) =>
        getDeliveryTrackingTab(o) &&
        (o.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
        !isUnreleasedPlannedOrder(o),
    ).length,
    planning: orders.filter((o) => canPlanOrder(o) && isUnreleasedPlannedOrder(o)).length,
    postal: orders.filter((o) => o.shippingMethod === 'thai_post' && o.status === 'ready').length,
    messenger: orders.filter((o) =>
      ['assigned', 'in_transit', 'pending_confirmation'].includes(o.status),
    ).length,
  };

  // จำนวนงานผิดปกติ (คนขับไม่รับ/ไม่เริ่มเกินเวลา, push ไม่ถึง) — โชว์เป็น badge สีแดงบนเมนูติดตาม
  const alertCounts: Partial<Record<PageKey, number>> = {
    delivery_tracking: orders.filter(
      (o) =>
        (o.shippingMethod ?? 'internal_driver') === 'internal_driver' &&
        getTrackingAlert(o, badgeNowMs) != null,
    ).length,
  };

  const SidebarToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  useEffect(() => {
    const timer = window.setInterval(() => setBadgeNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

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

    // messenger เป็น entry แยก (messenger.html) — ปล่อยให้ browser ทำ full page load
    // เพื่อให้ dev middleware / hosting rewrite เสิร์ฟ entry ที่ถูกต้อง (admin bundle ไม่มี messenger code)
    if (nextPage === 'messenger') {
      setIsMobileNavOpen(false);
      return;
    }

    event.preventDefault();
    setIsMobileNavOpen(false);
    onChangePage(nextPage);
  };

  const openOrderFromSearch = (order: Order) => {
    const orderSearch = `order=${encodeURIComponent(order.id)}`;
    if (['new', 'parsing', 'needs_review', 'ready'].includes(order.status)) {
      if (order.shippingMethod === 'thai_post' && order.status === 'ready') {
        onChangePage('postal', {
          search: `?q=${encodeURIComponent(order.orderNo ?? order.code)}&${orderSearch}`,
        });
        return;
      }
      if (isUnreleasedPlannedOrder(order)) {
        onChangePage('planning', { search: `?${orderSearch}` });
        return;
      }
      if (order.status !== 'ready') {
        onChangePage('inbox', { search: `?tab=orders&${orderSearch}` });
        return;
      }
    }

    const trackingTab = getDeliveryTrackingTab(order);
    if (trackingTab) {
      onChangePage('delivery_tracking', {
        search: `?tab=${encodeURIComponent(trackingTab)}&${orderSearch}`,
      });
      return;
    }

    onChangePage('queue', { search: `?${orderSearch}` });
  };

  const handleGlobalSearch = async (query: string) => {
    const normalizedQuery = normalizeOrderNumberInput(query);
    const localMatch = orders.find((order) => matchesOrderReference(order, normalizedQuery));
    if (localMatch) {
      openOrderFromSearch(localMatch);
      return;
    }

    try {
      const { orders: remoteOrders } = await fetchAppOrders({ q: normalizedQuery, take: 10 });
      const exact = remoteOrders.find((order) => matchesOrderReference(order, normalizedQuery));
      if (exact) {
        openOrderFromSearch(exact);
        return;
      }
    } catch {
      // fallback ด้านล่างยังช่วยค้นด้วยชื่อ/เบอร์จากหน้า Customers ได้
    }

    onChangePage('customers', { search: `?q=${encodeURIComponent(query)}` });
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
          <nav className={cn('flex-1 overflow-y-auto', collapsed ? 'p-1.5' : 'p-3')}>
            {NAV_SECTIONS.map((section) => ({
              ...section,
              items: section.items.filter((item) => user && canAccessPage(user, item.key)),
            }))
              .filter((section) => section.items.length > 0)
              .map((section, sectionIndex) => (
                <div
                  key={section.id}
                  className={cn(
                    sectionIndex > 0 && (collapsed ? 'mt-2 border-t pt-2' : 'mt-4'),
                    'space-y-1',
                  )}
                >
                  {!collapsed && section.label && (
                    <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                      {section.label}
                    </div>
                  )}
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = page === item.key;
                    const badgeCount = item.showBadge ? badgeCounts[item.key] : undefined;
                    const alertCount = item.showAlertBadge ? (alertCounts[item.key] ?? 0) : 0;
                    return (
                      <CollapsedSidebarTooltip
                        key={item.key}
                        label={item.label}
                        enabled={collapsed}
                      >
                        <a
                          href={getPathForPage(item.key)}
                          onClick={(event) => handleNavigate(event, item.key)}
                          aria-label={item.label}
                          className={cn(
                            'relative flex items-center rounded-lg text-[13px] leading-5 transition-colors',
                            collapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full gap-3 px-3 py-2',
                            active
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          )}
                        >
                          <Icon className="h-[18px] w-[18px]" strokeWidth={2.15} />
                          {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                          {!collapsed && alertCount > 0 && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                              {alertCount}
                            </Badge>
                          )}
                          {!collapsed && badgeCount !== undefined && (
                            <Badge
                              variant={active ? 'default' : 'secondary'}
                              className="h-5 px-1.5 text-[10px]"
                            >
                              {badgeCount}
                            </Badge>
                          )}
                        </a>
                      </CollapsedSidebarTooltip>
                    );
                  })}
                </div>
              ))}
          </nav>
          <div className={cn('border-t', collapsed ? 'p-1.5' : 'p-3')}>
            <SidebarUserMenu collapsed={collapsed} onChangePage={onChangePage} />
          </div>
        </aside>

        <div
          className={cn(
            'transition-[padding-left] duration-200 ease-out',
            collapsed ? 'lg:pl-16' : 'lg:pl-60',
          )}
        >
          <Topbar
            onOpenMobileNav={() => setIsMobileNavOpen(true)}
            onSearch={handleGlobalSearch}
            showSearch={page !== 'route_builder'}
          />
          <main className="p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
