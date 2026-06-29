import { useState } from 'react';
import { IdCard, MapPin, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Order } from '@/data/mock';
import { AddressMapPreview } from '@/components/AddressMapPreview';
import ThaiAddressPicker, {
  type ThaiAddressValue,
} from '@/features/inbox/components/ThaiAddressPicker';

type CustomerInfoFormProps = {
  customer: Order['customer'];
  editing: boolean;
  onChange: (customer: Order['customer']) => void;
};

const EMPTY_ADDR: ThaiAddressValue = {
  province: '',
  district: '',
  subdistrict: '',
  postalCode: '',
};

// ประกอบที่อยู่เต็ม = รายละเอียด (บ้านเลขที่/ถนน) + ตำบล/อำเภอ/จังหวัด/รหัสไปรษณีย์
function composeAddress(street: string, addr: ThaiAddressValue) {
  const tail = [
    addr.subdistrict && `ต.${addr.subdistrict}`,
    addr.district && `อ.${addr.district}`,
    addr.province && `จ.${addr.province}`,
    addr.postalCode,
  ]
    .filter(Boolean)
    .join(' ');
  return [street.trim(), tail].filter(Boolean).join(' ');
}

export default function CustomerInfoForm({ customer, editing, onChange }: CustomerInfoFormProps) {
  // street = ส่วน free-text, addr = ส่วนที่เลือกจาก picker — รวมแล้วเขียนกลับเป็น customer.address
  // seed street จากที่อยู่เดิม (parent ใส่ key={order.id} ให้ remount ตอนสลับ order จึง reset ได้)
  const [street, setStreet] = useState(customer.address);
  const [addr, setAddr] = useState<ThaiAddressValue>(EMPTY_ADDR);

  const updateField = (
    field: keyof Order['customer'],
    value: Order['customer'][keyof Order['customer']],
  ) => {
    onChange({ ...customer, [field]: value });
  };

  const handleStreet = (next: string) => {
    setStreet(next);
    onChange({ ...customer, address: composeAddress(next, addr) });
  };

  const handleAddr = (next: ThaiAddressValue) => {
    setAddr(next);
    onChange({ ...customer, address: composeAddress(street, next) });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] font-medium text-muted-foreground">ชื่อผู้รับ / ร้าน</label>
        <Input
          value={customer.name}
          disabled={!editing}
          onChange={(event) => updateField('name', event.target.value)}
          className="mt-1"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Phone className="h-3 w-3" /> เบอร์โทร
          </label>
          <Input
            value={customer.phone}
            disabled={!editing}
            onChange={(event) => updateField('phone', event.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <IdCard className="h-3 w-3" /> เลขบัตร / นิติบุคคล
          </label>
          <Input
            value={customer.idCard ?? ''}
            disabled={!editing}
            onChange={(event) => updateField('idCard', event.target.value)}
            placeholder="สำหรับตรวจสอบตอนรับของ"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <MapPin className="h-3 w-3" /> ที่อยู่จัดส่ง
        </label>
        {editing ? (
          <div className="mt-1 space-y-3">
            <Input
              value={street}
              placeholder="บ้านเลขที่ / หมู่ / ซอย / ถนน / อาคาร"
              onChange={(event) => handleStreet(event.target.value)}
            />
            <ThaiAddressPicker value={addr} onChange={handleAddr} />
            <p className="rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
              ที่อยู่เต็ม: {customer.address || '—'}
            </p>
          </div>
        ) : (
          <Input value={customer.address} disabled className="mt-1" />
        )}
        <div className="mt-2">
          <AddressMapPreview address={customer.address} geo={customer.geo} />
        </div>
      </div>
    </div>
  );
}
