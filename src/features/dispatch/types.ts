import type { Driver, Order } from '@/data/orderTypes';

export type DispatchJobType = 'order' | 'document' | 'parcel' | 'other';
export type DispatchMethod = 'immediate' | 'planning';
export type DispatchStartPolicy = 'manual' | 'accept_starts';

export type RouteTemplateStop = {
  id: string;
  name: string;
  phone?: string;
  address: string;
};

export type RouteTemplate = {
  id: string;
  name: string;
  active: boolean;
  autoCreate: boolean;
  weekdays: number[];
  plannedTime: string;
  defaultDriverId?: string;
  jobType: Exclude<DispatchJobType, 'order'>;
  acceptWithinMinutes: number;
  startWithinMinutes: number;
  startPolicy: DispatchStartPolicy;
  stops: RouteTemplateStop[];
  generatedDateKeys: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateDispatchJobInput = {
  mode: 'single' | 'template';
  title: string;
  jobType: Exclude<DispatchJobType, 'order'>;
  pickupName: string;
  pickupPhone?: string;
  pickupAddress: string;
  destinationName: string;
  destinationPhone?: string;
  destinationAddress: string;
  template?: RouteTemplate;
  method: DispatchMethod;
  driver?: Driver;
  plannedDate: string;
  plannedTime?: string;
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
