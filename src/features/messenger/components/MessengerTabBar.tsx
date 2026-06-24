import { cn } from '@/lib/utils';
import { MESSENGER_TABS, type MessengerTab } from '../messengerTabs';

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
    <nav className="border-t bg-background/95 p-1.5 pb-safe shadow-[0_-6px_18px_rgba(15,23,42,0.06)] backdrop-blur-sm">
      <div className="flex gap-1">
        {MESSENGER_TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onSelect(tab.key)}
              className={cn(
                'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-colors',
                active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {counts[tab.key]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
