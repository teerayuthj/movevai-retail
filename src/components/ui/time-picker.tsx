import { Clock3 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  size?: 'sm' | 'default';
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'เลือกเวลา',
  className,
  disabled,
  required,
  size = 'default',
}: TimePickerProps) {
  return (
    <div className={cn('relative', className)}>
      <Clock3
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground',
          size === 'sm' && 'size-3.5',
        )}
      />
      <Input
        type="time"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        required={required}
        aria-required={required || undefined}
        aria-label={placeholder}
        className={cn('pl-9 tabular-nums', size === 'sm' && 'h-8 text-xs')}
      />
    </div>
  );
}
