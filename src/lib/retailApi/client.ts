import { Capacitor } from '@capacitor/core';
import type { SubmitDeliveryInput } from '@/state/retail/types';
import {
  loadMessengerRefreshSession,
  removeMessengerRefreshSession,
  storeMessengerRefreshSession,
} from './messengerSessionStorage';

// running inside a Capacitor native shell (iOS/Android) — there is no vite/reverse proxy here
export const IS_NATIVE_APP = Capacitor.isNativePlatform();
const IS_ANDROID_APP = Capacitor.getPlatform() === 'android';
const CAPACITOR_BUILD_API_BASE = __MOVEVAI_CAP_API_BASE__.trim().replace(/\/+$/, '');

function normalizeApiBase(value: string | undefined, fallback: string) {
  const normalized = (value?.trim() || fallback).replace(/\/+$/, '');
  if (!IS_ANDROID_APP) return normalized;
  // Android Emulator resolves localhost to the emulator itself. 10.0.2.2 is the host Mac.
  return normalized.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, 'http://10.0.2.2');
}

export const MESSENGER_API_BASE = normalizeApiBase(
  CAPACITOR_BUILD_API_BASE
    ? `${CAPACITOR_BUILD_API_BASE}/v1/rider`
    : (import.meta.env.VITE_MESSENGER_API_BASE_URL as string | undefined),
  IS_NATIVE_APP ? 'http://localhost:4000/v1/rider' : '/api/messenger',
);
export const APP_API_BASE = normalizeApiBase(
  CAPACITOR_BUILD_API_BASE
    ? `${CAPACITOR_BUILD_API_BASE}/v1/app`
    : (import.meta.env.VITE_APP_API_BASE_URL as string | undefined),
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
export const APP_TOKEN_KEY = 'movevai:app-token';
export const ROAD_ROUTE_TIMEOUT_MS = 7_000;
export const MESSENGER_AUTH_EXPIRED_EVENT = 'movevai:messenger-auth-expired';
export const APP_AUTH_EXPIRED_EVENT = 'movevai:app-auth-expired';

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

export class RetailApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'RetailApiError';
  }
}

export function isRetailApiError(error: unknown): error is RetailApiError {
  return error instanceof RetailApiError;
}

export function clearLocalMessengerSession(notify = false) {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.removeItem('movevai:messenger-code');
  void removeMessengerRefreshSession().catch(() => undefined);
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MESSENGER_AUTH_EXPIRED_EVENT));
  }
}

export async function clearMessengerSession(notify = false) {
  localStorage.removeItem(MESSENGER_TOKEN_KEY);
  localStorage.removeItem('movevai:messenger-code');
  await removeMessengerRefreshSession().catch(() => undefined);
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MESSENGER_AUTH_EXPIRED_EVENT));
  }
}

export function clearLocalAppSession(notify = false) {
  localStorage.removeItem(APP_TOKEN_KEY);
  if (notify && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APP_AUTH_EXPIRED_EVENT));
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
  if (
    IS_NATIVE_APP &&
    /^(load failed|failed to fetch|network request failed)$/i.test(message.trim())
  ) {
    let apiOrigin = url;
    try {
      apiOrigin = new URL(url).origin;
    } catch {
      // assertNativeRequestUrl() ตรวจ URL relative ก่อนเรียก fetch แล้ว; fallback เก็บไว้เพื่อไม่ให้
      // ข้อความ error เองกลายเป็นสาเหตุให้ request ล้มเหลวอีกชั้น
    }
    return `เชื่อมต่อ backend ไม่ได้ (${apiOrigin}) — ตรวจว่า backend หรือ tunnel ยังทำงาน แล้วลองใหม่`;
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

  return (
    Object.entries(fieldErrors)
      .filter(([, messages]) => Array.isArray(messages) && messages.length > 0)
      // array validation อาจคืนข้อความเดิมซ้ำหนึ่งครั้งต่อ item; แสดงเพียงครั้งเดียว
      // เพื่อไม่ให้ toast บังทั้งหน้าจอเหมือน payload GPS หลายจุดล้มพร้อมกัน
      .map(([field, messages]) => `${field}: ${[...new Set(messages)].join(', ')}`)
      .join(' · ')
  );
}

