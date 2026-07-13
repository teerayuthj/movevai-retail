// Helpers สำหรับอ่านค่าจาก rawData (Record<string,string>) ของแต่ละแถวนำเข้า —
// รวมทั้งคอลัมน์พิเศษที่ backend แนบมากับรูป/OCR (sourceImageDataUrl, sourceOcrText, ฯลฯ)
// แยกออกจาก ImportBatchPanel เพราะเป็น pure function ไม่พึ่ง React

export const SOURCE_IMAGE_DATA_URL_COLUMN = 'sourceImageDataUrl';
export const SOURCE_IMAGE_MIME_TYPE_COLUMN = 'sourceImageMimeType';
export const SOURCE_OCR_TEXT_COLUMN = 'sourceOcrText';
export const SOURCE_PARSE_WARNINGS_COLUMN = 'parseWarnings';
export const SOURCE_MISSING_FIELDS_COLUMN = 'missingFields';
export const SOURCE_EXTRACTION_CONFIDENCE_COLUMN = 'extractionConfidence';

export function rawField(raw: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const found = Object.entries(raw).find(([k]) => k.toLowerCase() === key.toLowerCase());
    if (found && found[1]) return found[1];
  }
  return '';
}

export function sourceImageDataUrl(raw: Record<string, string>) {
  const value = raw[SOURCE_IMAGE_DATA_URL_COLUMN]?.trim();
  return value?.startsWith('data:image/') ? value : undefined;
}

export function sourceImageMimeType(raw: Record<string, string>) {
  return raw[SOURCE_IMAGE_MIME_TYPE_COLUMN]?.trim() || undefined;
}

export function sourceOcrText(raw: Record<string, string>) {
  return raw[SOURCE_OCR_TEXT_COLUMN]?.trim() || undefined;
}

export function sourceList(raw: Record<string, string>, key: string) {
  return (raw[key] ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function sourceConfidence(raw: Record<string, string>) {
  const value = Number(raw[SOURCE_EXTRACTION_CONFIDENCE_COLUMN]);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : undefined;
}

export function isOcrOnlyRaw(raw: Record<string, string>) {
  const warnings = sourceList(raw, SOURCE_PARSE_WARNINGS_COLUMN).join(' ').toLowerCase();
  const missing = new Set(sourceList(raw, SOURCE_MISSING_FIELDS_COLUMN));
  return (
    !!sourceOcrText(raw) &&
    ((missing.has('customerName') &&
      missing.has('customerPhone') &&
      missing.has('customerAddress')) ||
      warnings.includes('no customer') ||
      warnings.includes('no order'))
  );
}

export function visibleRawEntries(raw: Record<string, string>) {
  return Object.entries(raw).filter(([key, value]) => {
    if (
      key === SOURCE_IMAGE_DATA_URL_COLUMN ||
      key === SOURCE_IMAGE_MIME_TYPE_COLUMN ||
      key === SOURCE_OCR_TEXT_COLUMN ||
      key === SOURCE_PARSE_WARNINGS_COLUMN ||
      key === SOURCE_MISSING_FIELDS_COLUMN ||
      key === SOURCE_EXTRACTION_CONFIDENCE_COLUMN
    ) {
      return false;
    }
    if (isOcrOnlyRaw(raw)) {
      return (
        value.trim() !== '' &&
        !['qty', 'payment', 'unitPrice', 'totalValue', 'itemName', 'note'].includes(key)
      );
    }
    return true;
  });
}
