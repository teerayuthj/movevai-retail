import { Select } from '@/components/ui/select';
import type { ShippingMethod } from '@/data/orderTypes';

// ตัวเลือกวิธีจัดส่งตอนอนุมัติ — ใช้ร่วมกันใน header ของ workspace และ bulk action bar
export function ShippingMethodSelect({
  value,
  onChange,
}: {
  value: ShippingMethod;
  onChange: (method: ShippingMethod) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as ShippingMethod)}
      className="h-8 text-xs"
    >
      <option value="internal_driver">คนขับภายใน</option>
      <option value="thai_post">ไปรษณีย์ไทย</option>
    </Select>
  );
}
