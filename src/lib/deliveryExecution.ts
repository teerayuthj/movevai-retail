import type { Driver, Order, ProofOfDelivery } from '@/data/orderTypes';
import { formatTHB } from '@/data/orderTypes';
import {
  getAssignedOrderOverdueMinutes,
  getTodayDateKey,
  isUnreleasedPlannedOrder,
} from '@/lib/deliveryPlanning';

export type DriverQueueTab = 'ready' | 'assigned';
export type DeliveryTrackingTab =
  | 'all_open'
  | 'planned'
  | 'awaiting_acceptance'
  | 'overdue'
  | 'in_transit'
  | 'pending'
  | 'returning'
  | 'closed';

export const driverQueueTabLabels: Record<DriverQueueTab, string> = {
  ready: 'รอมอบหมาย',
  assigned: 'รอสร้าง Route',
};

export const deliveryTrackingTabLabels: Record<DeliveryTrackingTab, string> = {
  all_open: 'งานยังไม่ปิด',
  planned: 'แผนล่วงหน้า',
  awaiting_acceptance: 'รอคนขับรับ',
  overdue: 'เลยกำหนด',
  in_transit: 'กำลังจัดส่ง',
  pending: 'รอยืนยัน',
  returning: 'ส่งกลับ',
  closed: 'ปิดล่าสุด',
};

export function getDriverQueueTab(order: Order): DriverQueueTab | null {
  if (order.status === 'ready') return 'ready';
  if (order.status === 'assigned') return 'assigned';
  return null;
}

/**
 * สถานะคนขับที่ derive จากงานจริง เพื่อให้ badge ฝั่ง admin ตรงกับ messenger
 * — "กำลังส่ง" เฉพาะตอนมีงาน in_transit เท่านั้น (งานรอตรวจ/assigned ถือว่า "ว่าง")
 * — off_duty เป็นค่าที่ตั้งเอง จึงคงไว้เสมอ
 * ตรงกับ effectiveMessengerStatus ใน MessengerConsole
 */
export function deriveDriverDisplayStatus(driver: Driver, orders: Order[]): Driver['status'] {
  if (driver.status === 'off_duty') return 'off_duty';
  const activelyDelivering = orders.some(
    (order) => isDriverAssignedToOrder(order, driver.id) && order.status === 'in_transit',
  );
  return activelyDelivering ? 'on_delivery' : 'available';
}

export type DriverWorkloadSummary = {
  waitingToStart: number;
  inTransit: number;
  pendingReview: number;
  returning: number;
  plannedForDate: number;
};

export function isDriverAssignedToOrder(order: Order, driverId: string) {
  return order.assignedDriverId === driverId || (order.coDriverIds ?? []).includes(driverId);
}

/** สมาชิกทีมจัดส่งของ order เรียงคนขับหลักก่อน — ชื่อ resolve จาก drivers list, fallback เป็นชื่อ/รหัสบน order */
export function getOrderDriverTeam(
  order: Pick<Order, 'assignedDriverId' | 'assignedDriverName' | 'coDriverIds'>,
  drivers: Pick<Driver, 'id' | 'name'>[],
): { code: string; name: string; role: 'main' | 'co' }[] {
  if (!order.assignedDriverId) return [];
  const nameOf = (code: string) => drivers.find((driver) => driver.id === code)?.name;
  return [
    {
      code: order.assignedDriverId,
      name: nameOf(order.assignedDriverId) ?? order.assignedDriverName ?? order.assignedDriverId,
      role: 'main' as const,
    },
    ...(order.coDriverIds ?? []).map((code) => ({
      code,
      name: nameOf(code) ?? code,
      role: 'co' as const,
    })),
  ];
}

export function getDriverWorkloadSummary(
  driver: Pick<Driver, 'id'>,
  orders: Order[],
  options: { plannedDate?: string } = {},
): DriverWorkloadSummary {
  const plannedDate = options.plannedDate ?? getTodayDateKey();

  return orders.reduce<DriverWorkloadSummary>(
    (summary, order) => {
      const assignedToDriver = isDriverAssignedToOrder(order, driver.id);
      if (assignedToDriver) {
        if (order.status === 'assigned') summary.waitingToStart += 1;
        if (order.status === 'in_transit') summary.inTransit += 1;
        if (order.status === 'pending_confirmation') summary.pendingReview += 1;
        if (order.status === 'returning') summary.returning += 1;
      }

      if (
        order.deliveryPlan?.releaseState === 'planned' &&
        order.deliveryPlan.plannedDriverId === driver.id &&
        order.deliveryPlan.plannedDate === plannedDate
      ) {
        summary.plannedForDate += 1;
      }

      return summary;
    },
    {
      waitingToStart: 0,
      inTransit: 0,
      pendingReview: 0,
      returning: 0,
      plannedForDate: 0,
    },
  );
}

