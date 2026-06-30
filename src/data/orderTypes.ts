// Domain types, label maps, and pure helpers for the retail order model.
// แยกออกจาก mock.ts เพื่อให้ surface ที่ไม่ใช่ mock (เช่น public customer tracking)
// import types/labels ได้โดยไม่ลาก mock seed data เข้า bundle ตัวเอง

export type OrderSource =
  | 'line_text'
  | 'line_image'
  | 'line_excel'
  | 'line_csv'
  | 'internal_chat'
  | 'manual';
export type OrderStatus =
  | 'new'
  | 'parsing'
  | 'needs_review'
  | 'ready'
  | 'assigned'
  | 'in_transit'
  | 'pending_confirmation' // messenger ส่งมอบแล้ว รอ CS ตรวจหลักฐานก่อนปิดจริง
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'returning'
  | 'returned'
  | 'rejected'; // กรองออกตอนตรวจ import — ดึงกลับเป็น new ได้

export type CancelReason =
  | 'customer_cancelled'
  | 'payment_failed'
  | 'out_of_stock'
  | 'wrong_info'
  | 'duplicate'
  | 'other';

export type FailReason =
  | 'customer_unavailable'
  | 'address_not_found'
  | 'address_wrong'
  | 'refused'
  | 'id_mismatch'
  | 'damaged'
  | 'lost'
  | 'other';

export type FailNextAction = 'retry' | 'return' | 'close';

export type OrderResolution = {
  type: 'cancelled' | 'failed' | 'returning' | 'returned';
  reason?: CancelReason | FailReason;
  note?: string;
  nextAction?: FailNextAction;
  recordedBy: Handler;
  recordedAt: string;
};

export type PaymentMethod = 'cod' | 'prepaid' | 'transfer_on_delivery';

export type ShippingMethod = 'internal_driver' | 'thai_post';

export type DispatchReadiness = 'ready' | 'awaiting_items' | 'on_hold';

/** เหตุผลยกเลิก/ดึงกลับงานในหน้า Planning จัดส่งล่วงหน้า (แยกจาก CancelReason ของการปิดออเดอร์) */
export type PlanningCancelReason =
  | 'items_incomplete'
  | 'production_delay'
  | 'customer_reschedule'
  | 'duplicate'
  | 'other';

export type DeliveryPlan = {
  plannedDate: string; // local date key in YYYY-MM-DD
  plannedTime?: string; // local time in HH:mm (24h)
  plannedDriverId?: string;
  releaseState: 'planned' | 'released';
  releasedAt?: string;
  note?: string;
};

export type DeliveryRoute = {
  id: string;
  code: string;
  plannedDate: string;
  plannedTime?: string;
  dispatchMode?: 'scheduled' | 'urgent';
  acceptBy?: string;
  status: 'published' | 'active' | 'completed';
  sequence: number;
  stopCount?: number;
  driverCode?: string;
  plannedDistanceMeters?: number;
  plannedGeometryJson?: { lat: number; lng: number }[];
  pushStatus: 'queued' | 'running' | 'succeeded' | 'failed';
  pushError?: string;
};

/** บันทึกการเก็บเงินปลายทางตอนปิดงาน */
export type CodCollection = {
  collected: boolean;
  method?: 'cash' | 'transfer';
  amount?: number;
  note?: string; // เลขสลิป/หมายเหตุ
};

/** หลักฐานการส่งมอบที่ messenger เก็บตอนปิดงาน (Proof of Delivery) */
export type ProofOfDelivery = {
  photoCount: number; // จำนวนรูปถ่าย ณ จุดส่ง
  photos?: string[]; // รูปถ่ายจริง (data URL ย่อขนาดแล้ว)
  signatureCaptured: boolean; // ได้ลายเซ็นผู้รับ
  signatureDataUrl?: string; // ภาพลายเซ็นจริง
  otpVerified: boolean; // ยืนยัน OTP กับเบอร์ลูกค้า
  idVerified?: boolean; // ตรวจบัตร ปชช. (เฉพาะ requiresIdCheck)
  location?: { lat: number; lng: number; label?: string }; // GPS ตอนปิดงาน
  cod?: CodCollection; // การรับเงิน (เฉพาะ COD)
  capturedByDriverId: string;
  capturedAt: string;
};

export type DeliveryProofEditorRole = 'messenger' | 'admin';

export type ProofOfDeliveryHistoryEntry = ProofOfDelivery & {
  replacedAt: string;
  replacedByRole: DeliveryProofEditorRole;
  replacedByName?: string;
  revisionNumber?: number;
};

export type PostalService = 'ems' | 'registered' | 'cod';

