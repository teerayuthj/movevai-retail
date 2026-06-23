/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  assignOrderState,
  autoAssignReadyOrdersState,
  completeDeliveryState,
  confirmDeliveryState,
  failDeliveryState,
  markReturnedState,
  markReturningState,
  retryDeliveryState,
  setDriverStatusState,
  startDeliveryState,
  submitDeliveryState,
} from '@/state/retail/delivery';
import { createInternalChatOrderState } from '@/state/retail/internalChat';
import { defaultState, loadState, persistState } from '@/state/retail/persistence';
import {
  cancelOrderState,
  confirmOrderState,
  finishParsingOrderState,
  setShippingMethodState,
  updateOrderCustomerState,
  updateOrderState,
} from '@/state/retail/orders';
import {
  completePostalDeliveryState,
  exportPostalBatchState,
  markPostalHandedOverState,
  setPostalTrackingState,
} from '@/state/retail/postal';
import { clearPlannedOrdersState, setDispatchReadinessState } from '@/state/retail/planning';
import type {
  ConfirmDeliveryInput,
  RetailState,
  RetailStore,
  SubmitDeliveryInput,
} from '@/state/retail/types';
import {
  cancelPlanningRoute,
  clearPlanning as clearPlanningApi,
  confirmAppDelivery,
  fetchAppDrivers,
  fetchAppOrders,
  fetchRiderOrders,
  publishPlanningRoute,
  publishUrgentPlanningRoute,
  reassignPlanningRoute,
  savePlanning,
  startRiderOrder,
  submitRiderOrder,
  syncAppOrder,
  syncAndAssignOrder,
} from '@/lib/retailApi';
import { getAdminRouteOrigin } from '@/lib/adminLocation';

const RIDER_JOB_STATUSES = ['assigned', 'in_transit', 'pending_confirmation', 'delivered'];
const LOCAL_DRAFT_STATUSES = ['new', 'parsing', 'needs_review', 'ready'];

function replaceOrder(orders: RetailState['orders'], canonical: RetailState['orders'][number]) {
  const exists = orders.some((order) => order.id === canonical.id || order.code === canonical.code);
  return exists
    ? orders.map((order) =>
        order.id === canonical.id || order.code === canonical.code ? canonical : order,
      )
    : [...orders, canonical];
}

function preservePendingReview(
  current: RetailState,
  remoteOrder: RetailState['orders'][number],
): RetailState['orders'][number] {
  const local = current.orders.find(
    (order) => order.id === remoteOrder.id || order.code === remoteOrder.code,
  );
  const confirmedByCs = remoteOrder.activityLog?.some(
    (event) => event.type === 'delivery_confirmed',
  );
  if (
    local?.status === 'pending_confirmation' &&
    remoteOrder.status === 'delivered' &&
    !confirmedByCs
  ) {
    return {
      ...remoteOrder,
      status: local.status,
      proofOfDelivery: local.proofOfDelivery,
      activityLog: local.activityLog,
    };
  }
  return remoteOrder;
}

const StoreContext = createContext<RetailStore | null>(null);

