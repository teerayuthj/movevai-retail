// Helper สำหรับที่อยู่ไทย — แยกออกจาก ThaiAddressPicker.tsx ให้ fast-refresh ทำงานปกติ
// (ไฟล์ component ควร export แต่ component) และให้ฟอร์มอื่นใช้ร่วมได้

export type ThaiAddressValue = {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
};

export const EMPTY_THAI_ADDRESS: ThaiAddressValue = {
  province: '',
  district: '',
  subdistrict: '',
  postalCode: '',
};

// กรุงเทพฯ ใช้ แขวง/เขต, ต่างจังหวัดใช้ ต./อ. — คำนำหน้าตามแต่ละพื้นที่
function addressPrefixes(province: string) {
  const isBangkok = province === 'กรุงเทพมหานคร';
  return {
    subdistrict: isBangkok ? 'แขวง' : 'ต.',
    district: isBangkok ? 'เขต' : 'อ.',
    province: isBangkok ? '' : 'จ.',
  };
}

// ประกอบที่อยู่เต็ม = รายละเอียด (บ้านเลขที่/ถนน) + ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์
export function composeThaiAddress(street: string, addr: ThaiAddressValue) {
  const prefix = addressPrefixes(addr.province);
  const tail = [
    addr.subdistrict && `${prefix.subdistrict}${addr.subdistrict}`,
    addr.district && `${prefix.district}${addr.district}`,
    addr.province && `${prefix.province}${addr.province}`,
    addr.postalCode,
  ]
    .filter(Boolean)
    .join(' ');
  return [street.trim(), tail].filter(Boolean).join(' ');
}

// ที่อยู่จาก LINE/OCR/คลังที่อยู่ มักมีชื่ออาคาร-เลขห้องปน (เช่น "98 Wireless Residence ห้อง 2504
// ถนนวิทยุ …") ซึ่งทำให้ geocoder หาไม่เจอทั้งที่ตัวถนน/แขวง/เขตถูกต้อง — ตัดให้เหลือ
// เลขที่บ้าน + ตั้งแต่ ถนน/ซอย/แขวง เป็นต้นไป เพื่อใช้เป็นคำค้นสำรอง (ที่อยู่เต็มยังเก็บไว้ที่เดิม)
export function simplifyThaiAddress(address: string): string | null {
  const tokens = address.split(/\s+/);
  const anchorIndex = tokens.findIndex((token) => /^(ถนน|ถ\.|ซอย|ซ\.|แขวง|ตำบล|ต\.)/.test(token));
  if (anchorIndex <= 0) return null;
  const houseNumber = tokens.slice(0, anchorIndex).find((token) => /^\d+(\/\d+)?$/.test(token));
  const simplified = [houseNumber, ...tokens.slice(anchorIndex)].filter(Boolean).join(' ');
  return simplified === address ? null : simplified;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// หลังเดาที่อยู่อัตโนมัติ: ตัดส่วนที่ระบุได้ออกจากข้อความดิบ เหลือไว้แต่บ้านเลขที่/ถนน
// สำคัญ: ลบเฉพาะชื่อที่ "มีคำนำหน้า" (แขวงสีลม/ต.สีลม) เพื่อไม่ไปตัด "ถนนสีลม" ที่เป็นชื่อถนน
export function extractStreet(raw: string, addr: ThaiAddressValue): string {
  let street = raw;
  const patterns: RegExp[] = [];
  if (addr.subdistrict) {
    patterns.push(new RegExp(`(?:ตำบล|แขวง|ต\\.)\\s*${escapeRegExp(addr.subdistrict)}`, 'g'));
  }
  if (addr.district) {
    patterns.push(new RegExp(`(?:อำเภอ|เขต|อ\\.)\\s*${escapeRegExp(addr.district)}`, 'g'));
    // "อ.เมือง" ของอำเภอเมืองXxx
    if (addr.district.startsWith('เมือง')) {
      patterns.push(/(?:อำเภอ|เขต|อ\.)\s*เมือง/g);
    }
  }
  if (addr.province) {
    patterns.push(new RegExp(`(?:จังหวัด|จ\\.)?\\s*${escapeRegExp(addr.province)}`, 'g'));
    if (addr.province === 'กรุงเทพมหานคร') patterns.push(/กทม\.?|กรุงเทพฯ?/g);
  }
  if (addr.postalCode) patterns.push(new RegExp(escapeRegExp(addr.postalCode), 'g'));
  for (const pattern of patterns) street = street.replace(pattern, ' ');
  // เก็บกวาดคำนำหน้าที่ค้าง (คงคำว่า หมู่/ม. ที่เป็นรายละเอียดบ้านไว้)
  street = street.replace(/ตำบล|แขวง|อำเภอ|เขต|จังหวัด|ต\.|อ\.|จ\./g, ' ');
  return street.replace(/\s+/g, ' ').trim();
}
