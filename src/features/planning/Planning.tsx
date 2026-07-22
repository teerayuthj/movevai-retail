import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { OrderTimeline } from '@/components/OrderTimeline';
import { ReassignRouteDialog } from '@/components/delivery/ReassignRouteDialog';
import {
  ConfirmDispatchDialog,
  DriverSummaryRow,
} from '@/components/delivery/ConfirmDispatchDialog';
import { DriverWorkloadChips } from '@/components/delivery/DeliveryExecutionShared';
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
  List,
  MapPin,
  Route,
  Search,
  Users,
} from 'lucide-react';
import {
  planningCancelReasonLabel,
  type DispatchReadiness,
  type Order,
  type PlanningCancelReason,
} from '@/data/orderTypes';
import { ResolutionDialog } from '@/components/ResolutionDialog';
import {
  canPlanOrder,
  canReleasePlannedOrder,
  formatPlanningDate,
  getNextHourTime,
  getPlannedLoadCount,
  getTodayDateKey,
  getTomorrowDateKey,
  isUnreleasedPlannedOrder,
  isUnscheduledPlanningOrder,
} from '@/lib/deliveryPlanning';
import { useRetailStore } from '@/state/retailStore';
import { PlanningOrderCard } from './components/PlanningOrderCard';
import { DriverPlanningCard } from './components/DriverPlanningCard';
import { PlanSettingsCard } from './components/PlanSettingsCard';
import { DaySummaryCard } from './components/DaySummaryCard';
import { PlanningMap } from './components/PlanningMap';
import {
  getDefaultPlanningDate,
  getInitialPlanningSelectedDate,
  matchesPlanningQuery,
} from './utils/planningHelpers';
import {
  fetchPlanningRoutes,
  previewPlanningRoute,
  retryPlanningRoutePush,
  type PlanningRoute,
  type RoutePreview,
} from '@/lib/retailApi';
import { getAdminRouteOrigin } from '@/lib/adminLocation';
import { getDriverWorkloadSummary } from '@/lib/deliveryExecution';
import { buildInboxOrderEditSearch } from '@/lib/orderSourceLink';
import { cn } from '@/lib/utils';
import { PublishedRoutesCard } from './components/PublishedRoutesCard';
import { toast } from 'sonner';

function scheduledRoutesOnly(routes: PlanningRoute[]) {
  return routes.filter((route) => route.dispatchMode !== 'urgent');
}

function uniqueDriverIds(orders: Order[]) {
  return Array.from(
    new Set(
      orders
        .map((order) => order.deliveryPlan?.plannedDriverId)
        .filter((driverId): driverId is string => Boolean(driverId)),
    ),
  );
}

