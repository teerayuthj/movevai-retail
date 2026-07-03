// Dashboard sample data (weeklyVolume/sourceBreakdown) — ยังไม่มี stats endpoint จาก backend
// types/labels/helpers อยู่ที่ ./orderTypes แล้ว — re-export ที่นี่เพื่อ backward-compat
// ให้ไฟล์เดิมที่ import จาก '@/data/mock' ใช้งานต่อได้โดยไม่ต้องแก้
// NOTE: seed orders/drivers ถูกลบแล้ว — orders/drivers มาจาก backend ทั้งหมด (ดู syncFromBackend)
export * from './orderTypes';

export const weeklyVolume = [
  { day: 'จ.', orders: 42, delivered: 38 },
  { day: 'อ.', orders: 55, delivered: 52 },
  { day: 'พ.', orders: 48, delivered: 45 },
  { day: 'พฤ.', orders: 61, delivered: 58 },
  { day: 'ศ.', orders: 72, delivered: 67 },
  { day: 'ส.', orders: 35, delivered: 34 },
  { day: 'อา.', orders: 28, delivered: 27 },
];

export const sourceBreakdown = [
  { name: 'LINE (text)', value: 45, color: '#10b981' },
  { name: 'LINE (image/สลิป)', value: 28, color: '#3b82f6' },
  { name: 'LINE (excel)', value: 18, color: '#f59e0b' },
  { name: 'หน้าร้าน / Manual', value: 9, color: '#9ca3af' },
];
