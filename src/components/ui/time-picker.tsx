import * as React from 'react';
import { Clock3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TimePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'default';
}

export function TimePicker({
  value,
  onChange,
  placeholder = 'เลือกเวลา',
  className,
  disabled,
  size = 'default',
}: TimePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size}
          disabled={disabled}
          data-empty={!value}
          className={cn(
            'justify-start text-left font-normal data-[empty=true]:text-muted-foreground',
            className,
          )}
        >
          <Clock3 className={cn('mr-2 size-4', size === 'sm' && 'size-3.5')} />
          {value ? `${value} น.` : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Input
          type="time"
          value={value ?? ''}
          onChange={(event) => {
            onChange?.(event.target.value);
            setOpen(false);
          }}
          autoFocus
          aria-label={placeholder}
        />
      </PopoverContent>
    </Popover>
  );
}
