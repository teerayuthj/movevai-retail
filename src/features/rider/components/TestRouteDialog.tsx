import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, X } from 'lucide-react';

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: (label?: string) => void;
};

// Dialog ตั้งชื่อ Test Route — แทน window.prompt() ให้เข้าธีมแอป
export function TestRouteDialog({ open, onCancel, onConfirm }: Props) {
  const [label, setLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLabel('');
      // โฟกัส input หลัง dialog แสดง เพื่อให้พิมพ์ได้ทันที
      const id = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;

  const submit = () => onConfirm(label.trim() || undefined);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="w-full overflow-hidden border bg-background shadow-xl sm:max-w-sm sm:rounded-xl">
        <div className="flex items-start justify-between border-b px-5 pb-4 pt-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-semibold">เริ่ม Test Route</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ทดสอบ GPS โดยไม่ผูกกับงานลูกค้า
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          <label htmlFor="test-route-label" className="text-xs font-medium text-muted-foreground">
            ชื่อรอบทดสอบ
          </label>
          <Input
            id="test-route-label"
            ref={inputRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit();
            }}
            placeholder="เช่น Lunch GPS Test"
            maxLength={120}
            className="h-11"
          />
          <p className="text-[11px] text-muted-foreground">
            เว้นว่างได้ — ระบบจะตั้งชื่อให้อัตโนมัติ
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3 pb-safe">
          <Button variant="outline" size="sm" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button size="sm" onClick={submit}>
            เริ่มบันทึกเส้นทาง
          </Button>
        </div>
      </div>
    </div>
  );
}
