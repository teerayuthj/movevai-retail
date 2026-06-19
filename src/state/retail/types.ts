import type {
  CancelReason,
  DispatchReadiness,
  Driver,
  FailNextAction,
  FailReason,
  Handler,
  Order,
  PostalService,
  ProofOfDelivery,
  ShippingMethod,
} from '@/data/mock';
import type { PlanningRoute } from '@/lib/retailApi';

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

/** หลักฐานที่ rider ส่งตอนปิดงาน (action จะเติม capturedAt/capturedByDriverId ให้) */
export type SubmitDeliveryInput = Omit<ProofOfDelivery, 'capturedAt' | 'capturedByDriverId'>;

export type ConfirmDeliveryInput = {
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
  refreshRiderJobs: (driverCode: string) => Promise<void>;
  /** ดึง orders + drivers จาก backend (ฝั่ง web) — ใช้ refresh/poll */
  syncFromBackend: () => Promise<void>;
  updateOrder: (orderId: string, patch: Partial<Order>) => void;
  updateOrderCustomer: (orderId: string, customer: Order['customer']) => void;
  setShippingMethod: (orderId: string, method: ShippingMethod) => void;
  confirmOrder: (orderId: string, shippingMethod?: ShippingMethod) => void;
  finishParsingOrder: (orderId: string) => void;
  assignOrder: (orderId: string, driverId: string) => Promise<void>;
  autoAssignReadyOrders: (orderIds?: string[]) => Promise<void>;
  startDelivery: (orderId: string) => Promise<void>;
  submitDelivery: (orderId: string, input: SubmitDeliveryInput) => Promise<void>;
  confirmDelivery: (orderId: string, input?: ConfirmDeliveryInput) => Promise<void>;
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
  planOrders: (orderIds: string[], input: PlanOrdersInput) => Promise<void>;
  clearPlannedOrders: (orderIds: string[]) => Promise<void>;
  releasePlannedOrders: (orderIds: string[]) => Promise<PlanningRoute>;
  setDispatchReadiness: (
    orderId: string,
    readiness: DispatchReadiness,
    note?: string,
  ) => Promise<void>;
  resetDemoData: () => void;
};
