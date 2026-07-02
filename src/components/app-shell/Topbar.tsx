import { useState } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';

type Props = {
  onOpenMobileNav: () => void;
  /** กด Enter ในช่องค้นหา — พาไปหน้าลูกค้าพร้อม query */
  onSearch: (query: string) => void;
};

export function Topbar({ onOpenMobileNav, onSearch }: Props) {
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
      <form
        className="relative w-full max-w-md sm:w-96"
        onSubmit={(event) => {
          event.preventDefault();
          const query = q.trim();
          if (!query) return;
          onSearch(query);
          setQ('');
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาลูกค้า ชื่อ, เบอร์โทร, ที่อยู่... (Enter)"
          className="pl-9"
        />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
}
