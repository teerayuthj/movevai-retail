// จำสถานะ UI ของหน้า import ไว้ใน localStorage — batch ที่อ่านแล้ว + สถานะหุบรายการด้านซ้าย
const IMPORT_BATCH_READ_STORAGE_KEY = 'movevai:inbox-import-batch-read-v1';
const IMPORT_LIST_COLLAPSED_STORAGE_KEY = 'movevai:inbox-import-list-collapsed-v1';

export function readStoredBatchIds() {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(IMPORT_BATCH_READ_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export function writeStoredBatchIds(ids: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMPORT_BATCH_READ_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be disabled or full; keep the in-memory read state for this session.
  }
}

export function readStoredListCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(IMPORT_LIST_COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeStoredListCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(IMPORT_LIST_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // localStorage may be disabled or full; keep the in-memory collapsed state for this session.
  }
}
