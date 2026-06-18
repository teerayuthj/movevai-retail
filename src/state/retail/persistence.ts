import { drivers as initialDrivers } from '@/data/mock';
import type { RetailState } from '@/state/retail/types';

// v2 intentionally drops the old cache because v1 mixed demo orders with
// backend records. Keeping a separate key prevents stale mock workflow data
// from being restored after the dashboard switches to backend authority.
export const STORAGE_KEY = 'movevai-retail:v2';

export const defaultState: RetailState = {
  orders: [],
  drivers: initialDrivers,
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

    return parsed;
  } catch {
    return defaultState;
  }
}

export function persistState(next: RetailState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage เต็ม (เช่น รูปหลักฐานปิดงานเยอะ) หรือถูกปิด — ข้ามการ persist
    // state ในหน่วยความจำยังทำงานปกติ ไม่ทำให้ commit ล้ม
  }
}
