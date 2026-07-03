import { CheckCircle2, Mailbox, Truck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShippingMethod } from '@/data/orderTypes';
import { cn } from '@/lib/utils';

type ShippingMethodSelectorProps = {
  value: ShippingMethod;
  onChange: (method: ShippingMethod) => void;
  disabled?: boolean;
};

const options: {
  key: ShippingMethod;
  title: string;
  desc: string;
  Icon: typeof Truck;
}[] = [
  {
    key: 'internal_driver',
    title: 'คนขับภายใน',
    desc: 'เข้าคิวมอบหมาย driver + สร้าง Route',
    Icon: Truck,
  },
  {
    key: 'thai_post',
    title: 'ไปรษณีย์ไทย',
    desc: 'เข้าคิวจัดแบทช์ + export CSV ให้ไปรษณีย์',
    Icon: Mailbox,
  },
];

export default function ShippingMethodSelector({
  value,
  onChange,
  disabled,
}: ShippingMethodSelectorProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Truck className="h-4 w-4 text-muted-foreground" /> วิธีจัดส่ง
        </CardTitle>
        <CardDescription className="text-xs">เลือกช่องทางจัดส่งก่อนยืนยันเข้าคิว</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-2 md:grid-cols-2">
        {options.map((option) => {
          const active = value === option.key;
          const Icon = option.Icon;

          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option.key)}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                  active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <div className="text-sm font-medium">{option.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{option.desc}</div>
              </div>

              {active && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