/**
 * ป้าย "งานที่รับอยู่" ของคนขับ — นับจากออเดอร์จริง (assigned + in_transit)
 * ห้ามใช้ driver.activeOrders โชว์ผู้ใช้ตรง ๆ เพราะเป็น counter สะสมที่ drift ได้
 */
export function formatDriverActiveJobs(driver: Pick<Driver, 'id'>, orders: Order[]): string {
  const { waitingToStart, inTransit } = getDriverWorkloadSummary(driver, orders);
  const total = waitingToStart + inTransit;
  if (total === 0) return 'งานที่รับอยู่ 0';
  return `งานที่รับอยู่ ${total} (รอเริ่ม ${waitingToStart} · กำลังส่ง ${inTransit})`;
}

/**
 * ป้ายสถานะคนขับใน dropdown เลือกคนขับตอน dispatch — derive จากงานจริง
 * ให้ตรงกับ badge ฝั่ง messenger (งานรอตรวจ/assigned ถือว่า "ว่าง")
 */
export function formatDriverDispatchStatus(driver: Driver, orders: Order[]): string {
  const status = deriveDriverDisplayStatus(driver, orders);
  if (status === 'on_delivery') {
    const { inTransit } = getDriverWorkloadSummary(driver, orders);
    return `กำลังส่ง ${inTransit || 1} งาน`;
  }
  return status === 'available' ? 'ว่าง พร้อมรับงาน' : 'พักงาน';
}

export function getDeliveryTrackingTab(order: Order): DeliveryTrackingTab | null {
  if (
    order.deliveryPlan?.releaseState === 'planned' &&
    Boolean(order.deliveryPlan.plannedDriverId)
  ) {
    return 'planned';
  }
  if (
    order.status === 'assigned' &&
    order.deliveryPlan?.releaseState === 'released' &&
    getAssignedOrderOverdueMinutes(order) != null
  ) {
    return 'overdue';
  }
  if (order.status === 'assigned' && order.deliveryPlan?.releaseState === 'released') {
    return 'awaiting_acceptance';
  }
  if (order.status === 'in_transit') return 'in_transit';
  if (order.status === 'pending_confirmation') return 'pending';
  if (order.status === 'returning') return 'returning';
  if (['delivered', 'failed', 'cancelled', 'returned'].includes(order.status)) return 'closed';
  return null;
}

// ── เวลาที่ใช้ส่ง (นับจากตอน rider กดเริ่มงาน → in_transit) ─────────────────
// admin ใช้ดูว่างานไหนค้างนานผิดปกติ; threshold เป็นค่าประเมินสำหรับส่งในเมือง
export type InTransitElapsedTone = 'normal' | 'slow' | 'critical';

const IN_TRANSIT_SLOW_MINUTES = 60;
const IN_TRANSIT_CRITICAL_MINUTES = 120;

/** นาทีที่ผ่านไปตั้งแต่เริ่มส่ง — null ถ้างานไม่ได้กำลังส่งหรือไม่มีเวลาเริ่ม (order เก่า) */
export function getInTransitElapsedMinutes(
  order: Order,
  nowMs: number = Date.now(),
): number | null {
  if (order.status !== 'in_transit' || !order.inTransitAt) return null;
  const startedMs = new Date(order.inTransitAt).getTime();
  if (Number.isNaN(startedMs)) return null;
  return Math.max(0, Math.floor((nowMs - startedMs) / 60_000));
}

export function getInTransitElapsedTone(minutes: number): InTransitElapsedTone {
  if (minutes >= IN_TRANSIT_CRITICAL_MINUTES) return 'critical';
  if (minutes >= IN_TRANSIT_SLOW_MINUTES) return 'slow';
  return 'normal';
}

/** ระยะเวลาแบบอ่านง่าย: "42 นาที" / "1 ชม. 20 นาที" / "2 วัน 3 ชม." */
export function formatElapsedDuration(minutes: number): string {
  if (minutes < 1) return 'ไม่ถึง 1 นาที';
  if (minutes < 60) return `${minutes} นาที`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours} ชม.${remainingMinutes ? ` ${remainingMinutes} นาที` : ''}`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days} วัน${remainingHours ? ` ${remainingHours} ชม.` : ''}`;
}

