import { Capacitor } from '@capacitor/core';
import type { SubmitDeliveryInput } from '@/state/retail/types';

// running inside a Capacitor native shell (iOS/Android) — there is no vite/reverse proxy here
export const IS_NATIVE_APP = Capacitor.isNativePlatform();
const IS_ANDROID_APP = Capacitor.getPlatform() === 'android';

function normalizeApiBase(value: string | undefined, fallback: string) {
  const normalized = (value?.trim() || fallback).replace(/\/+$/, '');
  if (!IS_ANDROID_APP) return normalized;
  // Android Emulator resolves localhost to the emulator itself. 10.0.2.2 is the host Mac.
  return normalized.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, 'http://10.0.2.2');
}

export const MESSENGER_API_BASE = normalizeApiBase(
  import.meta.env.VITE_MESSENGER_API_BASE_URL as string | undefined,
  IS_NATIVE_APP ? 'http://localhost:4000/v1/rider' : '/api/messenger',
);
export const APP_API_BASE = normalizeApiBase(
  import.meta.env.VITE_APP_API_BASE_URL as string | undefined,
  IS_NATIVE_APP ? 'http://localhost:4000/v1/app' : '/api/app',
);

// vite proxy (dev) แนบ x-internal-key ให้ทุก /api/* request; ใน native ไม่มี proxy จึงต้องแนบเองจาก env.
// ⚠️ การฝัง internal key ลงแอปที่ ship จริงสกัดออกได้ — ใช้กับ build ภายใน/ทดสอบเท่านั้น
// production จริงควรให้ backend รับ rider Bearer token ตรงๆ โดยไม่ต้องใช้ internal key
export const INTERNAL_API_KEY = import.meta.env.VITE_INTERNAL_API_KEY as string | undefined;

// native app ไม่มี proxy: base ที่เป็น path ล้วน (/api/...) จะถูก resolve เป็น
// capacitor://localhost/api/... ซึ่งไม่มีเซิร์ฟเวอร์รองรับ → ต้องตั้ง absolute URL ตอน build
// (ดู .env.capacitor.example + `npm run cap:*`). เตือนแต่เนิ่นๆ แทนที่จะปล่อยให้ fetch fail เงียบๆ
if (IS_NATIVE_APP && (MESSENGER_API_BASE.startsWith('/') || APP_API_BASE.startsWith('/'))) {
  console.error(
    '[retailApi] กำลังรันใน native app แต่ API base ยังเป็น relative path. ' +
      'ตั้ง VITE_MESSENGER_API_BASE_URL / VITE_APP_API_BASE_URL เป็น absolute backend URL ตอน build ' +
      '(เช่นใน .env.capacitor) ไม่งั้น request จะยิงไปที่ capacitor://localhost แล้ว fail.',
  );
}

export const MESSENGER_TOKEN_KEY = 'movevai:messenger-token';
export const ROAD_ROUTE_TIMEOUT_MS = 7_000;
export const MESSENGER_AUTH_EXPIRED_EVENT = 'movevai:messenger-auth-expired';

export function proofPayload(input: SubmitDeliveryInput) {
  const { editorRole: _editorRole, recordedBy: _recordedBy, ...proof } = input;
  return proof;
}

export class MessengerAuthError extends Error {
  constructor(message = 'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่') {
    super(message);
    this.name = 'MessengerAuthError';
  }
}

export function isMessengerAuthError(error: unknown): error is MessengerAuthError {
  return error instanceof MessengerAuthError;
}

export function clearLocalMessengerSession(notify = false) {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.removeItem('movevai:messenger-code');
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MESSENGER_AUTH_EXPIRED_EVENT));
  }
}

export function assertNativeRequestUrl(url: string) {
  if (!IS_NATIVE_APP || !url.startsWith('/')) return;
  throw new Error(
    'ตั้งค่า API สำหรับ native ไม่ถูกต้อง: ต้องใช้ backend URL แบบเต็ม เช่น http://localhost:4000/v1/rider บน iOS หรือ http://10.0.2.2:4000/v1/rider บน Android',
  );
}

export function networkErrorMessage(url: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (IS_NATIVE_APP && /expected pattern/i.test(message)) {
    return 'URL ของ API ไม่ถูกต้องสำหรับ iOS native กรุณา build ใหม่ด้วย backend URL แบบเต็ม';
  }
  if (IS_NATIVE_APP && url.startsWith('http://localhost:4000')) {
    return `เชื่อมต่อ backend ที่ http://localhost:4000 ไม่ได้ — ตรวจว่า backend รันอยู่บนเครื่อง Mac แล้วลองใหม่ (${message})`;
  }
  if (IS_NATIVE_APP && url.startsWith('http://10.0.2.2:4000')) {
    return `เชื่อมต่อ backend ที่ http://10.0.2.2:4000 ไม่ได้ — ตรวจว่า backend รันอยู่บน Mac ที่ port 4000 แล้วลองใหม่ (${message})`;
  }
  return message;
}

function validationFieldSummary(details: unknown) {
  if (!details || typeof details !== 'object') return '';
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== 'object') return '';

  return Object.entries(fieldErrors)
    .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join(' · ');
}

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  assertNativeRequestUrl(url);
  const headers = new Headers(init?.headers);
  if (init?.body != null) headers.set('content-type', 'application/json');
  // native build: แนบ internal key เองแทน vite proxy (web/dev ปล่อยให้ proxy จัดการ)
  if (IS_NATIVE_APP && INTERNAL_API_KEY && !headers.has('x-internal-key')) {
    headers.set('x-internal-key', INTERNAL_API_KEY);
  }
  // ทดสอบเครื่องจริงผ่าน ngrok tunnel: free tier แทรกหน้า "you are about to visit"
  // เป็น HTML แทน JSON ถ้าไม่มี header นี้ — ไม่มีผลถ้า base ไม่ใช่ ngrok
  if (url.includes('ngrok-free.app') || url.includes('.ngrok.io')) {
    headers.set('ngrok-skip-browser-warning', 'true');
  }
  const isMessengerRequest = url.startsWith(MESSENGER_API_BASE);
  let messengerToken: string | null = null;
  if (isMessengerRequest) {
    messengerToken = localStorage.getItem(MESSENGER_TOKEN_KEY);
    if (messengerToken) headers.set('authorization', `Bearer ${messengerToken}`);
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    throw new Error(networkErrorMessage(url, error));
  }
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as {
        error?: { message?: string; details?: unknown };
      };
      message = body.error?.message ?? message;
      const fieldSummary = validationFieldSummary(body.error?.details);
      if (fieldSummary) message = `${message}: ${fieldSummary}`;
    } catch {
      // response ไม่ใช่ JSON
    }
    const messengerTokenExpired =
      isMessengerRequest &&
      messengerToken &&
      // backend ยังใช้ path /v1/rider — ข้อความ error ฝั่ง server ยังเป็น "rider token"
      (response.status === 401 || /invalid or expired rider token/i.test(message));
    if (messengerTokenExpired) {
      clearLocalMessengerSession(true);
      throw new MessengerAuthError(message);
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function withTimeout<T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('คำนวณระยะตามถนนใช้เวลานานเกินไป');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
