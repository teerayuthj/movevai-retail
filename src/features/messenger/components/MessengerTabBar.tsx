import { cn } from '@/lib/utils';
import { CheckCircle2, ClipboardCheck, Inbox, Truck, type LucideIcon } from 'lucide-react';
import { MESSENGER_TABS, type MessengerTab } from '../messengerTabs';

// icon เป็นเรื่องของ UI — เก็บไว้ที่นี่ ไม่ปนใน messengerTabs.ts (source of truth ของ routing/status)
const TAB_ICONS: Record<MessengerTab, LucideIcon> = {
  assigned: Inbox,
  in_transit: Truck,
  pending_confirmation: ClipboardCheck,
  delivered: CheckCircle2,
};

export function MessengerTabBar({
  activeTab,
  counts,
  onSelect,
}: {
  activeTab: MessengerTab | null;
  counts: Record<MessengerTab, number>;
  onSelect: (tab: MessengerTab) => void;
}) {
  return (
    // dock ลอยทับ content (iOS 26-style) — pointer-events-none ที่ nav เพื่อให้แตะ map/list
    // บริเวณข้างๆ pill ได้ แล้วเปิด events เฉพาะตัว pill
    <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] flex justify-center px-4 pb-safe">
      <div className="pointer-events-auto flex w-full max-w-sm gap-0.5 rounded-full border border-border/60 bg-background/75 p-1.5 shadow-[0_8px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl">
        {MESSENGER_TABS.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = TAB_ICONS[tab.key];
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              className={cn(
                'group flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full pb-0.5 pt-1 text-[10px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'relative flex h-7 w-10 items-center justify-center rounded-full transition-colors',
                  active ? 'bg-primary/15' : 'group-hover:bg-muted/70',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.9} />
                {count > 0 && (
                  <span
                    className={cn(
                      'absolute -right-0.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-1 text-[9px] font-semibold tabular-nums',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted-foreground/70 text-background',
                    )}
                  >
                    {count}
                  </span>
                )}
              </span>
              <span className={cn(active && 'font-semibold')}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
