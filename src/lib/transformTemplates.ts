import { MV_TARGET_HEADERS, transformToMv, type TransformResult } from '@/lib/csvScriptTransform';

type RawSource = Parameters<typeof transformToMv>[0];

export type TransformTemplate = {
  id: string;
  label: string;
  carrier: string;
  fieldCount: number;
  available: boolean;
  headers: readonly string[];
  transform: (source: RawSource) => TransformResult;
};

const MOVEVAI_TEMPLATE: TransformTemplate = {
  id: 'movevai',
  label: 'e-Parcel ไปรษณีย์ไทย',
  carrier: 'MoveVAI',
  fieldCount: MV_TARGET_HEADERS.length,
  available: true,
  headers: MV_TARGET_HEADERS,
  transform: (source) => transformToMv(source),
};

function stubTemplate(
  id: string,
  label: string,
  carrier: string,
  fieldCount: number,
): TransformTemplate {
  return {
    id,
    label,
    carrier,
    fieldCount,
    available: false,
    headers: [],
    transform: () => {
      throw new Error(`Template "${label}" ยังไม่เปิดใช้งาน`);
    },
  };
}

export const TRANSFORM_TEMPLATES: TransformTemplate[] = [
  MOVEVAI_TEMPLATE,
  stubTemplate('jt', 'J&T Express', 'J&T', 18),
  stubTemplate('flash', 'Flash Express', 'Flash', 22),
  stubTemplate('kerry', 'Kerry Express', 'Kerry', 20),
];
