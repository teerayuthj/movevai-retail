import { useState } from 'react';
import { Settings, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRetailStore } from '@/state/retailStore';
import { CollapsedSidebarTooltip } from './CollapsedSidebarTooltip';

type Props = {
  collapsed: boolean;
};

export function SidebarUserMenu({ collapsed }: Props) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const { resetDemoData } = useRetailStore();

  return (
    <Popover open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
      <CollapsedSidebarTooltip label="James Teerayuth" enabled={collapsed && !isUserMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="เมนูผู้ใช้"
            className={cn(
              'flex items-center rounded-lg transition-colors hover:bg-accent',
              collapsed ? 'mx-auto h-9 w-9 justify-center' : 'w-full gap-2.5 px-2 py-1.5',
            )}
          >
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarFallback>JT</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left leading-tight">
                  <div className="truncate text-sm font-medium">James Teerayuth</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    teerayuth.james@gmail.com
                  </div>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </PopoverTrigger>
      </CollapsedSidebarTooltip>
      <PopoverContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        sideOffset={collapsed ? 12 : 8}
        className="w-56 p-1"
      >
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">James Teerayuth</div>
          <div className="truncate text-[11px] text-muted-foreground">
            teerayuth.james@gmail.com
          </div>
        </div>
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          onClick={() => {
            resetDemoData();
            setIsUserMenuOpen(false);
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Settings className="h-4 w-4 shrink-0" strokeWidth={2.15} />
          รีเซ็ตข้อมูลทดสอบ
        </button>
      </PopoverContent>
    </Popover>
  );
}
