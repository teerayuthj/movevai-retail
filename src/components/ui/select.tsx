import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** class สำหรับ wrapper (ใช้คุม width/flex เช่น w-44, flex-1) */
  containerClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, containerClassName, children, ...props }, ref) => {
    return (
      <div className={cn('relative', containerClassName)}>
        <select
          ref={ref}
          className={cn(
            'h-9 w-full appearance-none rounded-md border border-input bg-background py-1 pl-3 pr-8 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    );
  },
);
Select.displayName = 'Select';

export { Select };
