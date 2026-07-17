import type { Order } from '@/data/orderTypes';

type GeoPoint = { lat: number; lng: number };

export type ProofLocationAssessment = {
  distanceMeters: number;
  accuracyMeters: number | null;
  expected: GeoPoint;
  actual: GeoPoint;
  tone: 'ok' | 'warning' | 'critical';
};

function isFinitePoint(point: GeoPoint | undefined): point is GeoPoint {
  return Boolean(point && Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function distanceMeters(from: GeoPoint, to: GeoPoint) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseProofAccuracyMeters(label?: string) {
  if (!label) return null;
  const match = label.match(/[±+/-]\s*([\d,.]+)\s*(?:ม\.?|เมตร|m\b)/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * เทียบ GPS ตอนส่งมอบกับพิกัดปลายทางที่บันทึกไว้ โดยชดเชยค่าความแม่นยำของ GPS
 * เล็กน้อย ตัวช่วยนี้เป็นสัญญาณให้ผู้ตรวจสอบ ไม่ใช่เงื่อนไขปิดงานอัตโนมัติ
 */
export function assessProofLocation(order: Order): ProofLocationAssessment | null {
  const expected =
    order.proofOfDelivery?.locationAssessment?.expected ??
    order.metadataJson?.dispatch?.geo ??
    order.customer.geo;
  const actual = order.proofOfDelivery?.location;
  if (!isFinitePoint(expected) || !isFinitePoint(actual)) return null;

  const accuracyMeters = actual.accuracyMeters ?? parseProofAccuracyMeters(actual.label);
  const measuredDistance =
    order.proofOfDelivery?.locationAssessment?.distanceMeters ?? distanceMeters(expected, actual);
  const adjustedDistance = Math.max(0, measuredDistance - (accuracyMeters ?? 0));
  const warningThreshold = Math.max(150, (accuracyMeters ?? 0) * 2);
  const criticalThreshold = Math.max(1_000, (accuracyMeters ?? 0) * 4);

  return {
    distanceMeters: measuredDistance,
    accuracyMeters,
    expected,
    actual,
    tone:
      adjustedDistance > criticalThreshold
        ? 'critical'
        : adjustedDistance > warningThreshold
          ? 'warning'
          : 'ok',
  };
}

export function formatProofDistance(distance: number) {
  if (distance < 1_000) return `${Math.round(distance).toLocaleString('th-TH')} ม.`;
  return `${(distance / 1_000).toLocaleString('th-TH', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} กม.`;
}

export function getProofReviewAgeMinutes(order: Order, nowMs = Date.now()) {
  if (order.status !== 'pending_confirmation' || !order.proofOfDelivery?.capturedAt) return null;
  const capturedAtMs = new Date(order.proofOfDelivery.capturedAt).getTime();
  if (Number.isNaN(capturedAtMs)) return null;
  return Math.max(0, Math.floor((nowMs - capturedAtMs) / 60_000));
}