type MessengerRefreshResult = {
  token: string;
  refreshToken: string;
  refreshExpiresAt: string;
  rider: { id: string; code: string; name: string; phone: string };
};

let messengerRefreshPromise: Promise<MessengerRefreshResult> | null = null;

async function responseError(response: Response) {
  let message = `${response.status} ${response.statusText}`;
  let code: string | undefined;
  let details: unknown;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    message = body.error?.message ?? message;
    code = body.error?.code;
    details = body.error?.details;
    const fieldSummary = validationFieldSummary(details);
    if (fieldSummary) message = `${message}: ${fieldSummary}`;
  } catch {
    // response ไม่ใช่ JSON
  }
  return { message, code, details };
}

async function performMessengerRefresh(): Promise<MessengerRefreshResult> {
  const stored = await loadMessengerRefreshSession();
  if (!stored) {
    await clearMessengerSession();
    throw new MessengerAuthError('ไม่พบ Session ของเครื่อง กรุณาเข้าสู่ระบบใหม่');
  }
  const url = `${MESSENGER_API_BASE}/auth/refresh`;
  assertNativeRequestUrl(url);
  const headers = new Headers({ 'content-type': 'application/json' });
  if (IS_NATIVE_APP && INTERNAL_API_KEY) headers.set('x-internal-key', INTERNAL_API_KEY);
  if (url.includes('ngrok-free.app') || url.includes('.ngrok.io')) {
    headers.set('ngrok-skip-browser-warning', 'true');
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(stored),
    });
  } catch (error) {
    throw new Error(networkErrorMessage(url, error));
  }
  if (!response.ok) {
    const { message } = await responseError(response);
    if (response.status === 401) {
      await clearMessengerSession(true);
      throw new MessengerAuthError(message);
    }
    throw new Error(message);
  }
  const result = (await response.json()) as MessengerRefreshResult;
  // Backend หมุน refresh token แล้ว จึงต้องบันทึกตัวใหม่ก่อนเผย access token ให้ request อื่นใช้
  await storeMessengerRefreshSession({
    refreshToken: result.refreshToken,
    deviceId: stored.deviceId,
  });
  localStorage.setItem(MESSENGER_TOKEN_KEY, result.token);
  localStorage.setItem('movevai:messenger-code', result.rider.code);
  return result;
}

export function refreshMessengerSession() {
  messengerRefreshPromise ??= performMessengerRefresh().finally(() => {
    messengerRefreshPromise = null;
  });
  return messengerRefreshPromise;
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
  const isAppRequest = url.startsWith(APP_API_BASE);
  let messengerToken: string | null = null;
  if (isMessengerRequest) {
    messengerToken = localStorage.getItem(MESSENGER_TOKEN_KEY);
    if (messengerToken) headers.set('authorization', `Bearer ${messengerToken}`);
  }
  const appToken = isAppRequest ? localStorage.getItem(APP_TOKEN_KEY) : null;
  if (appToken && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${appToken}`);
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (error) {
    throw new Error(networkErrorMessage(url, error));
  }
  const mayRefreshMessenger =
    isMessengerRequest &&
    Boolean(messengerToken) &&
    response.status === 401 &&
    !url.endsWith('/auth/login') &&
    !url.endsWith('/auth/refresh');
  if (mayRefreshMessenger) {
    await refreshMessengerSession();
    const renewedToken = localStorage.getItem(MESSENGER_TOKEN_KEY);
    if (renewedToken) headers.set('authorization', `Bearer ${renewedToken}`);
    try {
      response = await fetch(url, { ...init, headers });
    } catch (error) {
      throw new Error(networkErrorMessage(url, error));
    }
  }
  if (!response.ok) {
    const apiError = await responseError(response);
    const { message } = apiError;
    const messengerTokenExpired =
      isMessengerRequest &&
      messengerToken &&
      // backend ยังใช้ path /v1/rider — ข้อความ error ฝั่ง server ยังเป็น "rider token"
      (response.status === 401 || /invalid or expired rider token/i.test(message));
    if (messengerTokenExpired) {
      clearLocalMessengerSession(true);
      throw new MessengerAuthError(message);
    }
    if (isAppRequest && appToken && response.status === 401) {
      clearLocalAppSession(true);
    }
    throw new RetailApiError(message, apiError.code, apiError.details);
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
