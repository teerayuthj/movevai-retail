export type OrderSource = 'line_text' | 'line_image' | 'line_excel' | 'internal_chat' | 'manual';
export type OrderStatus =
  | 'new'
  | 'parsing'
  | 'needs_review'
  | 'ready'
  | 'assigned'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'returning'
  | 'returned';

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

export type DispatchReadiness = 'ready' | 'awaiting_items';

export type DeliveryPlan = {
  plannedDate: string; // local date key in YYYY-MM-DD
  plannedDriverId?: string;
  releaseState: 'planned' | 'released';
  releasedAt?: string;
  note?: string;
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
  | 'shipping_method_changed'
  | 'order_confirmed'
  | 'driver_assigned'
  | 'driver_auto_assigned'
  | 'delivery_started'
  | 'delivery_completed'
  | 'postal_batch_exported'
  | 'postal_tracking_saved'
  | 'postal_handed_over'
  | 'order_cancelled'
  | 'delivery_failed'
  | 'return_started'
  | 'return_completed'
  | 'delivery_retried'
  | 'delivery_planned'
  | 'delivery_plan_updated'
  | 'delivery_plan_cleared'
  | 'delivery_plan_released';

export type OrderActivityActor =
  | { kind: 'system'; label: string }
  | { kind: 'operator'; handler: Handler };

export type OrderActivityChangeField =
  | 'customer.name'
  | 'customer.phone'
  | 'customer.address'
  | 'customer.idCard'
  | 'shippingMethod'
  | 'assignedDriverId'
  | 'postalBatch.trackingNumber'
  | 'status'
  | 'dispatchReadiness'
  | 'deliveryPlan.plannedDate'
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
  postalBatch?: PostalBatch;
  resolution?: OrderResolution; // บันทึกการยกเลิก/ส่งไม่สำเร็จ/ส่งกลับ
  activityLog?: OrderActivityEvent[]; // timeline กิจกรรมของออเดอร์ (newest last)
};

export type Driver = {
  id: string;
  name: string;
  phone: string;
  avatarKey: string;
  vehicle: 'motorcycle' | 'van' | 'pickup';
  zone: string;
  status: 'available' | 'on_delivery' | 'off_duty';
  activeOrders: number;
  capacity: number;
  rating: number;
  highValueCertified: boolean; // อบรมขนส่งของมีค่าแล้ว
};

export const drivers: Driver[] = [
  {
    id: 'D-01',
    name: 'สมชาย เกียรติวงศ์',
    phone: '081-234-5678',
    avatarKey: 'emerald',
    vehicle: 'motorcycle',
    zone: 'เยาวราช - สำเพ็ง',
    status: 'available',
    activeOrders: 0,
    capacity: 6,
    rating: 4.9,
    highValueCertified: true,
  },
  {
    id: 'D-02',
    name: 'ณัฐพล ธนะวิชัย',
    phone: '089-111-2233',
    avatarKey: 'sky',
    vehicle: 'van',
    zone: 'สีลม - สาทร',
    status: 'on_delivery',
    activeOrders: 4,
    capacity: 10,
    rating: 4.7,
    highValueCertified: true,
  },
  {
    id: 'D-03',
    name: 'อรทัย วงศ์ไทย',
    phone: '082-556-7788',
    avatarKey: 'rose',
    vehicle: 'motorcycle',
    zone: 'ทองหล่อ - เอกมัย',
    status: 'available',
    activeOrders: 1,
    capacity: 5,
    rating: 4.8,
    highValueCertified: true,
  },
  {
    id: 'D-04',
    name: 'ธนวัฒน์ ศรีสุข',
    phone: '086-445-6677',
    avatarKey: 'amber',
    vehicle: 'pickup',
    zone: 'บางนา - สมุทรปราการ',
    status: 'available',
    activeOrders: 2,
    capacity: 15,
    rating: 4.6,
    highValueCertified: false,
  },
  {
    id: 'D-05',
    name: 'ปวีณา จิตต์อนันต์',
    phone: '088-998-7766',
    avatarKey: 'violet',
    vehicle: 'motorcycle',
    zone: 'รัชดา - ลาดพร้าว',
    status: 'off_duty',
    activeOrders: 0,
    capacity: 6,
    rating: 4.9,
    highValueCertified: true,
  },
];

