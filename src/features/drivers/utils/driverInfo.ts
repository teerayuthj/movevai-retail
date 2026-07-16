import type { Driver } from '@/data/orderTypes';

export type DriverTab = 'approved' | 'pending' | 'rejected';

export const vehicleLabel: Record<Driver['vehicle'], string> = {
  motorcycle: 'จักรยานยนต์',
  van: 'รถตู้',
  pickup: 'รถกระบะ',
};

export function approvalStatus(driver: Driver): DriverTab {
  return driver.approvalStatus ?? 'approved';
}

export function normalizeIdCardNumber(value: string) {
  return value.replace(/\D/g, '').slice(0, 13);
}

export function formatIdCardNumber(value: string) {
  const digits = normalizeIdCardNumber(value);
  const parts = [
    digits.slice(0, 1),
    digits.slice(1, 5),
    digits.slice(5, 10),
    digits.slice(10, 12),
    digits.slice(12, 13),
  ].filter(Boolean);
  return parts.join('-');
}

export function formatKm(meters: number) {
  return `${(meters / 1000).toFixed(2)} กม.`;
}
