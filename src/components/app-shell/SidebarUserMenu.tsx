import { useState } from 'react';
import { ChevronsUpDown, Clock3, LogOut, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CollapsedSidebarTooltip } from './CollapsedSidebarTooltip';
import { useAdminAuth } from '@/auth/AuthContext';
import type { PageKey } from '@/lib/routes';
import { Button } from '@/components/ui/button';

type Props = {
  collapsed: boolean;
  onChangePage: (page: PageKey) => void;
};

export function SidebarUserMenu({ collapsed, onChangePage }: Props) {
  const { user, policy, logout } = useAdminAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Popover open={isUserMenuOpen} onOpenChange={setIsUserMenuOpen}>
      <CollapsedSidebarTooltip label={user.name} enabled={collapsed && !isUserMenuOpen}>
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
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left leading-tight">
                  <div className="truncate text-sm font-medium">{user.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{user.role.name}</div>
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
        className="w-64 p-1"
      >
        <div className="px-2 py-1.5">
          <div className="truncate text-sm font-medium">{user.name}</div>
          <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
          <div className="mt-2 flex items-center justify-between rounded-md bg-muted px-2 py-1.5 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Session
            </span>
            <span className="font-medium">สูงสุด {policy?.sessionDurationHours ?? '—'} ชม.</span>
          </div>
        </div>
        <div className="my-1 border-t" />
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setIsUserMenuOpen(false);
            onChangePage('profile');
          }}
        >
          <UserRound />
          โปรไฟล์ของฉัน
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={() => void logout()}
        >
          <LogOut />
          ออกจากระบบ
        </Button>
      </PopoverContent>
    </Popover>
  );
}