export const orders: Order[] = [
  {
    id: 'O-1042',
    code: '#AUS-1042',
    source: 'line_image',
    status: 'needs_review',
    receivedAt: '2026-04-24T09:12:00',
    lineContact: {
      displayName: 'Suwan Gold Admin 🪙',
      lineUserId: 'U-a1b2c3...d4e5',
      isOfficialContact: true,
    },
    handledBy: {
      name: 'ปาณิสรา วงศ์ประดิษฐ์',
      department: 'Customer Service',
      role: 'Senior CS',
    },
    confidence: 72,
    customer: {
      name: 'บจก. ห้างทองสุวรรณเจริญ (สาขาเยาวราช)',
      phone: '02-224-5566',
      address: '423 ถ.เยาวราช แขวงจักรวรรดิ เขตสัมพันธวงศ์ กทม. 10100',
      idCard: 'เลขนิติบุคคล 0105548xxxxx',
    },
    items: [
      {
        sku: 'AUS-BAR-965-1B',
        name: 'AUSIRIS ทองคำแท่ง 96.5%',
        purity: '96.5%',
        weight: '1 บาท (15.244 ก.)',
        qty: 5,
        unitPrice: 45200,
      },
      {
        sku: 'AUS-BAR-965-2B',
        name: 'AUSIRIS ทองคำแท่ง 96.5%',
        purity: '96.5%',
        weight: '2 บาท (30.488 ก.)',
        qty: 2,
        unitPrice: 90300,
        note: 'AI ไม่แน่ใจจำนวน — สลิปเขียนเลข 2 ชิ้น แต่รวมเงินเป็น 3 ชิ้น',
      },
    ],
    note: 'รับเงินปลายทาง โอนผ่าน SCB เท่านั้น · ส่งถึงมือผู้มีอำนาจลงนาม (คุณสุวรรณา จิรกิจเจริญ) เท่านั้น',
    rawText: undefined,
    rawPreview: 'https://images.unsplash.com/photo-1610375461369-d613b564f4c4?w=900&auto=format',
    totalValue: 406600,
    payment: 'transfer_on_delivery',
    requiresIdCheck: true,
    insured: true,
  },
  {
    id: 'O-1043',
    code: '#AUS-1043',
    source: 'line_text',
    status: 'ready',
    receivedAt: '2026-04-24T09:24:00',
    lineContact: {
      displayName: 'Pichaya T.',
      lineUserId: 'U-4f2a9e...b71c',
    },
    handledBy: {
      name: 'ปาณิสรา วงศ์ประดิษฐ์',
      department: 'Customer Service',
      role: 'Senior CS',
    },
    confidence: 95,
    customer: {
      name: 'คุณพิชญา ธรรมรักษ์',
      phone: '081-334-5566',
      address: 'คอนโด 98 Wireless ห้อง 2504 ถ.วิทยุ แขวงลุมพินี เขตปทุมวัน กทม. 10330',
      idCard: 'x-xxxx-xxxxx-45-2',
    },
    items: [
      {
        sku: 'AUS-INV-9999-10G',
        name: 'AUSIRIS ทองคำแท่ง 99.99% Investment Grade',
        purity: '99.99%',
        weight: '10 กรัม',
        qty: 3,
        unitPrice: 32500,
      },
      {
        sku: 'AUS-INV-9999-50G',
        name: 'AUSIRIS ทองคำแท่ง 99.99% Investment Grade',
        purity: '99.99%',
        weight: '50 กรัม',
        qty: 1,
        unitPrice: 161800,
      },
    ],
    note: 'ลูกค้าชำระครบแล้ว · นัดรับ lobby ชั้น G เวลา 14:00 น. · แสดงบัตร ปชช. ตรงกับชื่อผู้สั่ง',
    totalValue: 259300,
    payment: 'prepaid',
    requiresIdCheck: true,
    insured: true,
  },
  {
    id: 'O-1044',
    code: '#AUS-1044',
    source: 'line_excel',
    status: 'parsing',
    receivedAt: '2026-04-24T09:38:00',
    lineContact: {
      displayName: 'GoldDist. Procurement',
      lineUserId: 'U-9c8d7e...f1a2',
      isOfficialContact: true,
    },
    handledBy: {
      name: 'ธนพร กิจเจริญผล',
      department: 'สาขาสีลม',
      role: 'ผู้จัดการสาขา',
    },
    confidence: 0,
    customer: {
      name: 'บจก. โกลด์ดิสทริบิวชั่น (ประเทศไทย)',
      phone: '—',
      address: 'กำลังประมวลผลไฟล์ Excel (18 รายการ)',
    },
    items: [],
    totalValue: 0,
    payment: 'prepaid',
    requiresIdCheck: false,
    insured: false,
  },
  {
    id: 'O-1045',
    code: '#AUS-1045',
    source: 'line_text',
    status: 'new',
    receivedAt: '2026-04-24T09:51:00',
    lineContact: {
      displayName: 'ไทยรุ่งเรือง ทองหล่อ',
      lineUserId: 'U-2e4f6a...8b9c',
      isOfficialContact: true,
    },
    handledBy: {
      name: 'วัชรพล สิริพัฒน์',
      department: 'Customer Service',
    },
    confidence: 88,
    customer: {
      name: 'บจก. ห้างทองไทยรุ่งเรือง (สาขาทองหล่อ)',
      phone: '083-221-4488',
      address: '456 ซ.ทองหล่อ 5 แขวงคลองตันเหนือ เขตวัฒนา กทม. 10110',
      idCard: 'เลขนิติบุคคล 0105551xxxxx',
    },
    items: [
      {
        sku: 'AUS-SILVER-9999-1KG',
        name: 'AUSIRIS เงินแท่ง 99.99%',
        purity: '99.99%',
        weight: '1 กิโลกรัม',
        qty: 3,
        unitPrice: 31200,
      },
      {
        sku: 'AUS-SILVER-9999-100G',
        name: 'AUSIRIS เงินแท่ง 99.99%',
        purity: '99.99%',
        weight: '100 กรัม',
        qty: 10,
        unitPrice: 3280,
      },
    ],
    note: 'ลูกค้าประจำ · ส่งเข้าร้านเปิด 10:30 น. · รับเงินปลายทาง',
    totalValue: 126400,
    payment: 'cod',
    requiresIdCheck: false,
    insured: true,
  },
  {
    id: 'O-1046',
    code: '#AUS-1046',
    source: 'line_image',
    status: 'ready',
    receivedAt: '2026-04-24T10:02:00',
    lineContact: {
      displayName: 'Anna L.',
      lineUserId: 'U-7b8c9d...0a1b',
    },
    handledBy: {
      name: 'ธนพร กิจเจริญผล',
      department: 'สาขาสีลม',
      role: 'ผู้จัดการสาขา',
    },
    confidence: 91,
    customer: {
      name: 'คุณ Anna Laurent',
      phone: '094-778-1234',
      address: '99/123 คอนโด The Reserve ถ.สุขุมวิท 61 แขวงคลองตันเหนือ เขตวัฒนา กทม.',
      idCard: 'Passport Lxxxxxx21',
    },
    items: [
      {
        sku: 'AUS-JEW-965-2S-NECK',
        name: 'ทองรูปพรรณ 96.5% สร้อยคอลายโซ่',
        purity: '96.5%',
        weight: '2 สลึง (7.62 ก.)',
        qty: 1,
        unitPrice: 23100,
        note: 'ห่อกล่องของขวัญ พร้อมใบรับรองจากร้าน',
      },
    ],
    note: 'ของขวัญวันเกิด · ไม่ระบุราคาบนใบเสร็จในกล่อง · ลูกค้าขอส่งไปรษณีย์ EMS (ต่างจังหวัด)',
    totalValue: 23100,
    payment: 'prepaid',
    requiresIdCheck: true,
    insured: true,
    shippingMethod: 'thai_post',
  },
  {
    id: 'O-1039',
    code: '#AUS-1039',
    source: 'line_text',
    status: 'assigned',
    receivedAt: '2026-04-24T07:05:00',
    lineContact: {
      displayName: 'คุณศิริลักษณ์',
      lineUserId: 'U-6d7e8f...9a0b',
    },
    handledBy: {
      name: 'วัชรพล สิริพัฒน์',
      department: 'Customer Service',
    },
    confidence: 96,
    customer: {
      name: 'คุณศิริลักษณ์ พิพัฒน์กุล',
      phone: '084-223-9911',
      address: '88/14 ม.3 ต.สันผักหวาน อ.หางดง จ.เชียงใหม่ 50230',
      idCard: 'x-xxxx-xxxxx-88-1',
    },
    items: [
      {
        sku: 'AUS-JEW-965-2S-RING',
        name: 'ทองรูปพรรณ 96.5% แหวน',
        purity: '96.5%',
        weight: '2 สลึง (7.62 ก.)',
        qty: 1,
        unitPrice: 23100,
      },
    ],
    note: 'ลูกค้าเชียงใหม่ · ส่งไปรษณีย์ EMS ลงทะเบียน · รวมอยู่ใน BATCH-20260424-01',
    totalValue: 23100,
    payment: 'prepaid',
    requiresIdCheck: false,
    insured: true,
    shippingMethod: 'thai_post',
    postalBatch: {
      batchId: 'BATCH-20260424-01',
      service: 'ems',
      exportedAt: '2026-04-24T09:00:00',
    },
  },
  {
    id: 'O-1038',
    code: '#AUS-1038',
    source: 'line_image',
    status: 'in_transit',
    receivedAt: '2026-04-23T16:20:00',
    lineContact: {
      displayName: 'K.Pattarawadee',
      lineUserId: 'U-1c2d3e...4f5a',
    },
    handledBy: {
      name: 'ปาณิสรา วงศ์ประดิษฐ์',
      department: 'Customer Service',
      role: 'Senior CS',
    },
    confidence: 94,
    customer: {
      name: 'คุณภัทรวดี เจริญรุ่งเรือง',
      phone: '089-556-7712',
      address: '45/2 ถ.ศรีภูวนารถ ต.หาดใหญ่ อ.หาดใหญ่ จ.สงขลา 90110',
      idCard: 'x-xxxx-xxxxx-12-3',
    },
    items: [
      {
        sku: 'AUS-INV-9999-10G',
        name: 'AUSIRIS ทองคำแท่ง 99.99% Investment Grade',
        purity: '99.99%',
        weight: '10 กรัม',
        qty: 1,
        unitPrice: 32500,
      },
    ],
    note: 'ส่งไปรษณีย์ EMS ประกันภัย · ฝากแล้ว 23 เม.ย. 17:30 น.',
    totalValue: 32500,
    payment: 'prepaid',
    requiresIdCheck: false,
    insured: true,
    shippingMethod: 'thai_post',
    postalBatch: {
      batchId: 'BATCH-20260423-02',
      service: 'ems',
      exportedAt: '2026-04-23T16:45:00',
      trackingNumber: 'EX123456789TH',
      handedOverAt: '2026-04-23T17:30:00',
    },
  },
  {
    id: 'O-1041',
    code: '#AUS-1041',
    source: 'manual',
    status: 'in_transit',
    receivedAt: '2026-04-24T08:02:00',
    handledBy: {
      name: 'ณัฐรดา พงศ์ธนากุล',
      department: 'Wholesale Desk',
      role: 'Account Executive',
    },
    confidence: 100,
    customer: {
      name: 'บจก. สุวรรณภัณฑ์ เทรดดิ้ง (สาขาบางนา)',
      phone: '02-393-1122',
      address: '99 ถ.บางนา-ตราด กม.10 ต.บางแก้ว อ.บางพลี สมุทรปราการ 10540',
      idCard: 'เลขนิติบุคคล 0115540xxxxx',
    },
    items: [
      {
        sku: 'AUS-BAR-965-5B',
        name: 'AUSIRIS ทองคำแท่ง 96.5%',
        purity: '96.5%',
        weight: '5 บาท (76.22 ก.)',
        qty: 10,
        unitPrice: 225800,
      },
    ],
    note: 'ส่งของประจำเดือน · รับโดย หจก. ตามเอกสาร P/O #2604-015',
    totalValue: 2258000,
    payment: 'transfer_on_delivery',
    requiresIdCheck: true,
    insured: true,
    assignedDriverId: 'D-02',
  },
  {
    id: 'O-1040',
    code: '#AUS-1040',
    source: 'line_text',
    status: 'delivered',
    receivedAt: '2026-04-24T07:30:00',
    lineContact: {
      displayName: 'คุณวราภรณ์',
      lineUserId: 'U-3a4b5c...6d7e',
    },
    handledBy: {
      name: 'ณัฐรดา พงศ์ธนากุล',
      department: 'Wholesale Desk',
      role: 'Account Executive',
    },
    confidence: 97,
    customer: {
      name: 'คุณวราภรณ์ เจริญทรัพย์',
      phone: '086-554-2233',
      address: '12 ซ.รัชดา 32 แขวงจันทรเกษม เขตจตุจักร กทม. 10900',
    },
    items: [
      {
        sku: 'AUS-SILVER-9999-1KG',
        name: 'AUSIRIS เงินแท่ง 99.99%',
        purity: '99.99%',
        weight: '1 กิโลกรัม',
        qty: 2,
        unitPrice: 31200,
      },
    ],
    totalValue: 62400,
    payment: 'prepaid',
    requiresIdCheck: true,
    insured: true,
    assignedDriverId: 'D-02',
  },
];

