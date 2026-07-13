/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  canReviseDeliveryProof,
  submitDeliveryState,
} from '@/state/retail/delivery';
import { createInternalChatOrderState } from '@/state/retail/internalChat';
import { createManualImportOrdersState } from '@/state/retail/manualImport';
import {
  sendCustomerNotificationState,
  sendCustomerNotificationsState,
} from '@/state/retail/notifications';
import { defaultState, loadState, persistState } from '@/state/retail/persistence';
import {
  cancelOrderState,
  confirmOrderState,
  setShippingMethodState,
  updateOrderCustomerState,
  updateOrderDetailsState,
  updateOrderState,
} from '@/state/retail/orders';
import {
  completePostalDeliveryState,
  exportPostalBatchState,
  markPostalHandedOverState,
  setPostalTrackingState,
} from '@/state/retail/postal';
import { clearPlannedOrdersState, setDispatchReadinessState } from '@/state/retail/planning';
import { rejectImportOrdersState, restoreImportOrdersState } from '@/state/retail/moderation';
import type {
  ConfirmDeliveryInput,
  RetailState,
  RetailStore,
  SubmitDeliveryInput,
} from '@/state/retail/types';
import {
  approveImportOrders as approveImportOrdersApi,
  acceptMessengerOrder,
  createAppOrder,
  cancelOrder as cancelOrderApi,
  cancelPlanningRoute,
  clearPlanning as clearPlanningApi,
  confirmAppDelivery,
  rejectImportOrders as rejectImportOrdersApi,
  restoreImportOrders as restoreImportOrdersApi,
  fetchAppDrivers,
  fetchAppOrders,
  fetchMessengerOrders,
  publishPlanningRoute,
  publishUrgentPlanningRoute,
  reassignPlanningRoute,
  savePlanning,
  submitAppDeliveryProof,
  startMessengerOrder,
  submitMessengerOrder,
  syncAppOrder,
  syncAndAssignOrder,
  unassignAppOrder,
} from '@/lib/retailApi';
import { getAdminRouteOrigin } from '@/lib/adminLocation';
import { MESSENGER_JOB_STATUSES, isMessengerOrderParticipant } from '@/lib/messengerJobs';

const LOCAL_DRAFT_STATUSES = ['new', 'parsing', 'needs_review', 'ready'];

function replaceOrder(orders: RetailState['orders'], canonical: RetailState['orders'][number]) {
  const exists = orders.some(
    (order) =>
      order.id === canonical.id ||
      order.orderNo === canonical.orderNo ||
      order.code === canonical.code,
  );
  return exists
    ? orders.map((order) =>
        order.id === canonical.id ||
        order.orderNo === canonical.orderNo ||
        order.code === canonical.code
          ? canonical
          : order,
      )
    : [...orders, canonical];
}

