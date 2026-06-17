import { drivers as initialDrivers, orders as initialOrders } from '@/data/mock';
import type { Driver } from '@/data/mock';
import { migrateOrders } from '@/state/retail/timeline';
import type { RetailState } from '@/state/retail/types';

export const STORAGE_KEY = 'movevai-retail:v1';

export const defaultState: RetailState = {
  orders: migrateOrders(initialOrders),
  drivers: initialDrivers,
};

function mergeDriverDefaults(drivers: Driver[]): Driver[] {
  return drivers.map((driver) => {
    const defaultDriver = initialDrivers.find((item) => item.id === driver.id);

    return {
      ...defaultDriver,
      ...driver,
      avatarKey: driver.avatarKey || defaultDriver?.avatarKey || 'emerald',
    };
  });
}

export function loadState(): RetailState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;

    const parsed = JSON.parse(raw) as RetailState;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.drivers)) {
      return defaultState;
    }

    return {
      orders: migrateOrders(parsed.orders),
      drivers: mergeDriverDefaults(parsed.drivers),
    };
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
