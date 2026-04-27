import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { drivers as initialDrivers, orders as initialOrders } from "@/data/mock";
import type {
  CancelReason,
  Driver,
  FailNextAction,
  FailReason,
  Handler,
  Order,
  OrderResolution,
  PostalService,
  ShippingMethod,
} from "@/data/mock";
import { nextBatchId } from "@/lib/export";

export const CANCELLABLE: Order["status"][] = [
  "new",
  "needs_review",
  "ready",
  "assigned",
];

const FAILABLE: Order["status"][] = ["assigned", "in_transit"];

const DEFAULT_HANDLER: Handler = {
  name: "พนักงาน Ausiris",
  department: "Ops",
};

type RetailState = {
  orders: Order[];
  drivers: Driver[];
};

type RetailStore = RetailState & {
  createInternalChatOrder: (input: {
    message: string;
    files: { name: string; size: number; type: string }[];
  }) => string;
  updateOrder: (orderId: string, patch: Partial<Order>) => void;
  updateOrderCustomer: (orderId: string, customer: Order["customer"]) => void;
  setShippingMethod: (orderId: string, method: ShippingMethod) => void;
  confirmOrder: (orderId: string, shippingMethod?: ShippingMethod) => void;
  finishParsingOrder: (orderId: string) => void;
  assignOrder: (orderId: string, driverId: string) => void;
  autoAssignReadyOrders: () => void;
  startDelivery: (orderId: string) => void;
  completeDelivery: (orderId: string, success?: boolean) => void;
  setDriverStatus: (driverId: string, status: Driver["status"]) => void;
  exportPostalBatch: (
    orderIds: string[],
    service: PostalService
  ) => string; // returns new batchId
  setPostalTracking: (orderId: string, trackingNumber: string) => void;
  markPostalHandedOver: (orderIds: string[]) => void;
  completePostalDelivery: (orderId: string, success?: boolean) => void;
  cancelOrder: (
    orderId: string,
    input: { reason: CancelReason; note?: string; recordedBy?: Handler }
  ) => void;
  failDelivery: (
    orderId: string,
    input: {
      reason: FailReason;
      nextAction: FailNextAction;
      note?: string;
      recordedBy?: Handler;
    }
  ) => void;
  markReturning: (
    orderId: string,
    input: { reason: FailReason; note?: string; recordedBy?: Handler }
  ) => void;
  markReturned: (
    orderId: string,
    input?: { note?: string; recordedBy?: Handler }
  ) => void;
  retryDelivery: (orderId: string) => void;
  resetDemoData: () => void;
};

const STORAGE_KEY = "movevai-retail:v1";

const defaultState: RetailState = {
  orders: initialOrders,
  drivers: initialDrivers,
};

function mergeDriverDefaults(drivers: Driver[]): Driver[] {
  return drivers.map((driver) => {
    const defaultDriver = initialDrivers.find((item) => item.id === driver.id);
    return {
      ...defaultDriver,
      ...driver,
      avatarKey: driver.avatarKey || defaultDriver?.avatarKey || "emerald",
    };
  });
}

const StoreContext = createContext<RetailStore | null>(null);

function loadState(): RetailState {
  if (typeof window === "undefined") return defaultState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw) as RetailState;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.drivers)) {
      return defaultState;
    }

    return {
      orders: parsed.orders,
      drivers: mergeDriverDefaults(parsed.drivers),
    };
  } catch {
    return defaultState;
  }
}

