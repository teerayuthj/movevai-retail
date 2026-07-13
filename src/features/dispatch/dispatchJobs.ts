import type { Driver, Order } from '@/data/orderTypes';
import type { CreateDispatchJobInput, RouteTemplate } from '@/features/dispatch/types';
import { getTodayDateKey } from '@/lib/deliveryPlanning';
import {
  createAppOrder,
  geocodeAddress,
  publishUrgentPlanningRoute,
  savePlanning,
} from '@/lib/retailApi';

function newClientId(prefix: string) {
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function buildDispatchOrder(
  input: CreateDispatchJobInput,
  destination: { name: string; phone?: string; address: string },
  routeRunKey?: string,
): Order {
  const id = newClientId('dispatch');
  const now = new Date().toISOString();
  return {
    id,
    orderNo: null,
    code: id,
    source: 'manual',
    status: 'ready',
    receivedAt: now,
    handledBy: { name: 'Admin', department: 'Dispatch' },
    confidence: 100,
    customer: {
      name: destination.name.trim() || input.title.trim(),
      phone: destination.phone?.trim() || '-',
      address: destination.address.trim(),
    },
    items: [
      {
        sku: '-',
        name: input.title.trim() || 'งานรับ–ส่ง',
        purity: '-',
        weight: '-',
        qty: 1,
        unitPrice: 0,
      },
    ],
    note: input.note?.trim() || undefined,
    totalValue: 0,
    payment: 'prepaid',
    dispatchReadiness: 'ready',
    requiresIdCheck: false,
    insured: false,
    shippingMethod: 'internal_driver',
    metadataJson: {
      dispatch: {
        jobType: input.jobType,
        createdVia: input.mode === 'template' ? 'route_template' : 'quick_create',
        title: input.title.trim(),
        pickup: {
          name: input.pickupName.trim(),
          phone: input.pickupPhone?.trim() || undefined,
          address: input.pickupAddress.trim(),
        },
        routeTemplateId: input.template?.id,
        routeTemplateName: input.template?.name,
        routeRunKey,
        sla: {
          requiresAcceptance: true,
          acceptWithinMinutes: input.acceptWithinMinutes,
          startWithinMinutes: input.startWithinMinutes,
          startPolicy: input.startPolicy,
        },
      },
    },
  };
}

export async function createDispatchJobs(input: CreateDispatchJobInput) {
  if (input.method === 'immediate' && !input.driver) {
    throw new Error('กรุณาเลือกคนขับสำหรับงานส่งทันที');
  }

  const routeRunKey = input.template
    ? `${input.template.id}:${input.plannedDate}:${Date.now()}`
    : undefined;
  const destinations = input.template
    ? input.template.stops
    : [
        {
          name: input.destinationName,
          phone: input.destinationPhone,
          address: input.destinationAddress,
        },
      ];

  if (destinations.length === 0 || destinations.some((stop) => !stop.address.trim())) {
    throw new Error('กรุณาระบุจุดส่งอย่างน้อย 1 จุด');
  }

  const created = await Promise.all(
    destinations.map((destination) =>
      createAppOrder(buildDispatchOrder(input, destination, routeRunKey)),
    ),
  );
  const orderIds = created.map((order) => order.id);

  if (input.method === 'planning') {
    await savePlanning({
      orderIds,
      plannedDate: input.plannedDate,
      plannedTime: input.plannedTime,
      driverCode: input.driver?.id,
      dispatchReadiness: 'ready',
      note: input.note,
    });
    return { orders: created, route: null };
  }

  const pickupGeo = input.pickupAddress.trim()
    ? await geocodeAddress(input.pickupAddress.trim()).catch(() => null)
    : null;
  const route = await publishUrgentPlanningRoute({
    orderId: orderIds.length === 1 ? orderIds[0] : undefined,
    orderIds: orderIds.length > 1 ? orderIds : undefined,
    driverCode: input.driver!.id,
    note: input.note,
    origin: pickupGeo ?? undefined,
    acceptWithinMinutes: input.acceptWithinMinutes,
    startWithinMinutes: input.startWithinMinutes,
    startPolicy: input.startPolicy,
  });
  return { orders: created, route };
}

export async function createTemplateRun(template: RouteTemplate, driver?: Driver) {
  const plannedDate = getTodayDateKey();
  return createDispatchJobs({
    mode: 'template',
    title: template.name,
    jobType: template.jobType,
    pickupName: template.stops[0]?.name ?? template.name,
    pickupPhone: template.stops[0]?.phone,
    pickupAddress: template.stops[0]?.address ?? '',
    destinationName: '',
    destinationAddress: '',
    template,
    method: 'planning',
    driver,
    plannedDate,
    plannedTime: template.plannedTime,
    acceptWithinMinutes: template.acceptWithinMinutes,
    startWithinMinutes: template.startWithinMinutes,
    startPolicy: template.startPolicy,
    note: `สร้างจาก Route Template: ${template.name}`,
  });
}
