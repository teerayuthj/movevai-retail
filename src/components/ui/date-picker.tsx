import * as React from 'react';
import { format, parse } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Match compact form rows (h-8 / text-xs) — defaults to standard h-9 control size. */
  size?: 'sm' | 'default';
}

const ISO_FORMAT = 'yyyy-MM-dd';

export function DatePicker({
  value,
  onChange,
  placeholder = 'เลือกวันที่',
  className,
  disabled,
  size = 'default',
}: DatePickerProps) {
  const selected = React.useMemo(() => {
    if (!value) return undefined;
    const parsed = parse(value, ISO_FORMAT, new Date());
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [value]);

  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={disabled}
          data-empty={!selected}
          className={cn(
            'justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className={cn('mr-2 size-4', size === 'sm' && 'size-3.5')} />
          {selected ? format(selected, 'd MMM yyyy', { locale: th }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={th}
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange?.(format(date, ISO_FORMAT));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
