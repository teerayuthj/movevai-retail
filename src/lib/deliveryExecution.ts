import type { Driver, Order, ProofOfDelivery } from '@/data/mock';
import { formatTHB } from '@/data/mock';
import { getAssignedOrderOverdueMinutes, isUnreleasedPlannedOrder } from '@/lib/deliveryPlanning';

export type DriverQueueTab = 'ready' | 'assigned';
export type DeliveryTrackingTab =
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
  awaiting_acceptance: 'รอคนขับรับ',
  overdue: 'เลยกำหนด',
  in_transit: 'กำลังจัดส่ง',
  pending: 'รอยืนยัน',
  returning: 'ส่งกลับ',
  closed: 'ปิดงานแล้ว',
};

export function getDriverQueueTab(order: Order): DriverQueueTab | null {
  if (order.status === 'ready') return 'ready';
  if (order.status === 'assigned') return 'assigned';
  return null;
}

export function getDeliveryTrackingTab(order: Order): DeliveryTrackingTab | null {
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
  if (pod.location) parts.push(`GPS ${pod.location.label ?? 'ระบุตำแหน่ง'}`);
  if (pod.cod?.collected) {
    const method = pod.cod.method === 'transfer' ? 'โอน' : 'เงินสด';
    const amount = pod.cod.amount != null ? ` ${formatTHB(pod.cod.amount)}` : '';
    parts.push(`รับเงิน ${method}${amount}`);
  }
  return parts;
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

/** คนขับดูแลโซนที่ตรงกับที่อยู่ผู้รับหรือไม่ (heuristic จาก keyword ในโซน) */
export function driverMatchesZone(order: Order, driver: Driver): boolean {
  const address = order.customer.address?.toLowerCase() ?? '';
  if (!address) return false;

  return driver.zone
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length >= 2)
    .some((token) => address.includes(token));
}

/** คนขับรับงานนี้ได้หรือไม่ (hard filter: ว่าง + capacity เหลือ + ใบรับรอง high-value) */
export function canDriverTakeOrder(order: Order, driver: Driver): boolean {
  if (driver.status === 'off_duty') return false;
  if (driver.activeOrders >= driver.capacity) return false;
  if (isHighValueOrder(order) && !driver.highValueCertified) return false;
  return true;
}

/** คะแนนความเหมาะสมของคนขับต่อออเดอร์ — สูง = เหมาะสุด */
export function scoreDriverForOrder(order: Order, driver: Driver): number {
  let score = (driver.capacity - driver.activeOrders) * 2; // เหลือ capacity มากกว่า = กระจายงานสมดุล
  if (driverMatchesZone(order, driver)) score += 50; // อยู่โซนเดียวกับผู้รับ
  score += driver.rating;
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
  if (driverMatchesZone(order, driver)) {
    reasons.push(`อยู่โซน ${driver.zone} ตรงกับที่อยู่ผู้รับ`);
  }
  reasons.push(
    `ว่างอีก ${driver.capacity - driver.activeOrders} งาน (${driver.activeOrders}/${driver.capacity})`,
  );
  if (isHighValueOrder(order) && driver.highValueCertified) {
    reasons.push('ผ่านอบรมขนส่งของมีค่า (high-value)');
  }
  reasons.push(`เรตติ้ง ⭐ ${driver.rating}`);
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
