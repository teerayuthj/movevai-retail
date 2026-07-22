export function shortRouteCode(code: string): string {
  const normalized = code.trim();
  const parts = normalized.split('-');

  // รหัสรุ่นใหม่ RT-20260720-U01 / RT-20260720-S03 สั้นอยู่แล้ว → แสดงตรง ๆ
  //
  // รหัสรุ่นเก่า RT-<วันที่>-<driver.code>-<timestamp> มี timestamp สุ่มต่อท้าย ตัดก้อนสุดท้ายทิ้ง
  //   RT-20260720-D-REG-QH3X6W-mrsqrq19 → RT-20260720-D-REG-QH3X6W
  //   (D-REG-QH3X6W คือรหัสคนขับทั้งก้อน เก็บไว้เพื่อระบุตัวคนขับ; QH3X6W ไม่ใช่ขยะ)
  if (parts.length > 4 && parts[0]?.toUpperCase() === 'RT' && /^\d{8}$/.test(parts[1] ?? '')) {
    return parts.slice(0, -1).join('-');
  }

  return normalized;
}