function preservePendingReview(
  current: RetailState,
  remoteOrder: RetailState['orders'][number],
): RetailState['orders'][number] {
  const local = current.orders.find(
    (order) =>
      order.id === remoteOrder.id ||
      order.orderNo === remoteOrder.orderNo ||
      order.code === remoteOrder.code,
  );
  const confirmedByCs = remoteOrder.activityLog?.some(
    (event) => event.type === 'delivery_confirmed',
  );
  const localSubmittedAt = [...(local?.activityLog ?? [])]
    .reverse()
    .find(
      (event) => event.type === 'delivery_submitted' || event.type === 'delivery_proof_revised',
    )?.at;
  const remoteRestartedAt = [...(remoteOrder.activityLog ?? [])]
    .reverse()
    .find((event) => event.type === 'delivery_retried' || event.type === 'delivery_started')?.at;

  // A poll/focus refresh can start while the order is still in_transit, then finish
  // after submitDelivery has already moved it to pending_confirmation. Do not let that
  // older snapshot make the Messenger UI jump back to "in transit". A genuine retry is
  // still accepted because the backend timeline will contain a newer retry/start event.
  if (
    local?.status === 'pending_confirmation' &&
    (remoteOrder.status === 'assigned' || remoteOrder.status === 'in_transit') &&
    localSubmittedAt &&
    (!remoteRestartedAt || Date.parse(remoteRestartedAt) <= Date.parse(localSubmittedAt))
  ) {
    return {
      ...remoteOrder,
      status: local.status,
      inTransitAt: local.inTransitAt,
      proofOfDelivery: local.proofOfDelivery,
      proofHistory: local.proofHistory,
      activityLog: local.activityLog,
    };
  }
  if (
    local?.status === 'pending_confirmation' &&
    remoteOrder.status === 'delivered' &&
    !confirmedByCs
  ) {
    return {
      ...remoteOrder,
      status: local.status,
      proofOfDelivery: local.proofOfDelivery,
      proofHistory: local.proofHistory,
      activityLog: local.activityLog,
    };
  }
  if (
    local?.status === 'pending_confirmation' &&
    remoteOrder.status === 'pending_confirmation' &&
    local.proofHistory?.length &&
    !remoteOrder.proofHistory?.length
  ) {
    return {
      ...remoteOrder,
      proofOfDelivery: local.proofOfDelivery ?? remoteOrder.proofOfDelivery,
      proofHistory: local.proofHistory,
      activityLog: local.activityLog ?? remoteOrder.activityLog,
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
  mode?: 'web' | 'messenger';
}) {
  const [state, setState] = useState<RetailState>(() =>
    mode === 'messenger'
      ? { orders: [], drivers: defaultState.drivers, notifications: [] }
      : loadState(),
  );
  const messengerRefreshRequestRef = useRef(0);
  const messengerWorkflowRevisionRef = useRef(0);

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
    async (input: Parameters<RetailStore['createInternalChatOrder']>[0]) => {
      const result = createInternalChatOrderState(state, input);
      const draft = result.nextState.orders.find((order) => order.id === result.createdId)!;
      const canonical = await createAppOrder(draft);
      commit((current) => ({
        ...current,
        orders: [canonical, ...current.orders.filter((order) => order.id !== draft.id)],
      }));
      return canonical.id;
    },
    [commit, state],
  );

  const createManualImportOrders = useCallback(
    async (inputs: Parameters<RetailStore['createManualImportOrders']>[0]) => {
      const result = createManualImportOrdersState(state, inputs);
      const createdIdSet = new Set(result.createdIds);
      const drafts = result.nextState.orders.filter((order) => createdIdSet.has(order.id));
      const canonicalOrders = await Promise.all(drafts.map(createAppOrder));
      commit((current) => ({
        ...current,
        orders: [
          ...canonicalOrders,
          ...current.orders.filter((order) => !createdIdSet.has(order.id)),
        ],
      }));
      return canonicalOrders.map((order) => order.id);
    },
    [commit, state],
  );

  const refreshMessengerJobs = useCallback(
    async (driverCode: string) => {
      const requestId = ++messengerRefreshRequestRef.current;
      const workflowRevision = messengerWorkflowRevisionRef.current;
      let remote: Awaited<ReturnType<typeof fetchMessengerOrders>>;
      try {
        remote = await fetchMessengerOrders(driverCode);
      } catch (error) {
        // focus + visibilitychange + interval can overlap. An obsolete failed request
        // must not replace the result/error state of the newest refresh.
        if (
          requestId !== messengerRefreshRequestRef.current ||
          workflowRevision !== messengerWorkflowRevisionRef.current
        ) {
          return;
        }
        throw error;
      }
      if (
        requestId !== messengerRefreshRequestRef.current ||
        workflowRevision !== messengerWorkflowRevisionRef.current
      ) {
        return;
      }
      commit((current) => ({
        ...current,
        orders: [
          ...current.orders.filter(
            (order) =>
              !isMessengerOrderParticipant(order, driverCode) ||
              !MESSENGER_JOB_STATUSES.includes(order.status),
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
      fetchAppDrivers({ approvalStatus: 'approved' }),
    ]);
    commit((current) => {
      const remoteIds = new Set(remoteOrders.map((order) => order.id));
      const remoteCodes = new Set(remoteOrders.map((order) => order.orderNo));
      const localDrafts = current.orders.filter(
        (order) =>
          LOCAL_DRAFT_STATUSES.includes(order.status) &&
          !remoteIds.has(order.id) &&
          !remoteCodes.has(order.orderNo),
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

  const updateOrderDetails = useCallback(
    (orderId: string, input: Parameters<RetailStore['updateOrderDetails']>[1]) => {
      commit((current) => updateOrderDetailsState(current, orderId, input));
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

  const confirmOrders = useCallback(
    (orderIds: string[], shippingMethod?: Parameters<RetailStore['confirmOrder']>[1]) => {
      if (orderIds.length === 0) return;
      const ids = new Set(orderIds);
      commit((current) =>
        [...ids].reduce((acc, id) => confirmOrderState(acc, id, shippingMethod), current),
      );
    },
    [commit],
  );

  const approveImportOrders = useCallback(
    async (orderIds: string[], shippingMethod?: Parameters<RetailStore['confirmOrder']>[1]) => {
      if (orderIds.length === 0) return;
      await approveImportOrdersApi(orderIds, shippingMethod);
      const ids = new Set(orderIds);
      commit((current) =>
        [...ids].reduce((acc, id) => confirmOrderState(acc, id, shippingMethod), current),
      );
      await syncFromBackend();
    },
    [commit, syncFromBackend],
  );

  const rejectImportOrders = useCallback(
    async (orderIds: string[], input?: Parameters<RetailStore['rejectImportOrders']>[1]) => {
      if (orderIds.length === 0) return;
      await rejectImportOrdersApi(orderIds, input);
      commit((current) => rejectImportOrdersState(current, orderIds, input));
    },
    [commit],
  );

  const restoreImportOrders = useCallback(
    async (orderIds: string[]) => {
      if (orderIds.length === 0) return;
      await restoreImportOrdersApi(orderIds);
      commit((current) => restoreImportOrdersState(current, orderIds));
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

  const unassignOrder = useCallback(
    async (orderId: string, input: Parameters<RetailStore['unassignOrder']>[1]) => {
      const canonical = await unassignAppOrder(orderId, input);
      commit((current) => ({ ...current, orders: replaceOrder(current.orders, canonical) }));
    },
    [commit],
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

  // จับคู่คนขับ + สร้าง route + เริ่มจัดส่ง ในคำสั่งเดียว (one-click dispatch)
  // ข้ามขั้น "รอสร้าง Route" — ใช้เมื่อไว้ใจการจับคู่ของ auto-assign เต็มที่
  const autoAssignAndDispatchReadyOrders = useCallback(
    async (orderIds?: string[]) => {
      const next = autoAssignReadyOrdersState(state, orderIds);
      const changed = next.orders.filter((order) => {
        const before = state.orders.find((item) => item.id === order.id);
        return before?.assignedDriverId !== order.assignedDriverId && order.assignedDriverId;
      });
      // 1) sync + assign บน backend
      const assigned = await Promise.all(
        changed.map((order) => syncAndAssignOrder(order, order.assignedDriverId!)),
      );
      // 2) เริ่มจัดส่งทันทีด้วย id/คนขับจาก canonical ที่เพิ่ง assign
      const started = await Promise.all(
        assigned.map((order, index) =>
          startMessengerOrder(order.id, order.assignedDriverId ?? changed[index].assignedDriverId!),
        ),
      );
      commit(() => {
        let result: RetailState = { ...next, orders: assigned.reduce(replaceOrder, next.orders) };
        for (const order of started) {
          const advanced = startDeliveryState(result, order.id);
          result = { ...advanced, orders: replaceOrder(advanced.orders, order) };
        }
        return result;
      });
      return started.map((order) => order.id);
    },
    [commit, state],
  );

  const startDelivery = useCallback(
    async (orderId: string) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order?.assignedDriverId) return;
      const canonical = await startMessengerOrder(orderId, order.assignedDriverId);
      messengerWorkflowRevisionRef.current += 1;
      commit((current) => {
        const started = startDeliveryState(current, orderId);
        return { ...started, orders: replaceOrder(started.orders, canonical) };
      });
    },
    [commit, state.orders],
  );

  const acceptDeliveryJob = useCallback(
    async (orderId: string) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order?.assignedDriverId) return;
      const canonical = await acceptMessengerOrder(orderId, order.assignedDriverId);
      messengerWorkflowRevisionRef.current += 1;
      commit((current) => ({
        ...current,
        orders: replaceOrder(current.orders, canonical),
      }));
    },
    [commit, state.orders],
  );

  const submitDelivery = useCallback(
    async (orderId: string, input: SubmitDeliveryInput) => {
      const order = state.orders.find((item) => item.id === orderId);
      if (!order?.assignedDriverId) return;
      const editorRole = input.editorRole ?? (mode === 'web' ? 'admin' : 'messenger');
      if (order.status === 'pending_confirmation' && !canReviseDeliveryProof(order, editorRole)) {
        throw new Error(
          `${editorRole === 'admin' ? 'admin' : 'messenger'} แก้ไขหลักฐานได้ครบจำนวนครั้งแล้ว`,
        );
      }
      const submitInput: SubmitDeliveryInput = {
        ...input,
        editorRole,
        recordedBy: input.recordedBy ?? (editorRole === 'admin' ? order.handledBy : undefined),
      };
      const canonical =
        editorRole === 'admin'
          ? await submitAppDeliveryProof(orderId, submitInput)
          : await submitMessengerOrder(orderId, order.assignedDriverId, submitInput);
      if (editorRole === 'messenger') messengerWorkflowRevisionRef.current += 1;
      commit((current) => {
        const submitted = submitDeliveryState(current, orderId, submitInput);
        const submittedOrder = submitted.orders.find(
          (item) =>
            item.id === canonical.id ||
            item.orderNo === canonical.orderNo ||
            item.code === canonical.code,
        );
        const reviewCanonical = submittedOrder
          ? {
              ...canonical,
              status: submittedOrder.status,
              proofOfDelivery: submittedOrder.proofOfDelivery,
              proofHistory: submittedOrder.proofHistory,
              activityLog: submittedOrder.activityLog,
            }
          : canonical;
        return { ...submitted, orders: replaceOrder(submitted.orders, reviewCanonical) };
      });
    },
    [commit, mode, state.orders],
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
    async (orderId: string, input: Parameters<RetailStore['cancelOrder']>[1]) => {
      const canonical = await cancelOrderApi(orderId, input);
      commit((current) => {
        // cancelOrderState จัดการผลข้างเคียงฝั่ง local (เช่น driver activeOrders)
        // แล้วทับตัว order ด้วยข้อมูล canonical จาก backend (resolution + timeline)
        const cancelled = cancelOrderState(current, orderId, input);
        return { ...cancelled, orders: replaceOrder(cancelled.orders, canonical) };
      });
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
      // ที่ backend ไม่ได้คงไว้คือ plannedDriverId (Messenger) เลย savePlanning ซ้ำด้วย
      // ข้อมูล route เดิมจาก frontend (restore) เพื่อคง Messenger ตามแผนเดิมไว้
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
        throw new Error('กรุณาบันทึกวันส่งและ Messenger ก่อน Publish');
      }
      if (
        selected.some(
          (order) =>
            order.deliveryPlan?.plannedDate !== plannedDate ||
            order.deliveryPlan?.plannedDriverId !== driverCode,
        )
      ) {
        throw new Error('orders ใน Route ต้องเป็นวันส่งและ Messenger เดียวกัน');
      }
      const route = await publishPlanningRoute({
        orderIds,
        plannedDate,
        plannedTime,
        driverCode,
        note: first.deliveryPlan?.note,
        origin: await getAdminRouteOrigin(),
        requiresAcceptance: first.metadataJson?.dispatch?.sla?.requiresAcceptance,
        acceptWithinMinutes: first.metadataJson?.dispatch?.sla?.acceptWithinMinutes,
        startWithinMinutes: first.metadataJson?.dispatch?.sla?.startWithinMinutes,
        startPolicy: first.metadataJson?.dispatch?.sla?.startPolicy,
      });
      await syncFromBackend();
      return route;
    },
    [state.orders, syncFromBackend],
  );

  const publishUrgentRoute = useCallback(
    async (orderId: string | string[], input: Parameters<RetailStore['publishUrgentRoute']>[1]) => {
      const orderIds = Array.isArray(orderId) ? orderId : [orderId];
      const selected = state.orders.filter((item) => orderIds.includes(item.id));
      if (selected.length !== orderIds.length) throw new Error('ไม่พบงานที่เลือก');
      const canonical = await Promise.all(selected.map(syncAppOrder));
      const route = await publishUrgentPlanningRoute({
        orderId: orderIds.length === 1 ? canonical[0].id : undefined,
        orderIds: orderIds.length > 1 ? canonical.map((order) => order.id) : undefined,
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

  const sendCustomerNotification = useCallback(
    (orderId: string, input: Parameters<RetailStore['sendCustomerNotification']>[1]) => {
      commit((current) => sendCustomerNotificationState(current, orderId, input));
    },
    [commit],
  );

  const sendCustomerNotifications = useCallback(
    (orderIds: string[], input: Parameters<RetailStore['sendCustomerNotifications']>[1]) => {
      let sentCount = 0;
      commit((current) => {
        const next = sendCustomerNotificationsState(current, orderIds, input);
        sentCount = next.notifications.length - current.notifications.length;
        return next;
      });
      return sentCount;
    },
    [commit],
  );

  const resetDemoData = useCallback(() => {
    commit(() => defaultState);
    void syncFromBackend();
  }, [commit, syncFromBackend]);

  const value = useMemo<RetailStore>(
    () => ({
      ...state,
      createInternalChatOrder,
      createManualImportOrders,
      refreshMessengerJobs,
      syncFromBackend,
      updateOrder,
      updateOrderCustomer,
      updateOrderDetails,
      setShippingMethod,
      confirmOrder,
      confirmOrders,
      approveImportOrders,
      rejectImportOrders,
      restoreImportOrders,
      assignOrder,
      unassignOrder,
      autoAssignReadyOrders,
      autoAssignAndDispatchReadyOrders,
      startDelivery,
      acceptDeliveryJob,
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
      sendCustomerNotification,
      sendCustomerNotifications,
      resetDemoData,
    }),
    [
      state,
      createInternalChatOrder,
      createManualImportOrders,
      refreshMessengerJobs,
      syncFromBackend,
      updateOrder,
      updateOrderCustomer,
      updateOrderDetails,
      setShippingMethod,
      confirmOrder,
      confirmOrders,
      approveImportOrders,
      rejectImportOrders,
      restoreImportOrders,
      assignOrder,
      unassignOrder,
      autoAssignReadyOrders,
      autoAssignAndDispatchReadyOrders,
      startDelivery,
      acceptDeliveryJob,
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
      sendCustomerNotification,
      sendCustomerNotifications,
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
