import type {
  CancelReason,
  DispatchReadiness,
  PlanningCancelReason,
  Driver,
  DeliveryProofEditorRole,
  FailNextAction,
  FailReason,
  Handler,
  Order,
  PostalService,
  ProofOfDelivery,
  ShippingMethod,
} from '@/data/orderTypes';
import type { ImportRejectReason, PlanningRoute } from '@/lib/retailApi';
import type { CustomerNotification } from '@/lib/notifications';
import type { ManualImportOrderInput } from '@/state/retail/manualImport';
import type { SendCustomerNotificationInput } from '@/state/retail/notifications';

export type RetailState = {
  orders: Order[];
  drivers: Driver[];
  notifications: CustomerNotification[];
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

/** หลักฐานที่ messenger ส่งตอนปิดงาน (action จะเติม capturedAt/capturedByDriverId ให้) */
export type SubmitDeliveryInput = Omit<ProofOfDelivery, 'capturedAt' | 'capturedByDriverId'> & {
  editorRole?: DeliveryProofEditorRole;
  recordedBy?: Handler;
};

export type ConfirmDeliveryInput = {
  note?: string;
  recordedBy?: Handler;
};

export type PlanOrdersInput = {
  plannedDate: string;
  plannedTime?: string;
  plannedDriverId?: string;
  dispatchReadiness?: DispatchReadiness;
  note?: string;
};

export type UpdateOrderDetailsInput = {
  requestedDeliveryDate?: string;
  requestedDeliveryTime?: string;
  itemQty?: number;
};

export type RetailStore = RetailState & {
  createInternalChatOrder: (input: InternalChatOrderInput) => Promise<string>;
  createManualImportOrders: (inputs: ManualImportOrderInput[]) => Promise<string[]>;
  refreshMessengerJobs: (driverCode: string) => Promise<void>;
  /** ดึง orders + drivers จาก backend (ฝั่ง web) — ใช้ refresh/poll */
  syncFromBackend: () => Promise<void>;
  updateOrder: (orderId: string, patch: Partial<Order>) => void;
  updateOrderCustomer: (orderId: string, customer: Order['customer']) => void;
  updateOrderDetails: (orderId: string, input: UpdateOrderDetailsInput) => void;
  setShippingMethod: (orderId: string, method: ShippingMethod) => void;
  confirmOrder: (orderId: string, shippingMethod?: ShippingMethod) => void;
  /** ยืนยันเข้าคิวหลาย order พร้อมกันใน commit เดียว (ใช้กับ batch นำเข้า CSV) */
  confirmOrders: (orderIds: string[], shippingMethod?: ShippingMethod) => void;
  /** อนุมัติออเดอร์นำเข้าเข้าคิว — sync backend (durable) แล้วอัปเดต local */
  approveImportOrders: (orderIds: string[], shippingMethod?: ShippingMethod) => Promise<void>;
  /** ปฏิเสธออเดอร์นำเข้า → status 'rejected' (ดึงกลับได้) */
  rejectImportOrders: (
    orderIds: string[],
    input?: { reason?: ImportRejectReason; note?: string },
  ) => Promise<void>;
  /** ดึงออเดอร์ที่ปฏิเสธกลับมาเป็น 'new' */
  restoreImportOrders: (orderIds: string[]) => Promise<void>;
  assignOrder: (orderId: string, driverId: string) => Promise<void>;
  /** ถอนคนขับจากงาน assigned ที่ยังไม่มี Route แล้วคืนเป็น ready */
  unassignOrder: (
    orderId: string,
    input: { reason: PlanningCancelReason; note?: string },
  ) => Promise<void>;
  autoAssignReadyOrders: (orderIds?: string[]) => Promise<void>;
  /** จับคู่คนขับ + สร้าง route + เริ่มจัดส่ง ในคำสั่งเดียว — คืน id งานที่ส่งออก */
  autoAssignAndDispatchReadyOrders: (orderIds?: string[]) => Promise<string[]>;
  startDelivery: (orderId: string) => Promise<void>;
  acceptDeliveryJob: (orderId: string) => Promise<void>;
  startDeliveryTrip: (routeId: string) => Promise<void>;
  acceptDeliveryTrip: (routeId: string) => Promise<void>;
  submitDelivery: (orderId: string, input: SubmitDeliveryInput) => Promise<void>;
  confirmDelivery: (orderId: string, input?: ConfirmDeliveryInput) => Promise<void>;
  completeDelivery: (orderId: string, success?: boolean) => void;
  setDriverStatus: (driverId: string, status: Driver['status']) => void;
  exportPostalBatch: (orderIds: string[], service: PostalService) => string;
  setPostalTracking: (orderId: string, trackingNumber: string) => void;
  markPostalHandedOver: (orderIds: string[]) => void;
  completePostalDelivery: (orderId: string, success?: boolean) => void;
  cancelOrder: (orderId: string, input: CancelOrderInput) => Promise<void>;
  failDelivery: (orderId: string, input: FailDeliveryInput) => void;
  markReturning: (orderId: string, input: MarkReturningInput) => void;
  markReturned: (orderId: string, input?: MarkReturnedInput) => void;
  retryDelivery: (orderId: string) => void;
  planOrders: (orderIds: string[], input: PlanOrdersInput) => Promise<void>;
  clearPlannedOrders: (
    orderIds: string[],
    input?: { reason?: PlanningCancelReason; note?: string },
  ) => Promise<void>;
  releasePlannedOrders: (orderIds: string[]) => Promise<PlanningRoute>;
  publishUrgentRoute: (
    orderId: string | string[],
    input: {
      driverCode: string;
      coDriverCodes?: string[];
      note?: string;
      origin?: { lat: number; lng: number };
      acceptWithinMinutes?: number;
      startWithinMinutes?: number;
      startPolicy?: 'manual' | 'accept_starts';
    },
  ) => Promise<PlanningRoute>;
  cancelRoute: (
    routeId: string,
    input: { reason: PlanningCancelReason; note?: string },
    // ข้อมูล route เดิมจาก frontend ใช้คง Messenger/วันเวลาตามแผน เพราะ backend ลบ stops
    // ทิ้งตอน cancel แล้ว response จึงไม่มี orderIds ให้ savePlanning ซ้ำ
    restore?: {
      orderIds: string[];
      plannedDate: string;
      plannedTime?: string;
      driverCode: string;
      note?: string;
    },
  ) => Promise<PlanningRoute>;
  reassignRoute: (
    routeId: string,
    input: { driverCode: string; coDriverCodes?: string[]; note?: string },
  ) => Promise<PlanningRoute>;
  setDispatchReadiness: (
    orderId: string,
    readiness: DispatchReadiness,
    note?: string,
  ) => Promise<void>;
  sendCustomerNotification: (orderId: string, input: SendCustomerNotificationInput) => void;
  sendCustomerNotifications: (orderIds: string[], input: SendCustomerNotificationInput) => number;
  resetDemoData: () => void;
};
