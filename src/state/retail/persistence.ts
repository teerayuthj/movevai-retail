import { drivers as initialDrivers } from '@/data/mock';
import type { RetailState } from '@/state/retail/types';

// v2 intentionally drops the old cache because v1 mixed demo orders with
// backend records. Keeping a separate key prevents stale mock workflow data
// from being restored after the dashboard switches to backend authority.
export const STORAGE_KEY = 'movevai-retail:v3';

const LOCAL_DRAFT_STATUSES = new Set(['new', 'parsing', 'needs_review', 'ready']);

export const defaultState: RetailState = {
  orders: [],
  drivers: initialDrivers,
  notifications: [],
};

export function loadState(): RetailState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw) as RetailState;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.drivers)) {
      return defaultState;
    }

    // notifications เพิ่มทีหลัง — cache เก่าอาจไม่มี field นี้
    return { ...parsed, notifications: parsed.notifications ?? [] };
  } catch {
    return defaultState;
  }
}

export function persistState(next: RetailState) {
  if (typeof window === 'undefined') return;
  try {
    // Workflow orders มาจาก backend และอาจมี activity/proof ขนาดใหญ่ จึง cache เฉพาะ draft
    // ที่ยังไม่ sync เพื่อให้ localStorage มีขนาดคงที่เมื่อจำนวน order ในระบบเพิ่มขึ้น
    const persisted: RetailState = {
      ...next,
      orders: next.orders.filter((order) => LOCAL_DRAFT_STATUSES.has(order.status)),
      // notifications เป็นข้อความล้วน (เล็ก) ต่างจาก orders — เก็บไว้เต็มเพื่อให้ outbox คงอยู่
      notifications: next.notifications,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // localStorage เต็ม (เช่น รูปหลักฐานปิดงานเยอะ) หรือถูกปิด — ข้ามการ persist
    // state ในหน่วยความจำยังทำงานปกติ ไม่ทำให้ commit ล้ม
  }
}
