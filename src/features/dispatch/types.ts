import type { Driver, Order } from '@/data/orderTypes';

export type DispatchJobType = 'order' | 'document' | 'parcel' | 'other';
/** immediate = ส่งตอนนี้, scheduled = มอบงานตามวัน–เวลา, planning = เก็บไว้จัดรอบภายหลัง */
export type DispatchMethod = 'immediate' | 'scheduled' | 'planning';
export type DispatchStartPolicy = 'manual' | 'accept_starts';

export type RouteStopKind = 'pickup' | 'dropoff';

// จุดแวะ 1 จุดในสาย — จุดรับต้องผูก deliverToStopId ว่าของไปลงจุดส่งไหน (ต้องอยู่ลำดับหลัง)
export type RouteStop = {
  id: string;
  kind: RouteStopKind;
  name: string;
  contact?: string;
  phone?: string;
  address: string;
  lat?: number;
  lng?: number;
  deliverToStopId?: string;
};

export type RouteRunDispatchMode = 'planning' | 'scheduled' | 'immediate';

export type DispatchCreationOutcome = {
  destination: 'planning' | 'tracking';
  orderIds: string[];
  plannedDate?: string;
};

// 1 template = 1 สายวิ่ง: ลำดับจุดแวะอิสระ ไม่มีจุดเริ่มต้น (messenger เริ่มจากที่ที่ตัวเองอยู่)
export type RouteTemplate = {
  id: string;
  routeGroup: string;
  name: string;
  stops: RouteStop[];
  active: boolean;
  weekdays: number[];
  /** เวลาวิ่งประจำ; เว้นว่างได้สำหรับ Route ที่ไม่มีเวลา fix */
  plannedTime?: string;
  defaultDriverId?: string;
  jobType: Exclude<DispatchJobType, 'order'>;
  acceptWithinMinutes: number;
  startWithinMinutes: number;
  startPolicy: DispatchStartPolicy;
  createdAt: string;
  updatedAt: string;
};

export type CreateDispatchJobInput = {
  mode: 'single' | 'template';
  title: string;
  messengerTitle?: string;
  jobType: Exclude<DispatchJobType, 'order'>;
  pickupName: string;
  pickupPhone?: string;
  pickupAddress: string;
  destinationName: string;
  destinationPhone?: string;
  destinationAddress: string;
  method: DispatchMethod;
  driver?: Driver;
  plannedDate: string;
  plannedTime?: string;
  appointmentDate: string;
  appointmentTime: string;
  acceptWithinMinutes: number;
  startWithinMinutes: number;
  startPolicy: DispatchStartPolicy;
  note?: string;
};

export const dispatchJobTypeLabel: Record<DispatchJobType, string> = {
  order: 'คำสั่งซื้อ',
  document: 'เอกสาร',
  parcel: 'พัสดุ',
  other: 'งานอื่น ๆ',
};

export function getDispatchJobType(order: Order): DispatchJobType {
  return order.metadataJson?.dispatch?.jobType ?? 'order';
}

export function getDispatchJobTitle(order: Order) {
  return (
    order.metadataJson?.dispatch?.title ||
    order.metadataJson?.dispatch?.routeTemplateName ||
    order.customer.name ||
    order.orderNo ||
    order.code
  );
}

export function getPickup(order: Order) {
  return order.metadataJson?.dispatch?.pickup;
}
