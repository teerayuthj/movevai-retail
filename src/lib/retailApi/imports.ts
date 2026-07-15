import type { Order, ShippingMethod } from '@/data/orderTypes';
import {
  APP_API_BASE,
  INTERNAL_API_KEY,
  IS_NATIVE_APP,
  assertNativeRequestUrl,
  networkErrorMessage,
  request,
} from './client';

export type ImportBatch = {
  id: string;
  source: string;
  sourceRef: string | null;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';
  totalRows: number;
  importedRows: number;
  errorRows: number;
  errorSummary: string | null;
  lineMessageId?: string | null;
  lineSenderUserId?: string | null;
  lineSenderDisplayName?: string | null;
  lineSenderPictureUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportBatchRow = {
  id: string;
  rowIndex: number;
  rawData: Record<string, string>;
  status: 'PENDING' | 'IMPORTED' | 'ERROR';
  errorMessage: string | null;
  orderId: string | null;
  fileName?: string;
  batchId?: string;
  hasSourceImage?: boolean;
  hasOcrText?: boolean;
};

export type ImportRejectReason = 'incomplete_data' | 'duplicate' | 'wrong_group' | 'other';

export type ImportModerationResult = { updated: number; skipped: number };

type ImportModerationInput = {
  orderIds: string[];
  shippingMethod?: ShippingMethod;
  reason?: ImportRejectReason;
  note?: string;
};

export type ImportOrderItemInput = {
  sku: string;
  name: string;
  purity: string;
  weight: string;
  qty: number;
  unitPrice: number;
  note?: string;
};

export type ImportOrderUpdateInput = {
  rawData?: Record<string, string>;
  customer: {
    name: string;
    phone: string;
    address: string;
    idCard?: string;
  };
  /** legacy single item — ใช้ items[] แทน */
  item?: ImportOrderItemInput;
  items?: ImportOrderItemInput[];
  totalValue: number;
  payment: Order['payment'];
  note?: string | null;
};

function importModeration(action: 'approve' | 'reject' | 'restore', input: ImportModerationInput) {
  return request<ImportModerationResult>(`${APP_API_BASE}/import-batches/orders/${action}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function approveImportOrders(orderIds: string[], shippingMethod?: ShippingMethod) {
  return importModeration('approve', { orderIds, shippingMethod });
}

export function rejectImportOrders(
  orderIds: string[],
  input?: { reason?: ImportRejectReason; note?: string },
) {
  return importModeration('reject', { orderIds, reason: input?.reason, note: input?.note });
}

export function restoreImportOrders(orderIds: string[]) {
  return importModeration('restore', { orderIds });
}

export function updateImportedOrder(orderId: string, input: ImportOrderUpdateInput) {
  return request<{ updated: true }>(
    `${APP_API_BASE}/import-batches/orders/${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

/** รวมหลาย draft orders เป็นออเดอร์เดียว — ตัวแรกใน orderIds เป็น target */
export function mergeImportOrders(orderIds: string[]) {
  return request<{ merged: true; targetOrderId: string; mergedOrderIds: string[] }>(
    `${APP_API_BASE}/import-batches/orders/merge`,
    { method: 'POST', body: JSON.stringify({ orderIds }) },
  );
}

/** แยก import rows ที่เลือกออกเป็น draft order ใหม่ (1 order ต่อ 1 แถว) */
export function splitImportOrderRows(orderId: string, rowIds: string[]) {
  return request<{ split: true; createdOrderIds: string[] }>(
    `${APP_API_BASE}/import-batches/orders/${encodeURIComponent(orderId)}/split-import-rows`,
    { method: 'POST', body: JSON.stringify({ rowIds }) },
  );
}

/** กลุ่ม "น่าจะรวมได้" ที่ backend เสนอ (เบอร์+ที่อยู่ตรงกัน, ไม่มี explicit orderNo) */
export type ImportGroupSuggestion = {
  key: string;
  orderIds: string[];
  rowIds: string[];
  rowIndexes: number[];
};

export type ImportBatchDetail = ImportBatch & {
  rows: ImportBatchRow[];
  groupSuggestions?: ImportGroupSuggestion[];
};

export type ImportEntryTab = 'review' | 'approved' | 'cancelled' | 'rejected' | 'all';

export type ImportEntryStats = {
  review: number;
  approved: number;
  cancelled: number;
  rejected: number;
  error: number;
  value: number;
  total: number;
  totalRows: number;
  batchCount: number;
};

export type ImportEntry = {
  batch: ImportBatch;
  rows: ImportBatchRow[];
  order: Order | null;
};

export async function fetchImportBatches(params?: {
  page?: number;
  limit?: number;
  status?: string;
  /** ย้อนหลังกี่วัน (default backend = 30); <= 0 = ทั้งหมด — ถูกข้ามถ้าส่ง from/to */
  days?: number;
  /** ช่วงวันที่กำหนดเอง (yyyy-MM-dd) — ถ้าส่งแล้ว days จะถูกข้าม */
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.status) search.set('status', params.status);
  if (params?.days != null) search.set('days', String(params.days));
  if (params?.from) search.set('from', params.from);
  if (params?.to) search.set('to', params.to);
  const qs = search.toString();
  return request<{
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
    batches: ImportBatch[];
  }>(`${APP_API_BASE}/import-batches${qs ? `?${qs}` : ''}`);
}

export async function fetchImportBatch(id: string) {
  return request<ImportBatchDetail>(`${APP_API_BASE}/import-batches/${encodeURIComponent(id)}`);
}

export async function fetchImportEntries(params: {
  page?: number;
  limit?: number;
  tab?: ImportEntryTab;
  q?: string;
  batchId?: string;
  days?: number;
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  if (params.tab) search.set('tab', params.tab);
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.batchId) search.set('batchId', params.batchId);
  if (params.days != null) search.set('days', String(params.days));
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  return request<{
    entries: ImportEntry[];
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    groupSuggestions: ImportGroupSuggestion[];
    stats: ImportEntryStats;
  }>(`${APP_API_BASE}/import-batches/entries?${search.toString()}`);
}

export async function fetchImportRowSource(rowId: string) {
  return request<{
    imageDataUrl: string | null;
    imageMimeType: string | null;
  }>(`${APP_API_BASE}/import-batches/row-source/${encodeURIComponent(rowId)}`);
}

function filenameFromContentDisposition(value: string | null) {
  const utf8Match = value?.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const asciiMatch = value?.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] ?? null;
}

export async function downloadImportBatchCsv(id: string) {
  const url = `${APP_API_BASE}/import-batches/${encodeURIComponent(id)}/raw-csv`;
  assertNativeRequestUrl(url);

  const headers = new Headers();
  if (IS_NATIVE_APP && INTERNAL_API_KEY) {
    headers.set('x-internal-key', INTERNAL_API_KEY);
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new Error(networkErrorMessage(url, error));
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return {
    fileName: filenameFromContentDisposition(response.headers.get('content-disposition')),
    content: await response.text(),
  };
}
