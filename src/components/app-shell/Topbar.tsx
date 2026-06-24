import React, { useState } from 'react';
import { Search, Bell, MessageCircle, Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getPathForPage, type PageKey } from '@/lib/routes';

type Props = {
  onOpenMobileNav: () => void;
  onNavigate: (event: React.MouseEvent<HTMLAnchorElement>, page: PageKey) => void;
};

export function Topbar({ onOpenMobileNav, onNavigate }: Props) {
  const [q, setQ] = useState('');

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:gap-4 sm:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="เปิดเมนู"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="relative w-full max-w-md sm:w-96">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา order, ลูกค้า, เบอร์โทร..."
          className="pl-9"
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <a
          href={getPathForPage('chat')}
          onClick={(event) => onNavigate(event, 'chat')}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-success" />
        </a>
        <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
}