export function RetailProvider({
  children,
  mode = 'web',
}: {
  children: React.ReactNode;
  mode?: 'web' | 'rider';
}) {
  const [state, setState] = useState<RetailState>(() =>
    mode === 'rider' ? { orders: [], drivers: defaultState.drivers } : loadState(),
  );

  const commit = useCallback(
    (updater: (current: RetailState) => RetailState) => {
      setState((current) => {
        const next = updater(current);
        if (mode === 'web') persistState(next);
        return next;
      });
    },
    [mode],
  );

  const updateOrder = useCallback(
    (orderId: string, patch: Parameters<RetailStore['updateOrder']>[1]) => {
      commit((current) => updateOrderState(current, orderId, patch));
    },
    [commit],
  );

  const createInternalChatOrder = useCallback(
    (input: Parameters<RetailStore['createInternalChatOrder']>[0]) => {
      let createdId = '';

      commit((current) => {
        const result = createInternalChatOrderState(current, input);
        createdId = result.createdId;
        return result.nextState;
      });

      return createdId;
    },
    [commit],
  );

  const refreshRiderJobs = useCallback(
    async (driverCode: string) => {
      const remote = await fetchRiderOrders(driverCode);
      commit((current) => ({
        ...current,
        orders: [
          ...current.orders.filter(
            (order) =>
              order.assignedDriverId !== driverCode || !RIDER_JOB_STATUSES.includes(order.status),
          ),
          ...remote.orders.map((order) => preservePendingReview(current, order)),
        ],
        drivers: current.drivers.some((driver) => driver.id === driverCode)
          ? current.drivers.map((driver) => (driver.id === driverCode ? remote.driver : driver))
          : [...current.drivers, remote.driver],
      }));
    },
    [commit],
  );

  // Backend is authoritative for workflow orders. Keep only local intake drafts
  // that have not been synced yet; assigned/in-transit/closed records must come
  // from the backend so stale demo data cannot reappear after refresh.
  const syncFromBackend = useCallback(async () => {
    const [{ orders: remoteOrders }, remoteDrivers] = await Promise.all([
      fetchAppOrders({ take: 200 }),
      fetchAppDrivers(),
    ]);
    commit((current) => {
      const remoteIds = new Set(remoteOrders.map((order) => order.id));
      const remoteCodes = new Set(remoteOrders.map((order) => order.code));
      const localDrafts = current.orders.filter(
        (order) =>
          LOCAL_DRAFT_STATUSES.includes(order.status) &&
          !remoteIds.has(order.id) &&
          !remoteCodes.has(order.code),
      );
      return {
        ...current,
        orders: [
          ...localDrafts,
          ...remoteOrders.map((order) => preservePendingReview(current, order)),
        ],
        drivers: remoteDrivers,
      };
    });
  }, [commit]);

  // โหลดข้อมูลจาก backend ครั้งแรกเมื่อเปิด dashboard ฝั่ง web
  useEffect(() => {
    if (mode !== 'web') return;
    void syncFromBackend();
  }, [mode, syncFromBackend]);

  const updateOrderCustomer = useCallback(
    (orderId: string, customer: Parameters<RetailStore['updateOrderCustomer']>[1]) => {
      commit((current) => updateOrderCustomerState(current, orderId, customer));
    },
    [commit],
  );

  const confirmOrder = useCallback(
    (orderId: string, shippingMethod?: Parameters<RetailStore['confirmOrder']>[1]) => {
      commit((current) => confirmOrderState(current, orderId, shippingMethod));
    },
    [commit],
  );

  const setShippingMethod = useCallback(
    (orderId: string, method: Parameters<RetailStore['setShippingMethod']>[1]) => {
      commit((current) => setShippingMethodState(current, orderId, method));
    },
    [commit],
  );

  const finishParsingOrder = useCallback(
    (orderId: string) => {
      commit((current) => finishParsingOrderState(current, orderId));
    },
    [commit],
  );

  const assignOrder = useCallback(
    async (orderId: string, driverId: string) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) return;
      const canonical = await syncAndAssignOrder(order, driverId);
      commit((current) => {
        const assigned = assignOrderState(current, orderId, driverId);
        return { ...assigned, orders: replaceOrder(assigned.orders, canonical) };
      });
    },
    [commit, state.orders],
  );

  const autoAssignReadyOrders = useCallback(
    async (orderIds?: string[]) => {
      const next = autoAssignReadyOrdersState(state, orderIds);
      const changed = next.orders.filter((order) => {
        const before = state.orders.find((item) => item.id === order.id);
        return before?.assignedDriverId !== order.assignedDriverId && order.assignedDriverId;
      });
      const canonical = await Promise.all(
        changed.map((order) => syncAndAssignOrder(order, order.assignedDriverId!)),
      );
      commit(() => ({
        ...next,
        orders: canonical.reduce(replaceOrder, next.orders),
      }));
    },
    [commit, state],
  );

  const startDelivery = useCallback(
    async (orderId: string) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order?.assignedDriverId) return;
      const canonical = await startRiderOrder(orderId, order.assignedDriverId);
      commit((current) => {
        const started = startDeliveryState(current, orderId);
        return { ...started, orders: replaceOrder(started.orders, canonical) };
      });
    },
    [commit, state.orders],
  );

  const submitDelivery = useCallback(
    async (orderId: string, input: SubmitDeliveryInput) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order?.assignedDriverId) return;
      const canonical = await submitRiderOrder(orderId, order.assignedDriverId, input);
      commit((current) => {
        const submitted = submitDeliveryState(current, orderId, input);
        const submittedOrder = submitted.orders.find(
          (item) => item.id === canonical.id || item.code === canonical.code,
        );
        const reviewCanonical = submittedOrder
          ? {
              ...canonical,
              status: submittedOrder.status,
              proofOfDelivery: submittedOrder.proofOfDelivery,
              activityLog: submittedOrder.activityLog,
            }
          : canonical;
        return { ...submitted, orders: replaceOrder(submitted.orders, reviewCanonical) };
      });
    },
    [commit, state.orders],
  );

  const confirmDelivery = useCallback(
    async (orderId: string, input?: ConfirmDeliveryInput) => {
      const canonical = await confirmAppDelivery(orderId, input);
      commit((current) => {
        const confirmed = confirmDeliveryState(current, orderId, input);
        return { ...confirmed, orders: replaceOrder(confirmed.orders, canonical) };
      });
    },
    [commit],
  );

  const completeDelivery = useCallback(
    (orderId: string, success = true) => {
      commit((current) => completeDeliveryState(current, orderId, success));
    },
    [commit],
  );

  const exportPostalBatch = useCallback(
    (orderIds: string[], service: Parameters<RetailStore['exportPostalBatch']>[1]) => {
      let batchId = '';

      commit((current) => {
        const result = exportPostalBatchState(current, orderIds, service);
        batchId = result.batchId;
        return result.nextState;
      });

      return batchId;
    },
    [commit],
  );

  const setPostalTracking = useCallback(
    (orderId: string, trackingNumber: string) => {
      commit((current) => setPostalTrackingState(current, orderId, trackingNumber));
    },
    [commit],
  );

  const markPostalHandedOver = useCallback(
    (orderIds: string[]) => {
      commit((current) => markPostalHandedOverState(current, orderIds));
    },
    [commit],
  );

  const completePostalDelivery = useCallback(
    (orderId: string, success = true) => {
      commit((current) => completePostalDeliveryState(current, orderId, success));
    },
    [commit],
  );

  const setDriverStatus = useCallback(
    (driverId: string, status: Parameters<RetailStore['setDriverStatus']>[1]) => {
      commit((current) => setDriverStatusState(current, driverId, status));
    },
    [commit],
  );

  const cancelOrder = useCallback(
    (orderId: string, input: Parameters<RetailStore['cancelOrder']>[1]) => {
      commit((current) => cancelOrderState(current, orderId, input));
    },
    [commit],
  );

  const failDelivery = useCallback(
    (orderId: string, input: Parameters<RetailStore['failDelivery']>[1]) => {
      commit((current) => failDeliveryState(current, orderId, input));
    },
    [commit],
  );

  const markReturning = useCallback(
    (orderId: string, input: Parameters<RetailStore['markReturning']>[1]) => {
      commit((current) => markReturningState(current, orderId, input));
    },
    [commit],
  );

  const markReturned = useCallback(
    (orderId: string, input?: Parameters<RetailStore['markReturned']>[1]) => {
      commit((current) => markReturnedState(current, orderId, input));
    },
    [commit],
  );

  const retryDelivery = useCallback(
    (orderId: string) => {
      commit((current) => retryDeliveryState(current, orderId));
    },
    [commit],
  );

  const planOrders = useCallback(
    async (orderIds: string[], input: Parameters<RetailStore['planOrders']>[1]) => {
      const selected = state.orders.filter((order) => orderIds.includes(order.id));
      const synced = await Promise.all(selected.map(syncAppOrder));
      const canonical = await savePlanning({
        orderIds: synced.map((order) => order.id),
        plannedDate: input.plannedDate,
        plannedTime: input.plannedTime,
        driverCode: input.plannedDriverId,
        dispatchReadiness: input.dispatchReadiness,
        note: input.note,
      });
      commit((current) => ({
        ...current,
        orders: canonical.reduce(replaceOrder, current.orders),
      }));
    },
    [commit, state.orders],
  );

  const clearPlannedOrders = useCallback(
    async (orderIds: string[], input?: Parameters<RetailStore['clearPlannedOrders']>[1]) => {
      await clearPlanningApi(orderIds, input);
      commit((current) => clearPlannedOrdersState(current, orderIds));
    },
    [commit],
  );

  const cancelRoute = useCallback(
    async (
      routeId: string,
      input: Parameters<RetailStore['cancelRoute']>[1],
      restore?: Parameters<RetailStore['cancelRoute']>[2],
    ) => {
      const route = await cancelPlanningRoute(routeId, input);

      // backend ลบ stops ทิ้งตอน cancel (เพื่อปล่อย unique orderId) แล้ว restore order
      // กลับเป็น releaseState='planned' พร้อม plannedDate/Time เดิมให้เรียบร้อย ดังนั้น
      // response.stops จึง "ว่างเสมอ" — ไม่ใช่สัญญาณว่าดึงกลับไม่สำเร็จ จึงห้าม throw
      // ที่ backend ไม่ได้คงไว้คือ plannedDriverId (Rider) เลย savePlanning ซ้ำด้วย
      // ข้อมูล route เดิมจาก frontend (restore) เพื่อคง Rider ตามแผนเดิมไว้
      const plan =
        restore && restore.orderIds.length > 0
          ? restore
          : route.stops.length > 0
            ? {
                orderIds: route.stops.map((stop) => stop.order.id),
                plannedDate: route.plannedDate,
                plannedTime: route.plannedTime,
                driverCode: route.driver.code,
                note: route.note,
              }
            : null;
      if (plan) {
        const canonical = await savePlanning(plan);
        commit((current) => ({
          ...current,
          orders: canonical.reduce(replaceOrder, current.orders),
        }));
      }
      return route;
    },
    [commit],
  );

  const reassignRoute = useCallback(
    async (routeId: string, input: Parameters<RetailStore['reassignRoute']>[1]) => {
      const route = await reassignPlanningRoute(routeId, input);
      await syncFromBackend();
      return route;
    },
    [syncFromBackend],
  );

  const releasePlannedOrders = useCallback(
    async (orderIds: string[]) => {
      const selected = state.orders.filter((order) => orderIds.includes(order.id));
      const first = selected[0];
      const plannedDate = first?.deliveryPlan?.plannedDate;
      const plannedTime = first?.deliveryPlan?.plannedTime;
      const driverCode = first?.deliveryPlan?.plannedDriverId;
      if (!plannedDate || !driverCode) {
        throw new Error('กรุณาบันทึกวันส่งและ Rider ก่อน Publish');
      }
      if (
        selected.some(
          (order) =>
            order.deliveryPlan?.plannedDate !== plannedDate ||
            order.deliveryPlan?.plannedDriverId !== driverCode,
        )
      ) {
        throw new Error('orders ใน Route ต้องเป็นวันส่งและ Rider เดียวกัน');
      }
      const route = await publishPlanningRoute({
        orderIds,
        plannedDate,
        plannedTime,
        driverCode,
        note: first.deliveryPlan?.note,
        origin: await getAdminRouteOrigin(),
      });
      await syncFromBackend();
      return route;
    },
    [state.orders, syncFromBackend],
  );

  const publishUrgentRoute = useCallback(
    async (orderId: string, input: Parameters<RetailStore['publishUrgentRoute']>[1]) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order) throw new Error('ไม่พบออเดอร์ที่เลือก');
      await syncAppOrder(order);
      const route = await publishUrgentPlanningRoute({
        orderId,
        ...input,
        origin: input.origin ?? (await getAdminRouteOrigin()),
      });
      await syncFromBackend();
      return route;
    },
    [state.orders, syncFromBackend],
  );

  const setDispatchReadiness = useCallback(
    (
      orderId: string,
      readiness: Parameters<RetailStore['setDispatchReadiness']>[1],
      note?: Parameters<RetailStore['setDispatchReadiness']>[2],
    ) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (order?.deliveryPlan?.releaseState === 'planned') {
        return planOrders([orderId], {
          plannedDate: order.deliveryPlan.plannedDate,
          plannedTime: order.deliveryPlan.plannedTime,
          plannedDriverId: order.deliveryPlan.plannedDriverId,
          dispatchReadiness: readiness,
          note: note ?? order.deliveryPlan.note,
        });
      }
      commit((current) => setDispatchReadinessState(current, orderId, readiness, note));
      return Promise.resolve();
    },
    [commit, planOrders, state.orders],
  );

  const resetDemoData = useCallback(() => {
    commit(() => defaultState);
    void syncFromBackend();
  }, [commit, syncFromBackend]);

  const value = useMemo<RetailStore>(
    () => ({
      ...state,
      createInternalChatOrder,
      refreshRiderJobs,
      syncFromBackend,
      updateOrder,
      updateOrderCustomer,
      setShippingMethod,
      confirmOrder,
      finishParsingOrder,
      assignOrder,
      autoAssignReadyOrders,
      startDelivery,
      submitDelivery,
      confirmDelivery,
      completeDelivery,
      setDriverStatus,
      exportPostalBatch,
      setPostalTracking,
      markPostalHandedOver,
      completePostalDelivery,
      cancelOrder,
      failDelivery,
      markReturning,
      markReturned,
      retryDelivery,
      planOrders,
      clearPlannedOrders,
      releasePlannedOrders,
      publishUrgentRoute,
      cancelRoute,
      reassignRoute,
      setDispatchReadiness,
      resetDemoData,
    }),
    [
      state,
      createInternalChatOrder,
      refreshRiderJobs,
      syncFromBackend,
      updateOrder,
      updateOrderCustomer,
      setShippingMethod,
      confirmOrder,
      finishParsingOrder,
      assignOrder,
      autoAssignReadyOrders,
      startDelivery,
      submitDelivery,
      confirmDelivery,
      completeDelivery,
      setDriverStatus,
      exportPostalBatch,
      setPostalTracking,
      markPostalHandedOver,
      completePostalDelivery,
      cancelOrder,
      failDelivery,
      markReturning,
      markReturned,
      retryDelivery,
      planOrders,
      clearPlannedOrders,
      releasePlannedOrders,
      publishUrgentRoute,
      cancelRoute,
      reassignRoute,
      setDispatchReadiness,
      resetDemoData,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useRetailStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useRetailStore must be used within RetailProvider');
  }

  return store;
}