export const weeklyVolume = [
  { day: 'จ.', orders: 42, delivered: 38 },
  { day: 'อ.', orders: 55, delivered: 52 },
  { day: 'พ.', orders: 48, delivered: 45 },
  { day: 'พฤ.', orders: 61, delivered: 58 },
  { day: 'ศ.', orders: 72, delivered: 67 },
  { day: 'ส.', orders: 35, delivered: 34 },
  { day: 'อา.', orders: 28, delivered: 27 },
];

export const sourceBreakdown = [
  { name: 'LINE (text)', value: 45, color: '#10b981' },
  { name: 'LINE (image/สลิป)', value: 28, color: '#3b82f6' },
  { name: 'LINE (excel)', value: 18, color: '#f59e0b' },
  { name: 'หน้าร้าน / Manual', value: 9, color: '#9ca3af' },
];

export const statusLabel: Record<OrderStatus, string> = {
  new: 'ใหม่',
  parsing: 'กำลังประมวลผล',
  needs_review: 'ต้องตรวจ',
  ready: 'พร้อมส่ง',
  assigned: 'มอบหมายแล้ว',
  in_transit: 'กำลังส่ง',
  delivered: 'ส่งสำเร็จ',
  failed: 'ส่งไม่สำเร็จ',
  cancelled: 'ยกเลิกแล้ว',
  returning: 'กำลังส่งกลับ',
  returned: 'รับคืนแล้ว',
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