/** เวลาที่ใช้ส่งจริงของงานที่จบแล้ว (เริ่มส่ง → บันทึกหลักฐาน) — null ถ้าข้อมูลไม่ครบ */
export function getDeliveryDurationMinutes(
  inTransitAt: string | undefined,
  deliveredAt: string,
): number | null {
  if (!inTransitAt) return null;
  const startedMs = new Date(inTransitAt).getTime();
  const deliveredMs = new Date(deliveredAt).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(deliveredMs) || deliveredMs < startedMs) return null;
  return Math.floor((deliveredMs - startedMs) / 60_000);
}

/**
 * งานที่ต้องให้ CS ตรวจหลักฐานก่อนปิด (ไม่ auto-close)
 * — ของมีค่า/มีประกัน, เก็บเงินปลายทาง, หรือต้องตรวจบัตร
 */
export function requiresDeliveryReview(order: Order): boolean {
  return (
    isHighValueOrder(order) ||
    order.requiresIdCheck ||
    order.payment === 'cod' ||
    order.payment === 'transfer_on_delivery'
  );
}

/** แปลงหลักฐานปิดงานเป็นรายการอ่านง่าย (ใช้ทั้ง timeline และ UI ของ CS) */
export function describeProof(pod: ProofOfDelivery): string[] {
  const parts: string[] = [];
  if (pod.photoCount > 0) parts.push(`รูปถ่าย ${pod.photoCount} รูป`);
  if (pod.signatureCaptured) parts.push('ลายเซ็นผู้รับ');
  if (pod.otpVerified) parts.push('ยืนยัน OTP');
  if (pod.idVerified) parts.push('ตรวจบัตร ปชช.');
  if (pod.recipient?.name) parts.push(`ผู้รับ ${pod.recipient.name}`);
  if (pod.location) parts.push(pod.location.label ?? 'GPS ระบุตำแหน่ง');
  if (pod.cod?.collected) {
    const method = pod.cod.method === 'transfer' ? 'โอน' : 'เงินสด';
    const amount = pod.cod.amount != null ? ` ${formatTHB(pod.cod.amount)}` : '';
    parts.push(`รับเงิน ${method}${amount}`);
  }
  return parts;
}

/** ตัดคำนำหน้าที่ UI เคยเติมซ้ำกับประเภทจุด เช่น "ส่งส่ง — ..." */
export function getDispatchStopDisplayName(name: string) {
  return name.replace(/^\s*(?:รับ|ส่ง)\s*[—–-]\s*/u, '').trim() || name;
}

// ── การจัดลำดับงานเข้าคิวคนขับ (criteria-based priority) ──────────────────────
// ออเดอร์มูลค่าสูง/ต้องเช็คบัตร/ค้างนาน ควร "ขึ้นงานก่อน"
export const HIGH_VALUE_THRESHOLD = 500_000;
const PRIORITY_HIGH_VALUE = 100;
const PRIORITY_ID_CHECK = 40;
const PRIORITY_READY = 20;
const PRIORITY_MAX_AGE_HOURS = 48;

export function isHighValueOrder(order: Order): boolean {
  return order.totalValue >= HIGH_VALUE_THRESHOLD || order.insured;
}

/** ออเดอร์พร้อมจ่ายงานจริง (ไม่รอของเข้า) */
export function isDispatchReady(order: Order): boolean {
  return (order.dispatchReadiness ?? 'ready') === 'ready';
}

/** คะแนนความสำคัญ — สูง = ควรมอบหมายก่อน */
export function getOrderPriorityScore(order: Order, now: number = Date.now()): number {
  let score = 0;
  if (isHighValueOrder(order)) score += PRIORITY_HIGH_VALUE;
  if (order.requiresIdCheck) score += PRIORITY_ID_CHECK;
  if (isDispatchReady(order)) score += PRIORITY_READY;

  const ageHours = Math.max(0, (now - new Date(order.receivedAt).getTime()) / 3_600_000);
  score += Math.min(ageHours, PRIORITY_MAX_AGE_HOURS);

  return score;
}

/** เรียงคิว: priority สูงก่อน, เสมอกันใช้ FIFO (รับเข้าก่อนได้ก่อน) */
export function compareOrderPriority(a: Order, b: Order, now: number = Date.now()): number {
  const diff = getOrderPriorityScore(b, now) - getOrderPriorityScore(a, now);
  if (diff !== 0) return diff;
  return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
}

