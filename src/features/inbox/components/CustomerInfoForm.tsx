import { IdCard, MapPin, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Order } from '@/data/mock';
import { AddressMapPreview } from '@/components/AddressMapPreview';

type CustomerInfoFormProps = {
  customer: Order['customer'];
  editing: boolean;
  onChange: (customer: Order['customer']) => void;
};

export default function CustomerInfoForm({ customer, editing, onChange }: CustomerInfoFormProps) {
  const updateField = (
    field: keyof Order['customer'],
    value: Order['customer'][keyof Order['customer']],
  ) => {
    onChange({
      ...customer,
      [field]: value,
    });
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
        <Input
          value={customer.address}
          disabled={!editing}
          onChange={(event) => updateField('address', event.target.value)}
          className="mt-1"
        />
        <div className="mt-2">
          <AddressMapPreview address={customer.address} geo={customer.geo} />
        </div>
      </div>
    </div>
  );
}
