// Backward-compat shim: types/labels/helpers ย้ายไป ./orderTypes แล้ว
// ไฟล์เดิม (~80 จุด) ยัง import จาก '@/data/mock' — re-export เพื่อไม่ต้องแก้ทีเดียว
// TODO: repoint imports ไป '@/data/orderTypes' แล้วลบไฟล์นี้ (ไม่มี mock data เหลือแล้ว)
export * from './orderTypes';
