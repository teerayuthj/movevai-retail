import type {
  CancelReason,
  DispatchReadiness,
  Driver,
  FailNextAction,
  FailReason,
  Handler,
  Order,
  PostalService,
  ShippingMethod,
} from '@/data/mock';

export type RetailState = {
  orders: Order[];
  drivers: Driver[];
};

export type InternalChatOrderInput = {
  message: string;
  files: { name: string; size: number; type: string }[];
};

export type CancelOrderInput = {
  reason: CancelReason;
  note?: string;
  recordedBy?: Handler;
};

export type FailDeliveryInput = {
  reason: FailReason;
  nextAction: FailNextAction;
  note?: string;
  recordedBy?: Handler;
};

export type MarkReturningInput = {
  reason: FailReason;
  note?: string;
  recordedBy?: Handler;
};

export type MarkReturnedInput = {
  note?: string;
  recordedBy?: Handler;
};

export type PlanOrdersInput = {
  plannedDate: string;
  plannedDriverId?: string;
  dispatchReadiness?: DispatchReadiness;
  note?: string;
};

export type RetailStore = RetailState & {
  createInternalChatOrder: (input: InternalChatOrderInput) => string;
  updateOrder: (orderId: string, patch: Partial<Order>) => void;
  updateOrderCustomer: (orderId: string, customer: Order['customer']) => void;
  setShippingMethod: (orderId: string, method: ShippingMethod) => void;
  confirmOrder: (orderId: string, shippingMethod?: ShippingMethod) => void;
  finishParsingOrder: (orderId: string) => void;
  assignOrder: (orderId: string, driverId: string) => void;
  autoAssignReadyOrders: () => void;
  startDelivery: (orderId: string) => void;
  completeDelivery: (orderId: string, success?: boolean) => void;
  setDriverStatus: (driverId: string, status: Driver['status']) => void;
  exportPostalBatch: (orderIds: string[], service: PostalService) => string;
  setPostalTracking: (orderId: string, trackingNumber: string) => void;
  markPostalHandedOver: (orderIds: string[]) => void;
  completePostalDelivery: (orderId: string, success?: boolean) => void;
  cancelOrder: (orderId: string, input: CancelOrderInput) => void;
  failDelivery: (orderId: string, input: FailDeliveryInput) => void;
  markReturning: (orderId: string, input: MarkReturningInput) => void;
  markReturned: (orderId: string, input?: MarkReturnedInput) => void;
  retryDelivery: (orderId: string) => void;
  planOrders: (orderIds: string[], input: PlanOrdersInput) => void;
  clearPlannedOrders: (orderIds: string[]) => void;
  releasePlannedOrders: (orderIds: string[]) => void;
  setDispatchReadiness: (orderId: string, readiness: DispatchReadiness, note?: string) => void;
  resetDemoData: () => void;
};