export type PostalBatch = {
  batchId: string; // "BATCH-20260424-01"
  service: PostalService;
  exportedAt: string;
  trackingNumber?: string; // เลข EMS/ลงทะเบียน ที่ได้หลังฝากไปรษณีย์
  handedOverAt?: string;
};

export type OrderItem = {
  sku: string;
  name: string;
  purity: string; // "96.5%" | "99.99%"
  weight: string; // "1 บาท", "2 สลึง", "10 g", "1 kg"
  qty: number;
  unitPrice: number;
  note?: string;
};

export type LineContact = {
  displayName: string;
  lineUserId: string; // masked (เช่น U-xxx-abc12)
  isOfficialContact?: boolean; // ลูกค้า B2B ที่ผูกบัญชี LINE OA ไว้แล้ว
};

export type Handler = {
  name: string;
  department: string; // Customer Service / Wholesale Desk / สาขาสีลม
  role?: string;
};

export type OrderActivityEventType =
  | 'order_received'
  | 'order_created_from_internal_chat'
  | 'parsing_completed'
  | 'customer_updated'
  | 'order_details_updated'
  | 'shipping_method_changed'
  | 'order_confirmed'
  | 'driver_assigned'
  | 'driver_auto_assigned'
  | 'delivery_started'
  | 'delivery_submitted'
  | 'delivery_proof_revised'
  | 'delivery_confirmed'
  | 'delivery_completed'
  | 'postal_batch_exported'
  | 'postal_tracking_saved'
  | 'postal_handed_over'
  | 'order_cancelled'
  | 'order_rejected'
  | 'order_restored'
  | 'delivery_failed'
  | 'return_started'
  | 'return_completed'
  | 'delivery_retried'
  | 'delivery_planned'
  | 'delivery_plan_updated'
  | 'delivery_plan_cleared'
  | 'delivery_plan_released'
  | 'delivery_route_cancelled'
  | 'delivery_route_reassigned'
  | 'delivery_urgent_route_published';

export type OrderActivityActor =
  | { kind: 'system'; label: string }
  | { kind: 'operator'; handler: Handler };

export type OrderActivityChangeField =
  | 'customer.name'
  | 'customer.phone'
  | 'customer.address'
  | 'customer.idCard'
  | 'shippingMethod'
  | 'items.qty'
  | 'assignedDriverId'
  | 'postalBatch.trackingNumber'
  | 'status'
  | 'dispatchReadiness'
  | 'deliveryPlan.plannedDate'
  | 'deliveryPlan.plannedTime'
  | 'deliveryPlan.plannedDriverId'
  | 'deliveryPlan.releaseState';

export type OrderActivityChange = {
  field: OrderActivityChangeField;
  label: string;
  before?: string;
  after?: string;
};

export type OrderActivityEvent = {
  id: string;
  type: OrderActivityEventType;
  at: string;
  actor: OrderActivityActor;
  summary: string;
  details?: string;
  changes?: OrderActivityChange[];
};

export type Order = {
  id: string;
  code: string;
  source: OrderSource;
  status: OrderStatus;
  receivedAt: string;
  lineContact?: LineContact; // ลูกค้าฝั่ง LINE OA (undefined เฉพาะ source=manual)
  handledBy: Handler; // พนักงาน Ausiris ที่รับเรื่อง
  confidence: number; // 0-100 — AI parse confidence
  customer: {
    name: string;
    phone: string;
    address: string;
    geo?: { lat: number; lng: number }; // พิกัดปลายทาง (geocode จาก address) — ใช้วาดหมุดบนแผนที่ messenger
    idCard?: string; // masked
  };
  items: OrderItem[];
  note?: string;
  rawText?: string;
  rawPreview?: string;
  totalValue: number;
  payment: PaymentMethod;
  dispatchReadiness?: DispatchReadiness;
  requiresIdCheck: boolean;
  insured: boolean;
  assignedDriverId?: string;
  shippingMethod?: ShippingMethod; // undefined = internal_driver (default)
  deliveryPlan?: DeliveryPlan;
  deliveryRoute?: DeliveryRoute;
  proofOfDelivery?: ProofOfDelivery; // หลักฐานปิดงานจาก messenger
  proofHistory?: ProofOfDeliveryHistoryEntry[]; // หลักฐานชุดเก่าที่ถูกแก้ไข เก็บไว้ตรวจสอบย้อนหลัง
  postalBatch?: PostalBatch;
  resolution?: OrderResolution; // บันทึกการยกเลิก/ส่งไม่สำเร็จ/ส่งกลับ
  activityLog?: OrderActivityEvent[]; // timeline กิจกรรมของออเดอร์ (newest last)
  metadataJson?: OrderMetadata; // ข้อมูลเสริมจาก backend (เช่น ต้นฉบับ CSV ที่นำเข้าจาก LINE)
};

