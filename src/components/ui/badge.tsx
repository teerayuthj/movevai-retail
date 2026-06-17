import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-slate-800 bg-slate-900 text-white',
        secondary: 'border-slate-200 bg-slate-50 text-slate-600',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-slate-200 bg-background text-slate-700',
        success: 'border-emerald-200 bg-white text-emerald-700',
        warning: 'border-amber-200 bg-amber-50 text-amber-800',
        info: 'border-slate-200 bg-white text-slate-600',
        muted: 'border-slate-200 bg-slate-50 text-slate-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
