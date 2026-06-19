export type TransformResult = {
  requestId: string;
  alias: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  fileName: string;
  csvContent: string;
  rowCount: number;
  latencyMs: number;
};

export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
};

export type ChatIntakeError = {
  title: string;
  message: string;
  suggestions: string[];
  meta: string[];
};

export const MAX_CLIENT_FILE_BYTES = 5 * 1024 * 1024;

export function isSupportedSpreadsheet(file: File) {
  return /\.(csv|xls|xlsx)$/i.test(file.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function createChatIntakeError(
  title: string,
  message: string,
  suggestions: string[] = [],
  meta: string[] = [],
): ChatIntakeError {
  return { title, message, suggestions, meta };
}

export function parseJsonSafely(input: string) {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return null;
  }
}

export function parseApiError(payload: unknown): ChatIntakeError {
  const error = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const details = isRecord(error.details) ? error.details : {};
  const reason = typeof details.reason === 'string' ? details.reason : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const message =
    typeof error.message === 'string' && error.message.trim().length > 0
      ? error.message
      : 'แปลงไฟล์ไม่สำเร็จ';
  const suggestions = Array.isArray(details.suggestions)
    ? details.suggestions.filter(
        (item): item is string => typeof item === 'string' && item.length > 0,
      )
    : [];
  const meta: string[] = [];

  if (typeof details.fileName === 'string' && details.fileName.trim().length > 0) {
    meta.push(`ไฟล์: ${details.fileName}`);
  }

  if (typeof details.actual === 'number' && typeof details.limit === 'number') {
    const unit =
      details.unit === 'rows'
        ? 'แถว'
        : details.unit === 'chars'
          ? 'ตัวอักษร'
          : details.unit === 'mb'
            ? 'MB'
            : details.unit === 'bytes'
              ? 'bytes'
              : '';
    if (unit) {
      meta.push(
        `ค่าปัจจุบัน ${details.actual.toLocaleString()} / จำกัด ${details.limit.toLocaleString()} ${unit}`,
      );
    }
  }

  if (typeof error.requestId === 'string' && error.requestId.trim().length > 0) {
    meta.push(`Request ID: ${error.requestId}`);
  }

  let title = 'แปลงไฟล์ไม่สำเร็จ';
  if (reason === 'too_many_rows') title = 'จำนวนแถวเกินกำหนด';
  else if (reason === 'file_too_large') title = 'ไฟล์ใหญ่เกินกำหนด';
  else if (reason === 'csv_text_too_large') title = 'ข้อมูลในไฟล์ยาวเกินกำหนด';
  else if (reason === 'unsupported_file_type') title = 'ชนิดไฟล์ไม่รองรับ';
  else if (reason === 'missing_header_or_rows') title = 'รูปแบบไฟล์ไม่ครบ';
  else if (reason === 'missing_sheet') title = 'ไม่พบชีตในไฟล์ Excel';
  else if (reason === 'ai_timeout') title = 'ประมวลผลนานเกินกำหนด';
  else if (reason === 'ai_rate_limit') title = 'เกินวงเงินการประมวลผลชั่วคราว';
  else if (reason === 'invalid_ai_json' || reason === 'invalid_ai_payload_shape')
    title = 'AI ส่งผลลัพธ์ไม่สมบูรณ์';
  else if (reason === 'ai_row_count_mismatch') title = 'จำนวนแถวผลลัพธ์ไม่ตรงกับต้นทาง';
  else if (code === 'VALIDATION_ERROR') title = 'ข้อมูลไฟล์ไม่ผ่านเงื่อนไข';

  return createChatIntakeError(
    title,
    message,
    suggestions.length > 0 ? suggestions : ['ตรวจสอบไฟล์แล้วลองใหม่อีกครั้ง'],
    meta,
  );
}

export function downloadCsv(fileName: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function encodeFileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

/**
 * ส่งไฟล์ไป backend AI alias `test_chat` เพื่อแปลงเป็น CSV ใหม่
 * - คืน TransformResult เมื่อสำเร็จ
 * - โยน ChatIntakeError เมื่อ backend ตอบ error / payload ไม่ครบ / เชื่อมต่อไม่ได้
 */
export async function requestCsvTransform(
  file: File,
  instructions: string,
): Promise<TransformResult> {
  let response: Response;
  try {
    const fileBase64 = await encodeFileAsBase64(file);
    response = await fetch('/api/ai/chat-intake/csv-transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alias: 'test_chat',
        fileName: file.name,
        fileBase64,
        mimeType: file.type || undefined,
        instructions: instructions.trim() || undefined,
      }),
    });
  } catch (caught) {
    throw createChatIntakeError(
      'เชื่อมต่อระบบไม่สำเร็จ',
      caught instanceof Error ? caught.message : 'ไม่สามารถเชื่อมต่อ backend ได้ในขณะนี้',
      ['ตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง'],
    );
  }

  const payloadText = await response.text();
  const payload = parseJsonSafely(payloadText);

  if (!response.ok) {
    throw parseApiError(payload);
  }
  if (!payload || typeof payload !== 'object') {
    throw createChatIntakeError(
      'ผลลัพธ์ไม่ถูกต้อง',
      'ระบบได้รับคำตอบกลับมาไม่ครบ จึงยังสร้างไฟล์ให้ไม่ได้',
      ['ลองส่งไฟล์เดิมอีกครั้ง'],
    );
  }

  return payload as TransformResult;
}
