import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  fetchAddressDistricts,
  fetchAddressProvinces,
  fetchAddressSubdistricts,
} from '@/lib/retailApi';

export type ThaiAddressValue = {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
};

type ThaiAddressPickerProps = {
  value: ThaiAddressValue;
  disabled?: boolean;
  onChange: (value: ThaiAddressValue) => void;
};

const EMPTY: ThaiAddressValue = { province: '', district: '', subdistrict: '', postalCode: '' };

/**
 * Cascading address picker: เลือกจังหวัด → อำเภอ → ตำบล แล้วเติมรหัสไปรษณีย์อัตโนมัติ
 * ทุกช่องพิมพ์ค้นได้ (filter ในรายการ), แก้ค่าเองได้ (free text), และกด X เคลียร์ได้
 * เลือกชั้นบนใหม่จะรีเซ็ตชั้นล่างให้ เพื่อกันที่อยู่ไม่สอดคล้องกัน
 */
export default function ThaiAddressPicker({ value, disabled, onChange }: ThaiAddressPickerProps) {
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [subdistricts, setSubdistricts] = useState<
    Array<{ subdistrict: string; postalCode: string }>
  >([]);

  // โหลด 77 จังหวัดครั้งเดียว
  useEffect(() => {
    let active = true;
    fetchAddressProvinces()
      .then((list) => active && setProvinces(list))
      .catch(() => active && setProvinces([]));
    return () => {
      active = false;
    };
  }, []);

  // จังหวัดเปลี่ยน → โหลดอำเภอของจังหวัดนั้น
  useEffect(() => {
    let active = true;
    if (!value.province) {
      setDistricts([]);
      return;
    }
    fetchAddressDistricts(value.province)
      .then((list) => active && setDistricts(list))
      .catch(() => active && setDistricts([]));
    return () => {
      active = false;
    };
  }, [value.province]);

  // อำเภอเปลี่ยน → โหลดตำบล (พร้อมรหัสไปรษณีย์)
  useEffect(() => {
    let active = true;
    if (!value.province || !value.district) {
      setSubdistricts([]);
      return;
    }
    fetchAddressSubdistricts(value.province, value.district)
      .then((list) => active && setSubdistricts(list))
      .catch(() => active && setSubdistricts([]));
    return () => {
      active = false;
    };
  }, [value.province, value.district]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Combobox
        label="จังหวัด"
        placeholder="เลือก/ค้นหาจังหวัด"
        value={value.province}
        options={provinces}
        disabled={disabled}
        onSelect={(province) => onChange({ ...EMPTY, province })}
        onType={(province) => onChange({ ...value, province })}
        onClear={() => onChange(EMPTY)}
      />
      <Combobox
        label="อำเภอ / เขต"
        placeholder={value.province ? 'เลือก/ค้นหาอำเภอ' : 'เลือกจังหวัดก่อน'}
        value={value.district}
        options={districts}
        disabled={disabled || !value.province}
        onSelect={(district) => onChange({ ...value, district, subdistrict: '', postalCode: '' })}
        onType={(district) => onChange({ ...value, district })}
        onClear={() => onChange({ ...value, district: '', subdistrict: '', postalCode: '' })}
      />
      <Combobox
        label="ตำบล / แขวง"
        placeholder={value.district ? 'เลือก/ค้นหาตำบล' : 'เลือกอำเภอก่อน'}
        value={value.subdistrict}
        options={subdistricts.map((s) => s.subdistrict)}
        disabled={disabled || !value.district}
        onSelect={(subdistrict) => {
          const match = subdistricts.find((s) => s.subdistrict === subdistrict);
          onChange({ ...value, subdistrict, postalCode: match?.postalCode ?? value.postalCode });
        }}
        onType={(subdistrict) => onChange({ ...value, subdistrict })}
        onClear={() => onChange({ ...value, subdistrict: '', postalCode: '' })}
      />
      <div>
        <label className="text-[11px] font-medium text-muted-foreground">รหัสไปรษณีย์</label>
        <div className="relative mt-1">
          <Input
            value={value.postalCode}
            disabled={disabled}
            inputMode="numeric"
            maxLength={5}
            placeholder="เติมอัตโนมัติจากตำบล"
            onChange={(event) =>
              onChange({ ...value, postalCode: event.target.value.replace(/\D/g, '').slice(0, 5) })
            }
            className={cn(value.postalCode && 'pr-8')}
          />
          {value.postalCode && !disabled ? (
            <ClearButton onClick={() => onChange({ ...value, postalCode: '' })} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

type ComboboxProps = {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  disabled?: boolean;
  onSelect: (value: string) => void;
  onType: (value: string) => void;
  onClear: () => void;
};

function Combobox({
  label,
  placeholder,
  value,
  options,
  disabled,
  onSelect,
  onType,
  onClear,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ปิด dropdown เมื่อคลิกนอกพื้นที่
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const query = value.trim().toLowerCase();
  const filtered = query
    ? options.filter((option) => option.toLowerCase().includes(query))
    : options;

  return (
    <div ref={containerRef}>
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <div className="relative mt-1">
        <Input
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            onType(event.target.value);
            setOpen(true);
          }}
          className="pr-12"
        />
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 text-muted-foreground">
          {value && !disabled ? <ClearButton onClick={onClear} /> : null}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </div>
        {open && !disabled && filtered.length > 0 ? (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-input bg-popover py-1 text-sm shadow-md">
            {filtered.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full px-3 py-1.5 text-left hover:bg-accent hover:text-accent-foreground',
                    option === value && 'bg-accent/60',
                  )}
                  onClick={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  {option}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function ClearButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="ล้างค่า"
      className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground"
      onClick={onClick}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
