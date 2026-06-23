import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  label: string;
  enabled: boolean;
  children: React.ReactElement;
};

// แสดง tooltip label เฉพาะตอน sidebar พับ (collapsed) — ไม่งั้นส่ง children กลับตรง ๆ
export function CollapsedSidebarTooltip({ label, enabled, children }: Props) {
  if (!enabled) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" align="center" sideOffset={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
