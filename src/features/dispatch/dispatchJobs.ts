import type { Order } from '@/data/orderTypes';
import type { CreateDispatchJobInput } from '@/features/dispatch/types';
import {
  createAppOrder,
  geocodeAddress,
  publishPlanningRoute,
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
        messengerTitle: input.messengerTitle?.trim() || undefined,
        pickup: {
          name: input.pickupName.trim(),
          phone: input.pickupPhone?.trim() || undefined,
          address: input.pickupAddress.trim(),
        },
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
  if (input.method !== 'planning' && !input.driver) {
    throw new Error('กรุณาเลือกคนขับก่อนมอบงาน');
  }
  if (input.method === 'scheduled' && !input.plannedTime) {
    throw new Error('กรุณาระบุเวลาออกก่อนมอบงานตามวัน–เวลา');
  }

  const destinations = [
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
    destinations.map((destination) => createAppOrder(buildDispatchOrder(input, destination))),
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

  if (input.method === 'scheduled') {
    const route = await publishPlanningRoute({
      orderIds,
      plannedDate: input.plannedDate,
      plannedTime: input.plannedTime,
      driverCode: input.driver!.id,
      note: input.note,
      requiresAcceptance: true,
      acceptWithinMinutes: input.acceptWithinMinutes,
      startWithinMinutes: input.startWithinMinutes,
      startPolicy: input.startPolicy,
    });
    return { orders: created, route };
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