/** คนขับรับงานนี้ได้หรือไม่ (hard filter: ว่าง + งานยังไม่เต็ม + ใบรับรอง high-value) */
export function canDriverTakeOrder(order: Order, driver: Driver): boolean {
  if (driver.status === 'off_duty') return false;
  if (driver.activeOrders >= driver.capacity) return false;
  if (isHighValueOrder(order) && !driver.highValueCertified) return false;
  return true;
}

/** คะแนนความเหมาะสมของคนขับต่อออเดอร์ — สูง = เหมาะสุด */
export function scoreDriverForOrder(order: Order, driver: Driver): number {
  let score = driver.capacity - driver.activeOrders;
  if (isHighValueOrder(order) && driver.highValueCertified) score += 10;
  return score;
}

/** คนขับที่ระบบแนะนำสำหรับออเดอร์นี้ (ผ่าน hard filter แล้วเลือกคะแนนสูงสุด) */
export function recommendDriverForOrder(order: Order, drivers: Driver[]): Driver | undefined {
  return drivers
    .filter((driver) => canDriverTakeOrder(order, driver))
    .map((driver) => ({ driver, score: scoreDriverForOrder(order, driver) }))
    .sort((a, b) => b.score - a.score)[0]?.driver;
}

// ── วางแผน Auto-assign แบบ dry-run (ใช้ทั้ง preview และตอน commit) ───────────
export type AutoAssignProposal = {
  rank: number;
  order: Order;
  driverId: string | null;
  /** ภาพ snapshot ของคนขับ ณ จังหวะที่จ่ายงาน (หลังนับโหลดสะสมในรอบนี้) */
  driverLoadAfter?: { activeOrders: number; capacity: number };
  reasons: string[];
  /** เหตุผลที่จ่ายงานไม่ได้ (เมื่อ driverId เป็น null) */
  blockedReason?: string;
};

function explainDriverChoice(order: Order, driver: Driver): string[] {
  const reasons: string[] = [];
  reasons.push(`รับงานอยู่ ${driver.activeOrders} งาน`);
  if (isHighValueOrder(order) && driver.highValueCertified) {
    reasons.push('ผ่านอบรมขนส่งของมีค่า (high-value)');
  }
  return reasons;
}

function explainNoDriver(order: Order, drivers: Driver[]): string {
  const onDuty = drivers.filter((driver) => driver.status !== 'off_duty');
  if (onDuty.length === 0) return 'ไม่มีคนขับพร้อมงาน (ทุกคนหยุดงาน)';
  if (onDuty.every((driver) => driver.activeOrders >= driver.capacity)) {
    return 'คนขับทุกคนรับงานเต็มแล้ว';
  }
  if (isHighValueOrder(order)) {
    return 'ไม่มีคนขับที่ผ่านอบรมขนส่งของมีค่าและยังว่าง';
  }
  return 'ไม่มีคนขับที่เหมาะสม';
}

/**
 * วางแผนจ่ายงานอัตโนมัติแบบไม่แก้ state — เรียงงานตาม priority แล้วไล่จับคู่คนขับ
 * โดยนับโหลดสะสมในรอบเดียวกัน (คนขับที่เพิ่งรับงานจะ capacity ลดลงสำหรับงานถัดไป)
 */
export function planAutoAssignments(
  orders: Order[],
  drivers: Driver[],
  now: number = Date.now(),
): AutoAssignProposal[] {
  const queue = orders
    .filter((order) => order.status === 'ready' && !isUnreleasedPlannedOrder(order))
    .filter((order) => isDispatchReady(order))
    .sort((a, b) => compareOrderPriority(a, b, now));

  let working = drivers.map((driver) => ({ ...driver }));
  const proposals: AutoAssignProposal[] = [];

  queue.forEach((order, index) => {
    const rank = index + 1;
    const driver = recommendDriverForOrder(order, working);

    if (!driver) {
      proposals.push({
        rank,
        order,
        driverId: null,
        reasons: [],
        blockedReason: explainNoDriver(order, working),
      });
      return;
    }

    const reasons = explainDriverChoice(order, driver);
    const activeOrders = Math.min(driver.capacity, driver.activeOrders + 1);

    proposals.push({
      rank,
      order,
      driverId: driver.id,
      driverLoadAfter: { activeOrders, capacity: driver.capacity },
      reasons,
    });

    working = working.map((item) => (item.id === driver.id ? { ...item, activeOrders } : item));
  });

  return proposals;
}
