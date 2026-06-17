// Deterministic CSV transformer for MoveVAI shipping schema.
// Implements rules from skills/movevai-csv-transform (SKILL.md + mv-shipping-schema-th.md).
// No AI required. Best-effort heuristic mapping; ambiguous cases get flagged.

export const MV_TARGET_HEADERS = [
  'NO',
  'COMP_ORDER_ID',
  'INV_NO',
  'BARCODE_NO',
  'PRODUCT_IN_BOX',
  'SHIPPER_NAME',
  'SHIPPER_ADDRESS',
  'SHIPPER_AMPHUR',
  'SHIPPER_PROVINCE',
  'SHIPPER_ZIPCODE',
  'SHIPPER_TEL',
  'SHIPPER_EMAIL',
  'RECEIVER',
  'RECEIVER_ADDRESS',
  'RECEIVER_AMPHUR',
  'RECEIVER_PROVINCE',
  'RECEIVER_ZIPCODE',
  'RECEIVER_TEL',
  'RECEIVER_EMAIL',
  'WEIGHT',
  'PRICE',
  'INSURE',
  'INSURE_PRICE',
  'COD_DETAIL_NAME',
  'COD_DETAIL_SIZE',
  'COD_DETAIL_VOLUME',
  'COD_DETAIL_QTY',
  'COD_DETAIL_COLOR',
  'COD_DETAIL_QTY_AMOUNT',
  'PROVE_OF_PAYMENT',
  'IS_CONSENT',
] as const;

const FORCE_EMPTY_FIELDS = new Set([
  'COD_DETAIL_NAME',
  'COD_DETAIL_SIZE',
  'COD_DETAIL_VOLUME',
  'COD_DETAIL_QTY',
  'COD_DETAIL_COLOR',
  'COD_DETAIL_QTY_AMOUNT',
  'PROVE_OF_PAYMENT',
  'IS_CONSENT',
]);

export const DEFAULT_SHIPPER = {
  SHIPPER_NAME: 'บริษัท มูฟไว จำกัด',
  SHIPPER_ADDRESS: '857 ถ.มหาไชย แขวงวังบูรพาภิรมย์',
  SHIPPER_AMPHUR: 'เขตพระนคร',
  SHIPPER_PROVINCE: 'กรุงเทพฯ',
  SHIPPER_ZIPCODE: '10200',
  SHIPPER_TEL: '087-341-5360',
  SHIPPER_EMAIL: '',
};

type RawRow = Record<string, string>;

export type TransformRow = Record<(typeof MV_TARGET_HEADERS)[number], string>;

export type TransformWarning = {
  row: number;
  field: string;
  message: string;
};

export type TransformResult = {
  rows: TransformRow[];
  warnings: TransformWarning[];
  sourceHeaders: string[];
  sourceRowCount: number;
  detectedMapping: Record<string, string | null>;
};

// ---------- CSV parser (handles quoted fields w/ commas + escaped quotes) ----------

export function parseCsv(text: string): { headers: string[]; rows: RawRow[] } {
  // strip BOM
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // Skip blank lines
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).map<RawRow>((cols) => {
    const record: RawRow = {};
    headers.forEach((h, idx) => {
      record[h] = (cols[idx] ?? '').trim();
    });
    return record;
  });
  return { headers, rows: dataRows };
}

