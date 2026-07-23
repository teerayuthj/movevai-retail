import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ListChecks, RefreshCw, Route, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useRetailStore } from '@/state/retailStore';
import { useAdminAuth } from '@/auth/AuthContext';
import { groupReturnedAdHocRouteTrips } from '@/features/dispatch/returnedRouteTrips';
import { ReturnedDeliveryCenterOrders } from './components/ReturnedDeliveryCenterOrders';
import { groupReturnedDeliveryCenterOrders } from './returnedDeliveryCenterOrders';
import { canPlanOrder } from '@/lib/deliveryPlanning';
import { DeliveryManage } from './components/DeliveryManage';
import { DeliveryCalendar } from './components/DeliveryCalendar';

type WorkspaceView = 'manage' | 'returned' | 'calendar';
type ManageMode = 'immediate' | 'planning';

type Props = {
  locationSearch: string;
  onOpenInbox: (search?: string) => void;
  onOpenTracking: (search?: string) => void;
  onOpenRouteBuilder: (search?: string) => void;
};

function parseWorkspaceSearch(locationSearch: string) {
  const params = new URLSearchParams(locationSearch);
  const requestedView = params.get('view');
  const view: WorkspaceView =
    requestedView === 'calendar' || requestedView === 'returned' ? requestedView : 'manage';
  const mode =
    params.get('mode') === 'planning'
      ? 'planning'
      : params.get('mode') === 'immediate'
        ? 'immediate'
        : undefined;
  return { view, mode, orderId: params.get('order') ?? undefined } satisfies {
    view: WorkspaceView;
    mode?: ManageMode;
    orderId?: string;
  };
}

export function DeliveryWorkspacePage({
  locationSearch,
  onOpenInbox,
  onOpenTracking,
  onOpenRouteBuilder,
}: Props) {
  const parsed = useMemo(() => parseWorkspaceSearch(locationSearch), [locationSearch]);
  const { orders, drivers, cancelOrder, resolveReturnedOrder, syncFromBackend } = useRetailStore();
  const { user } = useAdminAuth();
  const isAdmin = user?.role.code === 'admin';
  const canImmediate = Boolean(isAdmin || user?.permissions.includes('queue.manage'));
  const canPlanning = Boolean(isAdmin || user?.permissions.includes('planning.manage'));
  const [view, setView] = useState<WorkspaceView>(parsed.view);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [focusRequest, setFocusRequest] = useState({
    orderId: parsed.orderId,
    mode: parsed.mode,
    key: 0,
  });
  const manageableCount = orders.filter(canPlanOrder).length;
  const returnedTrips = useMemo(() => groupReturnedAdHocRouteTrips(orders), [orders]);
  const returnedOrderGroups = useMemo(() => groupReturnedDeliveryCenterOrders(orders), [orders]);
  const returnedOrderCount = returnedOrderGroups.reduce(
    (total, group) => total + group.orders.length,
    0,
  );

  useEffect(() => {
    setView(parsed.view);
    if (parsed.orderId || parsed.mode) {
      setFocusRequest((current) => ({
        orderId: parsed.orderId,
        mode: parsed.mode,
        key: current.key + 1,
      }));
    }
  }, [parsed]);

  const changeView = (nextView: string) => {
    const normalized: WorkspaceView =
      nextView === 'calendar' || nextView === 'returned' ? nextView : 'manage';
    setView(normalized);
    const params = new URLSearchParams(window.location.search);
    params.set('view', normalized);
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  const openManage = (orderId?: string, mode?: ManageMode) => {
    setFocusRequest((current) => ({ orderId, mode, key: current.key + 1 }));
    setView('manage');
    const params = new URLSearchParams();
    params.set('view', 'manage');
    if (mode) params.set('mode', mode);
    if (orderId) params.set('order', orderId);
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  const handleChanged = () => setCalendarRefreshKey((value) => value + 1);

  return (
    <div className="mx-auto w-full max-w-[1520px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ศูนย์จัดส่ง</h1>
          <p className="text-sm text-muted-foreground">
            จัดการงานจาก LINE และดูภาพรวมรอบส่งโดยไม่ต้องสลับหน้า
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            void syncFromBackend();
            setCalendarRefreshKey((value) => value + 1);
          }}
        >
          <RefreshCw className="h-4 w-4" /> อัปเดต
        </Button>
      </div>

      <Tabs value={view} onValueChange={changeView} className="mt-4">
        <TabsList className="h-auto w-full justify-start gap-1 border-b bg-transparent p-0">
          <TabsTrigger value="manage" className="gap-2 rounded-b-none px-4 py-2.5">
            <ListChecks className="h-4 w-4" /> จัดการงาน
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {manageableCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="returned" className="gap-2 rounded-b-none px-4 py-2.5">
            <RotateCcw className="h-4 w-4" /> ดึงกลับ
            {returnedOrderCount > 0 && (
              <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                {returnedOrderCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2 rounded-b-none px-4 py-2.5">
            <CalendarDays className="h-4 w-4" /> ภาพรวมปฏิทิน
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manage">
          {returnedTrips.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-info/25 bg-info/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-info" />
                <div>
                  <div className="text-sm font-medium">
                    มี {returnedTrips.length} เที่ยวถูกดึงกลับจาก Route Builder
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    เก็บไว้ที่ต้นทางและไม่นับรวมในงานจาก LINE
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => onOpenRouteBuilder('?view=returned')}>
                <Route className="h-4 w-4" /> ไปจัดการที่ Route Builder
              </Button>
            </div>
          )}
          <DeliveryManage
            initialOrderId={parsed.orderId}
            initialMode={parsed.mode}
            focusRequest={focusRequest}
            canImmediate={canImmediate}
            canPlanning={canPlanning}
            onOpenInbox={onOpenInbox}
            onOpenTracking={onOpenTracking}
            onChanged={handleChanged}
          />
        </TabsContent>
        <TabsContent value="returned">
          <ReturnedDeliveryCenterOrders
            groups={returnedOrderGroups}
            canImmediate={canImmediate}
            canPlanning={canPlanning}
            onResolve={async (item, resolution) => {
              await resolveReturnedOrder(item.order.id, { resolution });
              handleChanged();
              if (resolution === 'replan') {
                toast.success(`เลือก ${item.order.orderNo} เพื่อจัดรอบใหม่แล้ว`);
                openManage(item.order.id, 'planning');
                return;
              }
              if (resolution === 'immediate') {
                toast.success(`เลือก ${item.order.orderNo} เพื่อส่งทันทีแล้ว`);
                openManage(item.order.id, 'immediate');
                return;
              }
              toast.success(`คืน ${item.order.orderNo} ไปรอตัดสินใจแล้ว`);
              openManage(item.order.id);
            }}
            onCancel={async (item, reason, note) => {
              await cancelOrder(item.order.id, { reason, note });
              handleChanged();
              toast.success(`ยกเลิก ${item.order.orderNo} แล้ว`);
            }}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <DeliveryCalendar
            drivers={drivers}
            refreshKey={calendarRefreshKey}
            calendarScope="delivery_workspace"
            onOpenManage={openManage}
            onOpenTracking={(orderId) =>
              onOpenTracking(orderId ? `?order=${encodeURIComponent(orderId)}` : undefined)
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
