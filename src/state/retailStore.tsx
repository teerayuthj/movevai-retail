/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  assignOrderState,
  autoAssignReadyOrdersState,
  completeDeliveryState,
  failDeliveryState,
  markReturnedState,
  markReturningState,
  retryDeliveryState,
  setDriverStatusState,
  startDeliveryState,
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
import type { RetailState, RetailStore } from '@/state/retail/types';

const StoreContext = createContext<RetailStore | null>(null);

export function RetailProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RetailState>(loadState);

  const commit = useCallback((updater: (current: RetailState) => RetailState) => {
    setState((current) => {
      const next = updater(current);
      persistState(next);
      return next;
    });
  }, []);

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
    (orderId: string, driverId: string) => {
      commit((current) => assignOrderState(current, orderId, driverId));
    },
    [commit],
  );

  const autoAssignReadyOrders = useCallback(() => {
    commit((current) => autoAssignReadyOrdersState(current));
  }, [commit]);

  const startDelivery = useCallback(
    (orderId: string) => {
      commit((current) => startDeliveryState(current, orderId));
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

  const resetDemoData = useCallback(() => {
    commit(() => defaultState);
  }, [commit]);

  const value = useMemo<RetailStore>(
    () => ({
      ...state,
      createInternalChatOrder,
      updateOrder,
      updateOrderCustomer,
      setShippingMethod,
      confirmOrder,
      finishParsingOrder,
      assignOrder,
      autoAssignReadyOrders,
      startDelivery,
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
      resetDemoData,
    }),
    [
      state,
      createInternalChatOrder,
      updateOrder,
      updateOrderCustomer,
      setShippingMethod,
      confirmOrder,
      finishParsingOrder,
      assignOrder,
      autoAssignReadyOrders,
      startDelivery,
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