function persistState(next: RetailState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function reduceDriverLoad(driver: Driver): Driver {
  const activeOrders = Math.max(0, driver.activeOrders - 1);
  return {
    ...driver,
    activeOrders,
    status:
      activeOrders === 0 && driver.status === "on_delivery"
        ? "available"
        : driver.status,
  };
}

function chooseDriverForOrder(order: Order, drivers: Driver[]) {
  const highValue = order.totalValue >= 500000 || order.insured;
  const available = drivers
    .filter((d) => d.status !== "off_duty")
    .filter((d) => d.activeOrders < d.capacity)
    .filter((d) => !highValue || d.highValueCertified)
    .sort((a, b) => {
      const capacityLeft = b.capacity - b.activeOrders - (a.capacity - a.activeOrders);
      if (capacityLeft !== 0) return capacityLeft;
      return b.rating - a.rating;
    });

  return available[0];
}

function nextOrderIdentity(orders: Order[]) {
  const maxNumber = orders.reduce((max, order) => {
    const match = order.code.match(/#AUS-(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1040);
  const nextNumber = maxNumber + 1;
  return {
    id: `O-${nextNumber}`,
    code: `#AUS-${nextNumber}`,
  };
}

function extractPhone(message: string) {
  return message.match(/(?:\+?66|0)\d[\d\s-]{7,12}\d/)?.[0]?.replace(/\s+/g, " ") ?? "รอตรวจ";
}

function extractCustomerName(message: string) {
  const named = message.match(/(?:ชื่อ|ลูกค้า|ร้าน)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim();
  if (named) return named;

  const firstUsefulLine = message
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.match(/(?:โทร|เบอร์|รวม|ที่อยู่)/i));

  return firstUsefulLine ?? "รอตรวจจาก Chat ภายใน";
}

function extractTotal(message: string) {
  const totalText = message.match(/(?:รวม|ยอดรวม|total)\s*[:：]?\s*฿?\s*([\d,]+)/i)?.[1];
  return totalText ? Number(totalText.replace(/,/g, "")) : 0;
}

function buildInternalChatOrder(
  current: RetailState,
  input: { message: string; files: { name: string; size: number; type: string }[] }
): Order {
  const identity = nextOrderIdentity(current.orders);
  const message = input.message.trim();
  const totalValue = extractTotal(message);
  const qty = Number(message.match(/(?:x|×)\s*(\d+)|(\d+)\s*ชิ้น/i)?.[1] ?? message.match(/(?:x|×)\s*(\d+)|(\d+)\s*ชิ้น/i)?.[2] ?? 1);
  const purity = message.includes("99.99") ? "99.99%" : "96.5%";
  const weight = message.match(/(\d+(?:\.\d+)?\s*(?:บาท|สลึง|กรัม|g|kg))/i)?.[1] ?? (purity === "99.99%" ? "10 กรัม" : "1 บาท (15.244 ก.)");
  const unitPrice = totalValue > 0 ? Math.round(totalValue / Math.max(1, qty)) : purity === "99.99%" ? 32500 : 45200;
  const fileSummary = input.files.length > 0
    ? `\n\nไฟล์แนบ:\n${input.files.map((file) => `- ${file.name}`).join("\n")}`
    : "";

  return {
    ...identity,
    source: "internal_chat",
    status: "needs_review",
    receivedAt: new Date().toISOString(),
    handledBy: {
      name: "พนักงาน Ausiris",
      department: "Internal Chat",
    },
    confidence: 70,
    customer: {
      name: extractCustomerName(message),
      phone: extractPhone(message),
      address:
        message.match(/(?:ที่อยู่|ส่งที่)\s*[:：]?\s*([^\n]+)/i)?.[1]?.trim() ??
        "รอตรวจที่อยู่จัดส่ง",
    },
    items: [
      {
        sku: purity === "99.99%" ? "AUS-INV-9999-10G" : "AUS-BAR-965-1B",
        name:
          purity === "99.99%"
            ? "AUSIRIS ทองคำแท่ง 99.99% Investment Grade"
            : "AUSIRIS ทองคำแท่ง 96.5%",
        purity,
        weight,
        qty: Math.max(1, qty),
        unitPrice,
        note: "สร้างจาก Chat ภายใน โปรดตรวจเทียบกับข้อความ/ไฟล์ต้นฉบับ",
      },
    ],
    note:
      "นำเข้าผ่าน Chat ภายใน · ตรวจรายการสินค้า จำนวน น้ำหนัก และยอดรวมก่อนยืนยันเข้าคิว",
    rawText: `${message || "ไม่มีข้อความประกอบ"}${fileSummary}`,
    totalValue: totalValue > 0 ? totalValue : unitPrice * Math.max(1, qty),
    payment: "prepaid",
    requiresIdCheck: true,
    insured: true,
  };
}

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
    (orderId: string, patch: Partial<Order>) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId ? { ...order, ...patch } : order
        ),
      }));
    },
    [commit]
  );

  const createInternalChatOrder = useCallback(
    (input: { message: string; files: { name: string; size: number; type: string }[] }) => {
      let createdId = "";
      commit((current) => {
        const order = buildInternalChatOrder(current, input);
        createdId = order.id;
        return {
          ...current,
          orders: [order, ...current.orders],
        };
      });
      return createdId;
    },
    [commit]
  );

  const updateOrderCustomer = useCallback(
    (orderId: string, customer: Order["customer"]) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId ? { ...order, customer } : order
        ),
      }));
    },
    [commit]
  );

  const confirmOrder = useCallback(
    (orderId: string, shippingMethod?: ShippingMethod) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: "ready",
                confidence: Math.max(order.confidence, 90),
                shippingMethod:
                  shippingMethod ?? order.shippingMethod ?? "internal_driver",
              }
            : order
        ),
      }));
    },
    [commit]
  );

  const setShippingMethod = useCallback(
    (orderId: string, method: ShippingMethod) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId ? { ...order, shippingMethod: method } : order
        ),
      }));
    },
    [commit]
  );

  const finishParsingOrder = useCallback(
    (orderId: string) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: "needs_review",
                confidence: Math.max(order.confidence, 84),
                customer: {
                  ...order.customer,
                  phone: order.customer.phone === "—" ? "02-118-4499" : order.customer.phone,
                  address:
                    order.items.length === 0
                      ? "อาคาร Silom Complex ชั้น 12 ถ.สีลม แขวงสีลม เขตบางรัก กทม. 10500"
                      : order.customer.address,
                },
                items:
                  order.items.length > 0
                    ? order.items
                    : [
                        {
                          sku: "AUS-BAR-965-1B",
                          name: "AUSIRIS ทองคำแท่ง 96.5%",
                          purity: "96.5%",
                          weight: "1 บาท (15.244 ก.)",
                          qty: 8,
                          unitPrice: 45200,
                        },
                        {
                          sku: "AUS-INV-9999-10G",
                          name: "AUSIRIS ทองคำแท่ง 99.99% Investment Grade",
                          purity: "99.99%",
                          weight: "10 กรัม",
                          qty: 6,
                          unitPrice: 32500,
                        },
                      ],
                totalValue: order.totalValue > 0 ? order.totalValue : 556600,
                requiresIdCheck: true,
                insured: true,
                note:
                  order.note ??
                  "นำเข้าจาก Excel · AI จับคู่ SKU แล้ว โปรดตรวจจำนวนและยอดรวมก่อนยืนยันเข้าคิว",
              }
            : order
        ),
      }));
    },
    [commit]
  );

  const assignOrder = useCallback(
    (orderId: string, driverId: string) => {
      commit((current) => {
        const target = current.orders.find((order) => order.id === orderId);
        const nextDriver = current.drivers.find((driver) => driver.id === driverId);
        if (!target || !nextDriver || nextDriver.status === "off_duty") return current;

        const previousDriverId = target.assignedDriverId;
        const alreadyAssignedToDriver =
          target.status === "assigned" && previousDriverId === driverId;

        return {
          orders: current.orders.map((order) =>
            order.id === orderId
              ? { ...order, status: "assigned", assignedDriverId: driverId }
              : order
          ),
          drivers: current.drivers.map((driver) => {
            if (driver.id === previousDriverId && previousDriverId !== driverId) {
              return reduceDriverLoad(driver);
            }

            if (driver.id === driverId && !alreadyAssignedToDriver) {
              const activeOrders = Math.min(driver.capacity, driver.activeOrders + 1);
              return {
                ...driver,
                activeOrders,
                status: activeOrders > 0 ? "on_delivery" : driver.status,
              };
            }

            return driver;
          }),
        };
      });
    },
    [commit]
  );

  const autoAssignReadyOrders = useCallback(() => {
    commit((current) => {
      let workingDrivers = current.drivers;
      const assigned: Record<string, string> = {};

      current.orders
        .filter((order) => order.status === "ready")
        .forEach((order) => {
          const driver = chooseDriverForOrder(order, workingDrivers);
          if (!driver) return;

          assigned[order.id] = driver.id;
          workingDrivers = workingDrivers.map((d) =>
            d.id === driver.id
              ? {
                  ...d,
                  activeOrders: Math.min(d.capacity, d.activeOrders + 1),
                  status: "on_delivery",
                }
              : d
          );
        });

      return {
        orders: current.orders.map((order) =>
          assigned[order.id]
            ? {
                ...order,
                status: "assigned",
                assignedDriverId: assigned[order.id],
              }
            : order
        ),
        drivers: workingDrivers,
      };
    });
  }, [commit]);

  const startDelivery = useCallback(
    (orderId: string) => {
      updateOrder(orderId, { status: "in_transit" });
    },
    [updateOrder]
  );

  const completeDelivery = useCallback(
    (orderId: string, success = true) => {
      commit((current) => {
        const order = current.orders.find((o) => o.id === orderId);
        if (!order) return current;

        return {
          orders: current.orders.map((o) =>
            o.id === orderId
              ? { ...o, status: success ? "delivered" : "failed" }
              : o
          ),
          drivers: current.drivers.map((driver) =>
            driver.id === order.assignedDriverId ? reduceDriverLoad(driver) : driver
          ),
        };
      });
    },
    [commit]
  );

  const exportPostalBatch = useCallback(
    (orderIds: string[], service: PostalService) => {
      let batchId = "";
      const exportedAt = new Date().toISOString();
      const idSet = new Set(orderIds);

      commit((current) => {
        const existingBatchIds = current.orders
          .map((o) => o.postalBatch?.batchId)
          .filter((id): id is string => Boolean(id));
        batchId = nextBatchId(existingBatchIds);
        return {
          ...current,
          orders: current.orders.map((order) =>
            idSet.has(order.id) && order.shippingMethod === "thai_post"
              ? {
                  ...order,
                  status: "assigned",
                  postalBatch: {
                    batchId,
                    service,
                    exportedAt,
                  },
                }
              : order
          ),
        };
      });

      return batchId;
    },
    [commit]
  );

  const setPostalTracking = useCallback(
    (orderId: string, trackingNumber: string) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId && order.postalBatch
            ? {
                ...order,
                postalBatch: { ...order.postalBatch, trackingNumber },
              }
            : order
        ),
      }));
    },
    [commit]
  );

  const markPostalHandedOver = useCallback(
    (orderIds: string[]) => {
      const handedOverAt = new Date().toISOString();
      const idSet = new Set(orderIds);

      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          idSet.has(order.id) && order.postalBatch
            ? {
                ...order,
                status: "in_transit",
                postalBatch: { ...order.postalBatch, handedOverAt },
              }
            : order
        ),
      }));
    },
    [commit]
  );

  const completePostalDelivery = useCallback(
    (orderId: string, success = true) => {
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          order.id === orderId
            ? { ...order, status: success ? "delivered" : "failed" }
            : order
        ),
      }));
    },
    [commit]
  );

  const setDriverStatus = useCallback(
    (driverId: string, status: Driver["status"]) => {
      commit((current) => ({
        ...current,
        drivers: current.drivers.map((driver) =>
          driver.id === driverId ? { ...driver, status } : driver
        ),
      }));
    },
    [commit]
  );

  const cancelOrder = useCallback(
    (
      orderId: string,
      input: { reason: CancelReason; note?: string; recordedBy?: Handler }
    ) => {
      commit((current) => {
        const order = current.orders.find((o) => o.id === orderId);
        if (!order) return current;
        if (!CANCELLABLE.includes(order.status)) return current;

        const resolution: OrderResolution = {
          type: "cancelled",
          reason: input.reason,
          note: input.note,
          recordedBy: input.recordedBy ?? order.handledBy ?? DEFAULT_HANDLER,
          recordedAt: new Date().toISOString(),
        };

        const wasAssigned = order.status === "assigned";

        return {
          orders: current.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "cancelled",
                  resolution,
                  assignedDriverId: undefined,
                }
              : o
          ),
          drivers: current.drivers.map((driver) =>
            wasAssigned && driver.id === order.assignedDriverId
              ? reduceDriverLoad(driver)
              : driver
          ),
        };
      });
    },
    [commit]
  );

  const failDelivery = useCallback(
    (
      orderId: string,
      input: {
        reason: FailReason;
        nextAction: FailNextAction;
        note?: string;
        recordedBy?: Handler;
      }
    ) => {
      commit((current) => {
        const order = current.orders.find((o) => o.id === orderId);
        if (!order) return current;
        if (!FAILABLE.includes(order.status)) return current;

        const recordedBy =
          input.recordedBy ?? order.handledBy ?? DEFAULT_HANDLER;
        const recordedAt = new Date().toISOString();

        if (input.nextAction === "retry") {
          // นัดส่งใหม่: คงคนขับเดิม กลับสถานะ assigned ไม่ลด load
          return {
            ...current,
            orders: current.orders.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    status: "assigned",
                    resolution: {
                      type: "failed",
                      reason: input.reason,
                      note: input.note,
                      nextAction: "retry",
                      recordedBy,
                      recordedAt,
                    },
                  }
                : o
            ),
          };
        }

        const isReturn = input.nextAction === "return";
        const nextStatus: Order["status"] = isReturn ? "returning" : "failed";

        return {
          orders: current.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: nextStatus,
                  resolution: {
                    type: isReturn ? "returning" : "failed",
                    reason: input.reason,
                    note: input.note,
                    nextAction: input.nextAction,
                    recordedBy,
                    recordedAt,
                  },
                }
              : o
          ),
          drivers: current.drivers.map((driver) =>
            driver.id === order.assignedDriverId
              ? reduceDriverLoad(driver)
              : driver
          ),
        };
      });
    },
    [commit]
  );

  const markReturning = useCallback(
    (
      orderId: string,
      input: { reason: FailReason; note?: string; recordedBy?: Handler }
    ) => {
      commit((current) => {
        const order = current.orders.find((o) => o.id === orderId);
        if (!order) return current;
        if (order.status !== "failed") return current;

        return {
          ...current,
          orders: current.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "returning",
                  resolution: {
                    type: "returning",
                    reason: input.reason,
                    note: input.note,
                    recordedBy:
                      input.recordedBy ?? o.handledBy ?? DEFAULT_HANDLER,
                    recordedAt: new Date().toISOString(),
                  },
                }
              : o
          ),
        };
      });
    },
    [commit]
  );

  const markReturned = useCallback(
    (
      orderId: string,
      input?: { note?: string; recordedBy?: Handler }
    ) => {
      commit((current) => {
        const order = current.orders.find((o) => o.id === orderId);
        if (!order) return current;
        if (order.status !== "returning") return current;

        const previous = order.resolution;
        return {
          ...current,
          orders: current.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "returned",
                  resolution: {
                    type: "returned",
                    reason: previous?.reason,
                    note: input?.note ?? previous?.note,
                    recordedBy:
                      input?.recordedBy ?? o.handledBy ?? DEFAULT_HANDLER,
                    recordedAt: new Date().toISOString(),
                  },
                }
              : o
          ),
        };
      });
    },
    [commit]
  );

  const retryDelivery = useCallback(
    (orderId: string) => {
      commit((current) => {
        const order = current.orders.find((o) => o.id === orderId);
        if (!order) return current;
        if (order.status !== "failed") return current;
        if (!order.assignedDriverId) return current;

        const driver = current.drivers.find(
          (d) => d.id === order.assignedDriverId
        );
        if (!driver || driver.status === "off_duty") return current;
        if (driver.activeOrders >= driver.capacity) return current;

        return {
          orders: current.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: "assigned",
                  resolution: undefined,
                }
              : o
          ),
          drivers: current.drivers.map((d) =>
            d.id === driver.id
              ? {
                  ...d,
                  activeOrders: Math.min(d.capacity, d.activeOrders + 1),
                  status: "on_delivery",
                }
              : d
          ),
        };
      });
    },
    [commit]
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
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useRetailStore() {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useRetailStore must be used within RetailProvider");
  }
  return store;
}