export function PlanningPage({
  locationSearch,
  onOpenInbox,
}: {
  locationSearch: string;
  onOpenInbox: (search?: string) => void;
}) {
  const {
    orders,
    drivers,
    planOrders,
    clearPlannedOrders,
    releasePlannedOrders,
    cancelRoute,
    reassignRoute,
  } = useRetailStore();
  // ถ้ามีงาน Planning ค้างวันเก่า ให้เปิดวันนั้นทันทีเพื่อให้รายการตรงกับสรุปงานค้าง
  const [selectedDate, setSelectedDate] = useState(() => getInitialPlanningSelectedDate(orders));
  const [query, setQuery] = useState('');
  const [paneView, setPaneView] = useState<'list' | 'map'>('list');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [planDate, setPlanDate] = useState(() => getDefaultPlanningDate(orders));
  const [planTime, setPlanTime] = useState(() => getNextHourTime());
  const [plannedDriverIds, setPlannedDriverIds] = useState<string[]>([]);
  const [readiness, setReadiness] = useState<DispatchReadiness>('ready');
  const [planNote, setPlanNote] = useState('');
  const [routes, setRoutes] = useState<PlanningRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routePreview, setRoutePreview] = useState<RoutePreview | null>(null);
  const [routePreviewLoading, setRoutePreviewLoading] = useState(false);
  const [routePreviewError, setRoutePreviewError] = useState('');
  const [routePreviewRetry, setRoutePreviewRetry] = useState(0);
  const [operationState, setOperationState] = useState<'idle' | 'saving' | 'publishing'>('idle');
  const [operationError, setOperationError] = useState('');
  const [cancelPlansOpen, setCancelPlansOpen] = useState(false);
  const [confirmPlanningWorkloadOpen, setConfirmPlanningWorkloadOpen] = useState(false);
  const [releaseConfirmScope, setReleaseConfirmScope] = useState<'selected' | 'all' | null>(null);
  const [routeAction, setRouteAction] = useState<{
    type: 'cancel' | 'reassign';
    route: PlanningRoute;
  } | null>(null);
  const [routeActionError, setRouteActionError] = useState('');

  const todayDate = getTodayDateKey();
  const focusedOrderId = new URLSearchParams(locationSearch).get('order');
  const planningEligibleOrders = orders.filter((order) => canPlanOrder(order));
  const plannedOrders = planningEligibleOrders.filter((order) => isUnreleasedPlannedOrder(order));
  const otherPlanDates = Array.from(
    plannedOrders.reduce((counts, order) => {
      const date = order.deliveryPlan?.plannedDate;
      if (date && date !== selectedDate) counts.set(date, (counts.get(date) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .map(([date, count]) => ({ date, count, overdue: date < todayDate }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const hiddenOverdueCount = otherPlanDates
    .filter((item) => item.overdue)
    .reduce((total, item) => total + item.count, 0);
  const plannedForSelectedDate = plannedOrders
    .filter((order) => order.deliveryPlan?.plannedDate === selectedDate)
    .sort((a, b) => {
      const timeCompare = (a.deliveryPlan?.plannedTime ?? '99:99').localeCompare(
        b.deliveryPlan?.plannedTime ?? '99:99',
      );
      return timeCompare || a.customer.name.localeCompare(b.customer.name, 'th');
    });
  const visibleOrders = plannedForSelectedDate.filter((order) =>
    matchesPlanningQuery(order, drivers, query),
  );
  // งานที่อนุมัติจาก Inbox แล้วแต่ยังไม่ถูกจัดรอบ (ไม่มีวันส่ง) — โผล่ในลิสต์ "รอจัดรอบ"
  // แยกจากวันที่เลือก เพราะยังไม่ผูกกับวันใด จนกว่าจะบันทึกแผน
  const unscheduledOrders = planningEligibleOrders
    .filter((order) => isUnscheduledPlanningOrder(order))
    .filter((order) => matchesPlanningQuery(order, drivers, query))
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  const selectedOrderSet = new Set(selectedOrderIds);
  // เลือกได้ทั้งงานที่จัดรอบไว้วันนี้ + งานที่รอจัดรอบ (order เดียวอยู่ได้ที่เดียวเท่านั้น)
  const selectablePool = [...visibleOrders, ...unscheduledOrders];
  const selectedOrders = selectablePool.filter((order) => selectedOrderSet.has(order.id));
  const selectedOrderSnapshot = selectedOrders
    .map(
      (order) =>
        `${order.id}:${order.deliveryPlan?.plannedDate ?? ''}:${order.deliveryPlan?.plannedTime ?? ''}:${order.deliveryPlan?.plannedDriverId ?? ''}:${order.dispatchReadiness ?? 'ready'}:${order.deliveryPlan?.note ?? ''}`,
    )
    .join('|');
  const selectedPlannedOrders = selectedOrders.filter((order) => isUnreleasedPlannedOrder(order));
  const releasableSelectedOrders = selectedOrders.filter((order) =>
    canReleasePlannedOrder(order, selectedDate),
  );
  const releasableForSelectedDate = plannedForSelectedDate.filter((order) =>
    canReleasePlannedOrder(order, selectedDate),
  );
  // ข้อมูลสำหรับ dialog ตรวจสอบก่อนปล่อยรอบส่ง — จัดกลุ่มตามคนขับแบบเดียวกับ publishGroups
  const releaseConfirmOrders =
    releaseConfirmScope === 'selected'
      ? releasableSelectedOrders
      : releaseConfirmScope === 'all'
        ? releasableForSelectedDate
        : [];
  const releaseConfirmGroups = Array.from(
    releaseConfirmOrders.reduce((groups, order) => {
      const driverId = order.deliveryPlan?.plannedDriverId ?? '';
      groups.set(driverId, [...(groups.get(driverId) ?? []), order]);
      return groups;
    }, new Map<string, Order[]>()),
  ).map(([driverId, groupOrders]) => ({
    driverId,
    driver: drivers.find((driver) => driver.id === driverId) ?? null,
    orders: groupOrders,
  }));
  const releaseMissingTimeCount = releaseConfirmOrders.filter(
    (order) => !order.deliveryPlan?.plannedTime,
  ).length;
  const releaseConfirmErrors = [
    ...(releaseConfirmScope && releaseConfirmOrders.length === 0
      ? ['ไม่มีงานที่พร้อมปล่อยรอบส่งแล้ว — ปิดหน้าต่างนี้เพื่อตรวจสอบรายการอีกครั้ง']
      : []),
    ...(releaseMissingTimeCount > 0
      ? [`มี ${releaseMissingTimeCount} งานยังไม่ระบุเวลาออก — กลับไประบุเวลาก่อนปล่อยรอบส่ง`]
      : []),
  ];
  const assignedPlannedOrders = plannedForSelectedDate.filter(
    (order) => order.deliveryPlan?.plannedDriverId,
  );
  const unassignedPlannedOrders = plannedForSelectedDate.filter(
    (order) => !order.deliveryPlan?.plannedDriverId,
  );
  const awaitingItemsOrders = plannedForSelectedDate.filter(
    (order) => (order.dispatchReadiness ?? 'ready') === 'awaiting_items',
  );
  const onHoldOrders = plannedForSelectedDate.filter(
    (order) => (order.dispatchReadiness ?? 'ready') === 'on_hold',
  );
  const singleSelectedOrder = selectedOrders.length === 1 ? selectedOrders[0] : null;
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;
  const mapOrders = selectedRoute ? selectedRoute.stops.map((stop) => stop.order) : selectedOrders;
  const mapSelectedIds = selectedRoute
    ? new Set(selectedRoute.stops.map((stop) => stop.order.id))
    : selectedOrderSet;
  const plannedDriverWorkloadWarnings = plannedDriverIds
    .map((driverId) => drivers.find((driver) => driver.id === driverId))
    .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver))
    .map((driver) => ({
      driver,
      workload: getDriverWorkloadSummary(driver, orders, { plannedDate: planDate }),
    }))
    .filter(
      ({ workload }) =>
        workload.waitingToStart > 0 ||
        workload.inTransit > 0 ||
        workload.pendingReview > 0 ||
        workload.returning > 0 ||
        workload.plannedForDate > 0,
    );

  useEffect(() => {
    if (!focusedOrderId) return;
    // โฟกัส order ที่ส่งมาจาก Inbox — รองรับทั้งงานที่จัดรอบไว้แล้ว และงานที่เพิ่งอนุมัติ (รอจัดรอบ)
    const focusedOrder = orders.find((order) => order.id === focusedOrderId && canPlanOrder(order));
    if (!focusedOrder) return;
    if (isUnreleasedPlannedOrder(focusedOrder) && focusedOrder.deliveryPlan) {
      setSelectedDate(focusedOrder.deliveryPlan.plannedDate);
    }
    setSelectedOrderIds([focusedOrder.id]);
  }, [focusedOrderId, orders]);

  useEffect(() => {
    let cancelled = false;
    const refreshRoutes = () => {
      void fetchPlanningRoutes(selectedDate)
        .then((nextRoutes) => {
          if (!cancelled) setRoutes(scheduledRoutesOnly(nextRoutes));
        })
        .catch((error) => {
          if (!cancelled) {
            setOperationError(error instanceof Error ? error.message : String(error));
          }
        });
    };
    refreshRoutes();
    const intervalId = window.setInterval(refreshRoutes, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedDate]);

  useEffect(() => {
    setPlanDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    // เก็บ draft คนขับ/ความพร้อม/หมายเหตุไว้เมื่อสลับแท็บวันที่
    // และ sync ฟอร์มใหม่เฉพาะเมื่อชุด order ที่เลือกหรือข้อมูล plan เปลี่ยนจริง
    if (selectedOrders.length === 0) return;

    const firstOrder = selectedOrders[0];
    const sharedDate = selectedOrders.every(
      (order) => order.deliveryPlan?.plannedDate === firstOrder.deliveryPlan?.plannedDate,
    )
      ? firstOrder.deliveryPlan?.plannedDate
      : undefined;
    const sharedTime = selectedOrders.every(
      (order) =>
        (order.deliveryPlan?.plannedTime ?? '') === (firstOrder.deliveryPlan?.plannedTime ?? ''),
    )
      ? (firstOrder.deliveryPlan?.plannedTime ?? '')
      : '';
    const sharedDriver = selectedOrders.every(
      (order) => order.deliveryPlan?.plannedDriverId === firstOrder.deliveryPlan?.plannedDriverId,
    )
      ? firstOrder.deliveryPlan?.plannedDriverId
      : undefined;
    const sharedReadiness = selectedOrders.every(
      (order) => (order.dispatchReadiness ?? 'ready') === (firstOrder.dispatchReadiness ?? 'ready'),
    )
      ? (firstOrder.dispatchReadiness ?? 'ready')
      : 'ready';
    const sharedNote = selectedOrders.every(
      (order) => (order.deliveryPlan?.note ?? '') === (firstOrder.deliveryPlan?.note ?? ''),
    )
      ? (firstOrder.deliveryPlan?.note ?? '')
      : '';

    setPlanDate(sharedDate ?? selectedDate);
    setPlanTime(sharedTime || getNextHourTime());
    setPlannedDriverIds(sharedDriver ? [sharedDriver] : uniqueDriverIds(selectedOrders));
    setReadiness(sharedReadiness);
    setPlanNote(sharedNote);
    // selectedOrderSnapshot intentionally captures the fields that drive this form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrderSnapshot]);

  // พรีวิวเส้นทางตามถนน (ต้นทาง GPS admin → จุดที่เลือก) ทันทีที่ดูบนแผนที่ ก่อน Publish
  // คำนวณใหม่เมื่อชุด order ที่เลือกเปลี่ยน; ข้ามเมื่อกำลังดู Route ที่ Publish แล้ว (มี geometry อยู่แล้ว)
  const previewOrderIdsKey = selectedRoute
    ? ''
    : selectedOrders
        .map((order) => order.id)
        .sort()
        .join(',');

  useEffect(() => {
    if (paneView !== 'map' || selectedRoute || !previewOrderIdsKey) {
      setRoutePreview(null);
      setRoutePreviewLoading(false);
      setRoutePreviewError('');
      return;
    }
    let cancelled = false;
    const orderIds = previewOrderIdsKey.split(',');
    setRoutePreviewLoading(true);
    setRoutePreviewError('');
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const origin = await getAdminRouteOrigin();
        try {
          const preview = await previewPlanningRoute({ orderIds, origin });
          if (!cancelled) setRoutePreview(preview);
        } catch (error) {
          if (!cancelled) {
            setRoutePreview(null);
            setRoutePreviewError(
              error instanceof Error ? error.message : 'คำนวณเส้นทางตามถนนไม่สำเร็จ',
            );
          }
        } finally {
          if (!cancelled) setRoutePreviewLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneView, previewOrderIdsKey, routePreviewRetry]);

  const selectOrder = (orderId: string) => {
    setSelectedRouteId(null);
    setSelectedOrderIds([orderId]);
  };

  const toggleOrderInGroup = (orderId: string) => {
    setSelectedRouteId(null);
    setSelectedOrderIds((current) =>
      current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
    );
  };

  const viewOrderOnMap = (orderId: string) => {
    setSelectedRouteId(null);
    setSelectedOrderIds([orderId]);
    setPaneView('map');
  };

  const viewRouteOnMap = (route: PlanningRoute) => {
    setSelectedRouteId(route.id);
    setSelectedOrderIds(route.stops.map((stop) => stop.order.id));
    setPaneView('map');
  };

  const openOrderCsvEdit = (order: Order) => {
    onOpenInbox(buildInboxOrderEditSearch(order));
  };

  const addAllVisible = () => {
    setSelectedRouteId(null);
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      visibleOrders.forEach((order) => next.add(order.id));
      return Array.from(next);
    });
  };

  const clearSelection = () => {
    setSelectedOrderIds([]);
    setSelectedRouteId(null);
    setPlanDate(selectedDate);
    setPlanTime(getNextHourTime());
    setPlannedDriverIds([]);
    setReadiness('ready');
    setPlanNote('');
  };

  const applyPlanning = async () => {
    if (selectedOrders.length === 0) return;
    if (!planTime) {
      toast.error('กรุณาระบุเวลาออกก่อนบันทึกแผน');
      return;
    }
    setOperationState('saving');
    setOperationError('');
    try {
      const baseInput = {
        plannedDate: planDate,
        plannedTime: planTime || undefined,
        dispatchReadiness: readiness,
        note: planNote.trim() || undefined,
      };
      if (plannedDriverIds.length <= 1) {
        await planOrders(
          selectedOrders.map((order) => order.id),
          {
            ...baseInput,
            plannedDriverId: plannedDriverIds[0],
          },
        );
      } else {
        const ordersByDriver = new Map<string, string[]>();
        selectedOrders.forEach((order, index) => {
          const driverId = plannedDriverIds[index % plannedDriverIds.length];
          ordersByDriver.set(driverId, [...(ordersByDriver.get(driverId) ?? []), order.id]);
        });
        for (const [driverId, orderIds] of ordersByDriver) {
          await planOrders(orderIds, {
            ...baseInput,
            plannedDriverId: driverId,
          });
        }
      }
      const plannedCount = selectedOrders.length;
      setSelectedDate(planDate);
      toast.success(`จัดรอบส่ง ${plannedCount} ออเดอร์เรียบร้อย`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOperationError(message);
      toast.error(`จัดรอบส่งไม่สำเร็จ — ${message}`);
    } finally {
      setOperationState('idle');
    }
  };

  const requestApplyPlanning = () => {
    if (plannedDriverWorkloadWarnings.length > 0) {
      setConfirmPlanningWorkloadOpen(true);
      return;
    }
    void applyPlanning();
  };

  const confirmCancelSelectedPlans = async (reason: PlanningCancelReason, note?: string) => {
    if (selectedPlannedOrders.length === 0) return;
    setOperationState('saving');
    setOperationError('');
    try {
      const cancelledCount = selectedPlannedOrders.length;
      await clearPlannedOrders(
        selectedPlannedOrders.map((order) => order.id),
        { reason, note },
      );
      setCancelPlansOpen(false);
      clearSelection();
      toast.success(`ยกเลิกแผน ${cancelledCount} ออเดอร์แล้ว — กลับเข้าคิว`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOperationError(message);
      toast.error(`ยกเลิกแผนไม่สำเร็จ — ${message}`);
    } finally {
      setOperationState('idle');
    }
  };

  const confirmRouteAction = async (
    value: string | { driverCode: string; coDriverCodes: string[]; note?: string },
    note?: string,
  ) => {
    if (!routeAction) return;
    setRouteActionError('');
    try {
      if (routeAction.type === 'cancel') {
        await cancelRoute(
          routeAction.route.id,
          { reason: value as PlanningCancelReason, note },
          {
            orderIds: routeAction.route.stops.map((stop) => stop.order.id),
            plannedDate: routeAction.route.plannedDate,
            plannedTime: routeAction.route.plannedTime,
            driverCode: routeAction.route.driver.code,
            note: routeAction.route.note,
          },
        );
      } else {
        if (typeof value === 'string') return;
        await reassignRoute(routeAction.route.id, value);
      }
      const stopCount = routeAction.route.stops.length;
      toast.success(
        routeAction.type === 'cancel'
          ? `ดึง Route ${routeAction.route.code} (${stopCount} จุด) กลับมาจัดการแล้ว — แจ้งคนขับเรียบร้อย`
          : `เปลี่ยนคนขับ Route ${routeAction.route.code} เรียบร้อย — แจ้งคนขับใหม่แล้ว`,
      );
      setRouteAction(null);
      setRoutes(scheduledRoutesOnly(await fetchPlanningRoutes(selectedDate)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRouteActionError(message);
      toast.error(`ดำเนินการ Route ${routeAction.route.code} ไม่สำเร็จ — ${message}`);
    }
  };

  const planningCancelReasons = (
    Object.keys(planningCancelReasonLabel) as PlanningCancelReason[]
  ).map((value) => ({ value, label: planningCancelReasonLabel[value] }));

  const publishGroups = async (targetOrders: Order[]) => {
    const withoutDepartureTime = targetOrders.find((order) => !order.deliveryPlan?.plannedTime);
    if (withoutDepartureTime) {
      throw new Error('กรุณาระบุเวลาออกให้ครบก่อน Publish รอบส่ง');
    }
    const groups = new Map<string, string[]>();
    targetOrders.forEach((order) => {
      const key = `${order.deliveryPlan?.plannedDate}:${order.deliveryPlan?.plannedDriverId}`;
      groups.set(key, [...(groups.get(key) ?? []), order.id]);
    });
    for (const orderIds of groups.values()) await releasePlannedOrders(orderIds);
    setRoutes(scheduledRoutesOnly(await fetchPlanningRoutes(selectedDate)));
  };

  const releaseSelected = async () => {
    if (releasableSelectedOrders.length === 0) return;
    setOperationState('publishing');
    setOperationError('');
    try {
      const count = releasableSelectedOrders.length;
      await publishGroups(releasableSelectedOrders);
      clearSelection();
      setReleaseConfirmScope(null);
      toast.success(`ปล่อยรอบส่ง ${count} ออเดอร์ให้คนขับแล้ว`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOperationError(message);
      toast.error(`ปล่อยรอบส่งไม่สำเร็จ — ${message}`);
    } finally {
      setOperationState('idle');
    }
  };

  const releaseAllForSelectedDate = async () => {
    if (releasableForSelectedDate.length === 0) return;
    setOperationState('publishing');
    setOperationError('');
    try {
      const count = releasableForSelectedDate.length;
      await publishGroups(releasableForSelectedDate);
      clearSelection();
      setReleaseConfirmScope(null);
      toast.success(`ปล่อยรอบส่งทั้งหมด ${count} ออเดอร์ให้คนขับแล้ว`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOperationError(message);
      toast.error(`ปล่อยรอบส่งไม่สำเร็จ — ${message}`);
    } finally {
      setOperationState('idle');
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Planning จัดส่งล่วงหน้า</h1>
          <p className="text-sm text-muted-foreground">
            จัดการเฉพาะงานที่ส่งมาวางแผนล่วงหน้า กำหนดวันส่ง คนขับ และความพร้อมสินค้า
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={selectedDate === todayDate ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(todayDate)}
          >
            วันนี้
          </Button>
          <Button
            variant={selectedDate === getTomorrowDateKey() ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedDate(getTomorrowDateKey())}
          >
            พรุ่งนี้
          </Button>
          <DatePicker value={selectedDate} onChange={setSelectedDate} className="w-[200px]" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px_380px]">
        <Card className="overflow-hidden xl:flex xl:h-[calc(100vh-12rem)] xl:flex-col">
          <CardHeader className="pb-3 xl:shrink-0">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-sm">รายการสำหรับวางแผน</CardTitle>
                  <CardDescription>
                    งานที่วางไว้วันที่ {formatPlanningDate(selectedDate)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{visibleOrders.length} รายการ</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addAllVisible}
                    disabled={visibleOrders.length === 0}
                  >
                    เพิ่มทั้งหมด
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearSelection}
                    disabled={selectedOrderIds.length === 0}
                  >
                    ล้างที่เลือก
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหา order, ลูกค้า, ที่อยู่, คนขับตามแผน..."
                  className="h-10 rounded-xl pl-9"
                />
              </div>
              <div className="flex rounded-xl border bg-muted/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setPaneView('list')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                    paneView === 'list'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={paneView === 'list'}
                >
                  <List className="h-3.5 w-3.5" />
                  รายการ
                  <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
                    {visibleOrders.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaneView('map')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                    paneView === 'map'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-pressed={paneView === 'map'}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  แผนที่
                  {selectedOrders.length > 0 && (
                    <span className="rounded-full bg-info/15 px-1.5 text-[10px] tabular-nums text-info">
                      {selectedOrders.length}
                    </span>
                  )}
                </button>
              </div>
              {otherPlanDates.length > 0 && (
                <div
                  className={cn(
                    'rounded-xl border px-3 py-2.5',
                    hiddenOverdueCount > 0
                      ? 'border-destructive/30 bg-destructive/5'
                      : 'border-info/25 bg-info/5',
                  )}
                >
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {hiddenOverdueCount > 0 ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CalendarClock className="h-4 w-4 text-info" />
                    )}
                    <span>
                      {hiddenOverdueCount > 0
                        ? `มีงานค้างรอรับ ${hiddenOverdueCount} งาน`
                        : 'มีงาน Planning ในวันอื่น'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {otherPlanDates.map((item) => (
                      <Button
                        key={item.date}
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(
                          'h-7 bg-background px-2 text-[11px]',
                          item.overdue && 'border-destructive/30 text-destructive',
                        )}
                        onClick={() => {
                          setSelectedDate(item.date);
                          setSelectedOrderIds([]);
                        }}
                      >
                        {formatPlanningDate(item.date)} · {item.count} งาน
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
            {paneView === 'map' ? (
              <section
                className="flex min-h-0 flex-1 flex-col"
                aria-labelledby="planning-map-title"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div
                      id="planning-map-title"
                      className="flex items-center gap-1.5 text-xs font-medium"
                    >
                      <MapPin className="h-3.5 w-3.5 text-info" />
                      {selectedRoute
                        ? 'เส้นทางตามถนนของ Route'
                        : routePreview?.geometry.length
                          ? 'เส้นทางตามถนน (พรีวิวก่อน Publish)'
                          : 'ตรวจสอบจุดส่งบนแผนที่'}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedRoute
                        ? `${selectedRoute.code} · ${selectedRoute.driver.name}`
                        : singleSelectedOrder
                          ? `${singleSelectedOrder.orderNo} · ${singleSelectedOrder.customer.address}`
                          : selectedOrders.length > 1
                            ? `แสดงเฉพาะ ${selectedOrders.length} งานที่เลือกอยู่`
                            : 'เลือก order จากแท็บรายการเพื่อดูปลายทาง'}
                    </p>
                  </div>
                  {selectedRoute ? (
                    <Badge variant="info" className="shrink-0">
                      {selectedRoute.stops.length} จุดส่ง
                    </Badge>
                  ) : selectedOrders.length > 0 ? (
                    <Badge variant="info" className="shrink-0">
                      แสดง {selectedOrders.length} จุด
                    </Badge>
                  ) : null}
                </div>
                <div className="min-h-[260px] flex-1">
                  <PlanningMap
                    orders={mapOrders}
                    selectedIds={mapSelectedIds}
                    onToggle={toggleOrderInGroup}
                    route={
                      selectedRoute?.plannedGeometryJson
                        ? {
                            code: selectedRoute.code,
                            driverName: selectedRoute.driver.name,
                            distanceMeters: selectedRoute.plannedDistanceMeters,
                            geometry: selectedRoute.plannedGeometryJson,
                          }
                        : selectedOrders.length > 0
                          ? {
                              preview: true,
                              loading: routePreviewLoading && !routePreview?.geometry.length,
                              distanceMeters: routePreview?.distanceMeters,
                              durationSeconds: routePreview?.durationSeconds,
                              error: routePreviewError,
                              geometry: routePreview?.geometry ?? [],
                            }
                          : null
                    }
                    onRetryRoute={() => setRoutePreviewRetry((value) => value + 1)}
                  />
                </div>
              </section>
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
                {unscheduledOrders.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-xl border border-info/30 bg-info/5 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-info">
                        <Inbox className="h-3.5 w-3.5" />
                        รอจัดรอบ · {unscheduledOrders.length} งาน
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        อนุมัติจาก Order Inbox แล้ว — เลือกเพื่อกำหนดวัน/เวลา/คนขับ
                      </span>
                    </div>
                    {unscheduledOrders.map((order) => (
                      <PlanningOrderCard
                        key={order.id}
                        order={order}
                        drivers={drivers}
                        selected={selectedOrderSet.has(order.id)}
                        onSelect={() => selectOrder(order.id)}
                        onToggleGroup={() => toggleOrderInGroup(order.id)}
                        onViewMap={() => viewOrderOnMap(order.id)}
                        onEditSource={() => openOrderCsvEdit(order)}
                      />
                    ))}
                    {visibleOrders.length > 0 && (
                      <div className="flex items-center gap-2 pt-1 text-[11px] font-medium text-muted-foreground">
                        <CalendarClock className="h-3.5 w-3.5" />
                        จัดรอบไว้แล้ว · {formatPlanningDate(selectedDate)}
                      </div>
                    )}
                  </div>
                )}
                {visibleOrders.map((order) => (
                  <PlanningOrderCard
                    key={order.id}
                    order={order}
                    drivers={drivers}
                    selected={selectedOrderSet.has(order.id)}
                    onSelect={() => selectOrder(order.id)}
                    onToggleGroup={() => toggleOrderInGroup(order.id)}
                    onViewMap={() => viewOrderOnMap(order.id)}
                    onEditSource={() => openOrderCsvEdit(order)}
                  />
                ))}
                {visibleOrders.length === 0 && unscheduledOrders.length === 0 && (
                  <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">
                    <CalendarClock className="mx-auto mb-2 h-8 w-8 text-muted-foreground/70" />
                    {plannedForSelectedDate.length > 0
                      ? 'ไม่พบงานที่ตรงกับคำค้นหา'
                      : otherPlanDates.length > 0
                        ? 'ไม่มีงานในวันที่เลือก — เลือกวันที่มีงานจากแถบด้านบน'
                        : `ยังไม่มีงานในแผนวันที่ ${formatPlanningDate(selectedDate)} — นำงานเข้ามาจาก Order Inbox`}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden xl:h-[calc(100vh-12rem)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">งานคนขับของวัน</CardTitle>
            <CardDescription>กดเลือกคนขับเพื่อใส่ลงฟอร์มแผนด้านขวา</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 overflow-auto xl:h-[calc(100%-4.75rem)]">
            {drivers.map((driver) => (
              <DriverPlanningCard
                key={driver.id}
                driver={driver}
                orders={orders}
                plannedLoad={getPlannedLoadCount(orders, driver.id, selectedDate)}
                selected={plannedDriverIds.includes(driver.id)}
                selectedDate={selectedDate}
                onSelect={() =>
                  setPlannedDriverIds((current) =>
                    current.includes(driver.id)
                      ? current.filter((id) => id !== driver.id)
                      : [...current, driver.id],
                  )
                }
              />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4 overflow-auto xl:h-[calc(100vh-12rem)]">
          <PlanSettingsCard
            drivers={drivers}
            orders={orders}
            selectedCount={selectedOrders.length}
            planDate={planDate}
            onPlanDate={setPlanDate}
            planTime={planTime}
            onPlanTime={setPlanTime}
            plannedDriverIds={plannedDriverIds}
            onPlannedDriverIds={setPlannedDriverIds}
            readiness={readiness}
            onReadiness={setReadiness}
            planNote={planNote}
            onPlanNote={setPlanNote}
            onApply={requestApplyPlanning}
            onCancelPlans={() => setCancelPlansOpen(true)}
            cancelDisabled={selectedPlannedOrders.length === 0}
          />

          <DaySummaryCard
            selectedDate={selectedDate}
            isToday={selectedDate === todayDate}
            plannedCount={plannedForSelectedDate.length}
            assignedCount={assignedPlannedOrders.length}
            unassignedCount={unassignedPlannedOrders.length}
            awaitingItemsCount={awaitingItemsOrders.length}
            onHoldCount={onHoldOrders.length}
            selectedCount={selectedOrders.length}
            releasableSelectedCount={releasableSelectedOrders.length}
            releasableAllCount={releasableForSelectedDate.length}
            onReleaseSelected={() => {
              setOperationError('');
              setReleaseConfirmScope('selected');
            }}
            releaseSelectedDisabled={
              operationState !== 'idle' || releasableSelectedOrders.length === 0
            }
            onReleaseAll={() => {
              setOperationError('');
              setReleaseConfirmScope('all');
            }}
            releaseAllDisabled={operationState !== 'idle' || releasableForSelectedDate.length === 0}
          />

          {operationError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {operationError}
            </div>
          )}

          <PublishedRoutesCard
            routes={routes}
            selectedRouteId={selectedRouteId}
            onViewRoute={viewRouteOnMap}
            onCancel={(route) => {
              setRouteActionError('');
              setRouteAction({ type: 'cancel', route });
            }}
            onReassign={(route) => {
              setRouteActionError('');
              setRouteAction({ type: 'reassign', route });
            }}
            onRetry={(routeId) => {
              void retryPlanningRoutePush(routeId)
                .then((updated) =>
                  setRoutes((current) =>
                    current.map((route) => (route.id === updated.id ? updated : route)),
                  ),
                )
                .catch((error) =>
                  setOperationError(error instanceof Error ? error.message : String(error)),
                );
            }}
          />

          {singleSelectedOrder ? (
            <OrderTimeline
              order={singleSelectedOrder}
              description="กิจกรรมล่าสุดของ order ที่เลือก"
              compact
              title="Timeline"
            />
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">สถานะการเลือก</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  เลือกอยู่ {selectedOrders.length} รายการ
                </div>
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4" />
                  ปล่อยเข้าคิวได้ตอนนี้{' '}
                  {
                    plannedForSelectedDate.filter((order) =>
                      canReleasePlannedOrder(order, selectedDate),
                    ).length
                  }{' '}
                  รายการ
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  รอสินค้า/พักไว้ {awaitingItemsOrders.length + onHoldOrders.length} รายการ
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ResolutionDialog
        open={cancelPlansOpen}
        title="ยกเลิกงานที่เลือก"
        description={`คืน ${selectedPlannedOrders.length} งานออกจากแผน (ยังไม่ Publish)`}
        reasons={planningCancelReasons}
        notePlaceholder="เช่น ลูกค้าแจ้งเลื่อน / รอผลิต lot ใหม่"
        confirmLabel="ยืนยันยกเลิก"
        confirmVariant="destructive"
        onCancel={() => setCancelPlansOpen(false)}
        onConfirm={({ reason, note }) => void confirmCancelSelectedPlans(reason, note)}
      />

      {routeAction?.type === 'cancel' && (
        <ResolutionDialog
          open
          title={`ดึง Route ${routeAction.route.code} กลับมาจัดการ`}
          description={`นำทั้ง Route ${routeAction.route.stops.length} จุดกลับมาจัดการ โดยเก็บวัน เวลา และ Messenger ตามแผนเดิมไว้ พร้อมแจ้งคนขับ`}
          error={routeActionError}
          reasons={planningCancelReasons}
          notePlaceholder="เช่น ลูกค้าเลื่อนนัด / สินค้าไม่พร้อม"
          confirmLabel="ยืนยันดึงกลับมาจัดการ"
          confirmVariant="destructive"
          onCancel={() => setRouteAction(null)}
          onConfirm={({ reason, note }) => void confirmRouteAction(reason, note)}
        />
      )}

      <ConfirmDispatchDialog
        open={releaseConfirmScope != null}
        title="ตรวจสอบก่อนปล่อยรอบส่ง"
        description={`ปล่อย ${releaseConfirmOrders.length} ออเดอร์ให้คนขับ ${releaseConfirmGroups.length} คน — งานจะแจ้งเตือนไปที่มือถือคนขับทันทีหลังยืนยัน`}
        confirmLabel={`ยืนยันปล่อยรอบส่ง ${releaseConfirmOrders.length} ออเดอร์`}
        submitting={operationState === 'publishing'}
        errors={releaseConfirmErrors}
        onCancel={() => setReleaseConfirmScope(null)}
        onConfirm={() =>
          void (releaseConfirmScope === 'selected'
            ? releaseSelected()
            : releaseAllForSelectedDate())
        }
      >
        {releaseConfirmGroups.map(({ driverId, driver, orders: groupOrders }) =>
          driver ? (
            <DriverSummaryRow
              key={driverId}
              driver={driver}
              orders={orders}
              plannedDate={selectedDate}
              detail={
                <div className="space-y-0.5">
                  <div>{groupOrders.length} ออเดอร์ในรอบนี้</div>
                  {groupOrders.slice(0, 3).map((order) => (
                    <div key={order.id} className="flex gap-1.5">
                      <span
                        className={cn(
                          'shrink-0 font-mono tabular-nums',
                          !order.deliveryPlan?.plannedTime && 'font-medium text-destructive',
                        )}
                      >
                        {order.deliveryPlan?.plannedTime ?? 'ไม่มีเวลา'}
                      </span>
                      <span className="truncate">
                        {order.customer.name} · {order.customer.address}
                      </span>
                    </div>
                  ))}
                  {groupOrders.length > 3 && <div>…อีก {groupOrders.length - 3} ออเดอร์</div>}
                </div>
              }
            />
          ) : (
            <div
              key={driverId}
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
            >
              ไม่พบข้อมูลคนขับของ {groupOrders.length} ออเดอร์ — ตรวจสอบแผนอีกครั้ง
            </div>
          ),
        )}
        {operationError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            ปล่อยรอบส่งไม่สำเร็จ — {operationError}
          </div>
        )}
      </ConfirmDispatchDialog>

      {confirmPlanningWorkloadOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl">
            <div className="border-b px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <AlertTriangle className="h-4 w-4 text-warning" />
                ยืนยันบันทึกแผน
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Messenger ที่เลือกมีงานค้างอยู่ ตรวจสอบลำดับส่งก่อนบันทึกแผนเพิ่ม
              </p>
            </div>
            <div className="space-y-2 px-5 py-4">
              {plannedDriverWorkloadWarnings.map(({ driver, workload }) => (
                <div key={driver.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="text-sm font-medium">{driver.name}</div>
                  <DriverWorkloadChips
                    workload={workload}
                    plannedLabel="แผนวันนั้น"
                    className="mt-2"
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                size="action"
                onClick={() => setConfirmPlanningWorkloadOpen(false)}
              >
                กลับไปตรวจสอบ
              </Button>
              <Button
                size="action"
                className="sm:min-w-48"
                disabled={operationState !== 'idle'}
                onClick={() => {
                  setConfirmPlanningWorkloadOpen(false);
                  void applyPlanning();
                }}
              >
                ยืนยันบันทึกแผน
              </Button>
            </div>
          </div>
        </div>
      )}

      {routeAction?.type === 'reassign' && (
        <ReassignRouteDialog
          open
          title={`เปลี่ยนคนขับ Route ${routeAction.route.code}`}
          description={`ย้ายงานที่ยังรอส่ง ${routeAction.route.stops.length} จุดไปคนขับใหม่`}
          error={routeActionError}
          drivers={drivers}
          orders={orders}
          initialDriverIds={[
            routeAction.route.driver.id,
            ...(routeAction.route.stops[0]?.order.coDriverIds ?? []),
          ]}
          onCancel={() => setRouteAction(null)}
          onConfirm={(input) => void confirmRouteAction(input)}
        />
      )}
    </div>
  );
}