// ต้นฉบับการนำเข้าจากไฟล์ CSV (LINE Group → webhook → backend) เก็บไว้บน order
// เพื่อให้ admin เทียบข้อมูลที่ map แล้วกับแถวดิบจากไฟล์ได้ทุกเมื่อ
export type OrderImportMeta = {
  batchId: string;
  fileName: string;
  source: string; // เช่น "LINE_GROUP"
  sourceRef?: string; // groupId ของ LINE
  rowIndex: number;
  importedAt: string;
  columns: Record<string, string>; // คอลัมน์ดิบจาก CSV (header → value)
};

export type OrderMetadata = {
  import?: OrderImportMeta;
  [key: string]: unknown;
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  avatarKey: string;
  vehicle: 'motorcycle' | 'van' | 'pickup';
  zone: string;
  status: 'available' | 'on_delivery' | 'off_duty';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  archivedAt?: string;
  activeOrders: number;
  capacity: number;
  rating: number;
  highValueCertified: boolean; // อบรมขนส่งของมีค่าแล้ว
  licensePlate?: string;
  idCardNumber?: string;
  idCardPhotoDataUrl?: string;
  profilePhotoDataUrl?: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedReason?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const statusLabel: Record<OrderStatus, string> = {
  new: 'ใหม่',
  parsing: 'กำลังประมวลผล',
  needs_review: 'ต้องตรวจ',
  ready: 'พร้อมส่ง',
  assigned: 'มอบหมายแล้ว',
  in_transit: 'กำลังส่ง',
  pending_confirmation: 'รอตรวจสอบ',
  delivered: 'ส่งสำเร็จ',
  failed: 'ส่งไม่สำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
  returning: 'กำลังส่งกลับ',
  returned: 'รับคืนแล้ว',
  rejected: 'ปฏิเสธแล้ว',
};

export const cancelReasonLabel: Record<CancelReason, string> = {
  customer_cancelled: 'ลูกค้ายกเลิก',
  payment_failed: 'ชำระเงินไม่ผ่าน',
  out_of_stock: 'สินค้าไม่พร้อม',
  wrong_info: 'ข้อมูลผิด/ต้องสร้างใหม่',
  duplicate: 'ออเดอร์ซ้ำ',
  other: 'อื่น ๆ',
};

export const failReasonLabel: Record<FailReason, string> = {
  customer_unavailable: 'ติดต่อผู้รับไม่ได้',
  address_not_found: 'หาที่อยู่ไม่เจอ',
  address_wrong: 'ที่อยู่ผิด',
  refused: 'ผู้รับปฏิเสธ',
  id_mismatch: 'บัตร/ชื่อไม่ตรง',
  damaged: 'พัสดุเสียหาย',
  lost: 'พัสดุสูญหาย',
  other: 'อื่น ๆ',
};

export const failNextActionLabel: Record<FailNextAction, string> = {
  retry: 'นัดส่งใหม่',
  return: 'ส่งกลับสาขา',
  close: 'ปิดเป็นส่งไม่สำเร็จ',
};

export const sourceLabel: Record<OrderSource, string> = {
  line_text: 'LINE Text',
  line_image: 'LINE Image',
  line_excel: 'LINE Excel',
  line_csv: 'LINE CSV',
  internal_chat: 'Internal Chat',
  manual: 'Manual',
};

export const paymentLabel: Record<PaymentMethod, string> = {
  cod: 'เก็บเงินปลายทาง',
  prepaid: 'ชำระแล้ว',
  transfer_on_delivery: 'โอนเมื่อรับของ',
};

export const dispatchReadinessLabel: Record<DispatchReadiness, string> = {
  ready: 'พร้อมปล่อยงาน',
  awaiting_items: 'รอสินค้ามาครบ',
  on_hold: 'พักงานไว้ก่อน',
};

export const planningCancelReasonLabel: Record<PlanningCancelReason, string> = {
  items_incomplete: 'สินค้าไม่ครบ',
  production_delay: 'ผลิตไม่ทัน',
  customer_reschedule: 'ลูกค้าเลื่อนนัด',
  duplicate: 'งานซ้ำ',
  other: 'อื่นๆ',
};

export const shippingMethodLabel: Record<ShippingMethod, string> = {
  internal_driver: 'คนขับภายใน',
  thai_post: 'ไปรษณีย์ไทย',
};

export const postalServiceLabel: Record<PostalService, string> = {
  ems: 'EMS',
  registered: 'ลงทะเบียน',
  cod: 'EMS เก็บเงินปลายทาง',
};

export function formatTHB(n: number): string {
  return n.toLocaleString('th-TH', {
    style: 'currency',
    currency: 'THB',
    maximumFractionDigits: 0,
  });
}