export function serializeCsv(headers: readonly string[], rows: Record<string, string>[]) {
  const escape = (value: string) => {
    if (value == null) return '';
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

// ---------- Header detection (semantic by synonyms) ----------

type SemanticKey =
  | 'order_id'
  | 'inv_no'
  | 'buyer_name'
  | 'buyer_phone'
  | 'receiver_name'
  | 'receiver_phone'
  | 'full_address'
  | 'address_line'
  | 'district'
  | 'subdistrict'
  | 'province'
  | 'zipcode'
  | 'email'
  | 'qty';

const SYNONYMS: Record<SemanticKey, string[]> = {
  order_id: [
    'order_id',
    'orderid',
    'order no',
    'order_no',
    'comp_order_id',
    'เลขออเดอร์',
    'เลขที่ออเดอร์',
  ],
  inv_no: ['inv_no', 'invoice', 'invoice_no', 'inv', 'เลขที่ใบกำกับ'],
  buyer_name: [
    'buyer_name',
    'buyer',
    'customer_name',
    'customer',
    'ชื่อผู้ซื้อ',
    'user_name',
    'ชื่อลูกค้า',
  ],
  buyer_phone: [
    'buyer_phone',
    'phone',
    'phone_no',
    'mobile',
    'mobile_number',
    'mobile_no',
    'user_phone',
    'user_phone_no',
    'tel',
    'เบอร์โทร',
    'เบอร์',
  ],
  receiver_name: ['receiver', 'receiver_name', 'recipient', 'ผู้รับ', 'ชื่อผู้รับ'],
  receiver_phone: ['receiver_phone', 'recipient_phone', 'receiver_tel', 'เบอร์ผู้รับ'],
  full_address: ['full_address', 'fulladdress', 'full address', 'ที่อยู่เต็ม', 'address_full'],
  address_line: ['address', 'addr', 'ที่อยู่', 'address_line', 'street'],
  district: ['district', 'amphur', 'amphoe', 'อำเภอ', 'เขต'],
  subdistrict: ['sub_district', 'subdistrict', 'sub district', 'tambon', 'ตำบล', 'แขวง'],
  province: ['province', 'จังหวัด'],
  zipcode: ['zipcode', 'zip', 'postal_code', 'postal code', 'postcode', 'รหัสไปรษณีย์'],
  email: ['email', 'e-mail', 'อีเมล'],
  qty: ['qty', 'quantity', 'จำนวน'],
};

function normalizeHeader(h: string) {
  return h
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .trim();
}

export function detectMapping(headers: string[]): Record<SemanticKey, string | null> {
  const map = {} as Record<SemanticKey, string | null>;
  const normalized = headers.map((h) => [h, normalizeHeader(h)] as const);

  for (const key of Object.keys(SYNONYMS) as SemanticKey[]) {
    const candidates = SYNONYMS[key].map((s) => normalizeHeader(s));
    const found = normalized.find(([, n]) => candidates.includes(n));
    map[key] = found ? found[0] : null;
  }
  return map;
}

// ---------- Phone formatting ----------

export function formatThaiPhone(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 9 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

// ---------- Receiver extraction from full_address ----------

const ADDRESS_START_PATTERNS = [
  /\d+\/\d+/, // house number with slash: 99/123
  /\d+\s*ม\.?\s*\d+/, // 88 ม.3
  /หมู่\s*\d+/, // หมู่ 3
  /\bซอย\b/,
  /\bถนน\b/,
  /\bถ\./, // ถ.
  /\bแขวง\b/,
  /\bเขต\b/,
  /\bตำบล\b/,
  /\bต\./,
  /\bอำเภอ\b/,
  /\bอ\./,
  /\bจังหวัด\b/,
  /\bจ\./,
  /อาคาร/,
  /คอนโด/,
];

function findAddressStartIndex(text: string): number {
  let earliest = -1;
  for (const pattern of ADDRESS_START_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      if (earliest === -1 || match.index < earliest) earliest = match.index;
    }
  }
  return earliest;
}

export function extractReceiverFromAddress(
  fullAddress: string,
  buyerName: string,
): { receiver: string; confident: boolean } {
  if (!fullAddress) return { receiver: buyerName, confident: false };

  // explicit marker
  const markerMatch = fullAddress.match(/(?:ผู้รับ|ส่งถึง)\s*[:：]?\s*(.+)/);
  if (markerMatch) {
    const remainder = markerMatch[1];
    const addrIdx = findAddressStartIndex(remainder);
    if (addrIdx > 0) {
      const name = remainder
        .slice(0, addrIdx)
        .trim()
        .replace(/[,\-—]\s*$/, '')
        .trim();
      if (name.length > 0) return { receiver: name, confident: true };
    }
  }

  // Name-prefix pattern: คุณ X, นาย/นาง/น.ส./บจก./ห้างหุ้นส่วน/บริษัท etc.
  const namePrefixMatch = fullAddress.match(
    /^\s*((?:คุณ|นาย|นาง|น\.ส\.|นางสาว|ดร\.|บจก\.|บริษัท|หจก\.|ห้างหุ้นส่วน|ร้าน)[^\d]+?)(?=\s+\d|\s+หมู่|\s+ซอย|\s+ถนน|\s+ถ\.|\s+อาคาร|\s+คอนโด|\s+ผู้รับ|$)/,
  );
  if (namePrefixMatch) {
    const name = namePrefixMatch[1].trim();
    if (name && name !== buyerName.trim()) {
      return { receiver: name, confident: true };
    }
  }

  return { receiver: buyerName, confident: false };
}

// ---------- Address part extraction (best-effort) ----------

export function extractZipcode(text: string): string {
  if (!text) return '';
  const match = text.match(/\b(\d{5})\b/);
  return match ? match[1] : '';
}

export function extractAmphurFromAddress(text: string): string {
  if (!text) return '';
  // เขต X (Bangkok)
  const bkk = text.match(/เขต\s*([^\s,]+(?:\s+[^\s,]+)?)(?=\s|,|$)/);
  if (bkk) return `เขต${bkk[1].trim()}`;
  // อำเภอ X / อ.X
  const province = text.match(/(?:อำเภอ|อ\.)\s*([^\s,]+(?:\s+[^\s,]+)?)(?=\s|,|$)/);
  if (province) return `อ.${province[1].trim()}`;
  return '';
}

export function extractProvinceFromAddress(text: string): string {
  if (!text) return '';
  const match = text.match(/(?:จังหวัด|จ\.)\s*([^\s,]+)/);
  if (match) return match[1].trim();
  // try by trailing token before postcode
  const beforeZip = text.match(/([^\s,]+)\s+\d{5}\b/);
  if (beforeZip) return beforeZip[1].trim();
  return '';
}

// ---------- Phone-in-address detection ----------

const PHONE_IN_ADDRESS_RE = /(?:โทร|เบอร์|โทรศัพท์)?\s*[:：]?\s*(0\d[\d\s-]{7,12}\d)/;

function extractPhoneFromAddress(text: string): string {
  if (!text) return '';
  const match = text.match(PHONE_IN_ADDRESS_RE);
  if (!match) return '';
  return match[1].replace(/\s+/g, '');
}

// ---------- Main transform ----------

function pick(row: RawRow, header: string | null): string {
  if (!header) return '';
  return (row[header] ?? '').trim();
}

function format1Based(idx: number) {
  return String(idx + 1);
}

export function transformToMv(
  source: { headers: string[]; rows: RawRow[] },
  options: { shipper?: Partial<typeof DEFAULT_SHIPPER> } = {},
): TransformResult {
  const mapping = detectMapping(source.headers);
  const shipper = { ...DEFAULT_SHIPPER, ...(options.shipper ?? {}) };
  const warnings: TransformWarning[] = [];
  const rows: TransformRow[] = [];

  source.rows.forEach((raw, idx) => {
    const buyerName = pick(raw, mapping.buyer_name);
    const buyerPhone = pick(raw, mapping.buyer_phone);
    const fullAddress = pick(raw, mapping.full_address) || pick(raw, mapping.address_line);
    const explicitReceiver = pick(raw, mapping.receiver_name);
    const explicitReceiverPhone = pick(raw, mapping.receiver_phone);

    let receiver = explicitReceiver;
    let receiverConfident = !!explicitReceiver;
    if (!receiver) {
      const extracted = extractReceiverFromAddress(fullAddress, buyerName);
      receiver = extracted.receiver;
      receiverConfident = extracted.confident || !!buyerName;
    }
    if (!receiver) {
      warnings.push({
        row: idx + 1,
        field: 'RECEIVER',
        message: 'ไม่พบชื่อผู้รับ และไม่มีผู้ซื้อสำรอง',
      });
    } else if (!receiverConfident) {
      warnings.push({
        row: idx + 1,
        field: 'RECEIVER',
        message: 'ใช้ buyer_name แทนเพราะแยกผู้รับจาก full_address ไม่ได้',
      });
    }

    // Phone fallback chain: phone-in-address > explicit receiver phone > buyer_phone
    const phoneInAddress = extractPhoneFromAddress(fullAddress);
    const tel = formatThaiPhone(phoneInAddress || explicitReceiverPhone || buyerPhone);
    if (!tel)
      warnings.push({ row: idx + 1, field: 'RECEIVER_TEL', message: 'ไม่พบเบอร์โทรผู้รับ' });

    // Address parts: prefer explicit fields, else extract from full_address.
    const districtField = pick(raw, mapping.district);
    const provinceField = pick(raw, mapping.province);
    const zipField = pick(raw, mapping.zipcode);

    let amphur = districtField;
    if (amphur && !/^(เขต|อ\.)/.test(amphur)) {
      // format hint: Bangkok provinces use เขต, others use อ.
      const isBkk = /กรุงเทพ|กทม/.test(provinceField);
      amphur = isBkk ? `เขต${amphur}` : `อ.${amphur}`;
    }
    if (!amphur) amphur = extractAmphurFromAddress(fullAddress);

    const province = provinceField || extractProvinceFromAddress(fullAddress);
    const zipcode = zipField || extractZipcode(fullAddress);

    if (!province)
      warnings.push({ row: idx + 1, field: 'RECEIVER_PROVINCE', message: 'ระบุจังหวัดไม่ได้' });
    if (!zipcode)
      warnings.push({ row: idx + 1, field: 'RECEIVER_ZIPCODE', message: 'ระบุรหัสไปรษณีย์ไม่ได้' });

    const orderId = pick(raw, mapping.order_id);
    const invNo =
      pick(raw, mapping.inv_no) || (orderId ? `INV-${orderId.replace(/^MV-/, '')}` : '');

    const row: TransformRow = {
      NO: format1Based(idx),
      COMP_ORDER_ID: orderId,
      INV_NO: invNo,
      BARCODE_NO: '',
      PRODUCT_IN_BOX: format1Based(idx),
      SHIPPER_NAME: shipper.SHIPPER_NAME,
      SHIPPER_ADDRESS: shipper.SHIPPER_ADDRESS,
      SHIPPER_AMPHUR: shipper.SHIPPER_AMPHUR,
      SHIPPER_PROVINCE: shipper.SHIPPER_PROVINCE,
      SHIPPER_ZIPCODE: shipper.SHIPPER_ZIPCODE,
      SHIPPER_TEL: shipper.SHIPPER_TEL,
      SHIPPER_EMAIL: shipper.SHIPPER_EMAIL,
      RECEIVER: receiver,
      // Skill rule: keep full_address whole; do NOT trim/normalize.
      // Exception: strip commas so downstream CSV consumers don't need quoting.
      RECEIVER_ADDRESS: fullAddress
        .replace(/,/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim(),
      RECEIVER_AMPHUR: amphur,
      RECEIVER_PROVINCE: province,
      RECEIVER_ZIPCODE: zipcode,
      RECEIVER_TEL: tel,
      RECEIVER_EMAIL: pick(raw, mapping.email),
      WEIGHT: '0',
      PRICE: '0',
      INSURE: '1',
      INSURE_PRICE: '1',
      COD_DETAIL_NAME: '',
      COD_DETAIL_SIZE: '',
      COD_DETAIL_VOLUME: '',
      COD_DETAIL_QTY: '',
      COD_DETAIL_COLOR: '',
      COD_DETAIL_QTY_AMOUNT: '',
      PROVE_OF_PAYMENT: '',
      IS_CONSENT: '',
    };

    // Defensive: enforce always-empty fields per skill.
    for (const key of FORCE_EMPTY_FIELDS) {
      (row as Record<string, string>)[key] = '';
    }

    rows.push(row);
  });

  return {
    rows,
    warnings,
    sourceHeaders: source.headers,
    sourceRowCount: source.rows.length,
    detectedMapping: mapping,
  };
}
