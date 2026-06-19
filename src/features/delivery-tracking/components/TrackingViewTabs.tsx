import { useState, type ComponentType } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronDown } from 'lucide-react';
import type { TrackingView } from '../utils/trackingSearch';

export type TrackingTab = {
  view: TrackingView;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count: number;
};

type TrackingViewTabsProps = {
  tabs: TrackingTab[];
  view: TrackingView;
  onChange: (next: TrackingView) => void;
};

/** ตัวสลับมุมมอง — มือถือเป็น dropdown (กัน scroll แนวนอน), เดสก์ท็อปเป็นแท็บเดียว */
export function TrackingViewTabs({ tabs, view, onChange }: TrackingViewTabsProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const currentTab = tabs.find((tab) => tab.view === view) ?? tabs[0];

  return (
    <>
      {/* มือถือ: dropdown เลือกมุมมอง */}
      <div className="lg:hidden">
        <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-11 w-full items-center justify-between rounded-xl border bg-card px-4 text-sm',
                currentTab.view === 'needs_action' && currentTab.count > 0 && 'text-warning',
              )}
            >
              <span className="flex items-center gap-2">
                <currentTab.icon className="h-4 w-4" />
                <span className="font-medium">{currentTab.label}</span>
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    currentTab.view === 'needs_action' && currentTab.count > 0
                      ? 'bg-warning/15 text-warning'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {currentTab.count.toLocaleString('th-TH')}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-sm p-1">
            {tabs.map((tab) => {
              const active = view === tab.view;
              const urgent = tab.view === 'needs_action' && tab.count > 0;
              return (
                <button
                  key={tab.view}
                  type="button"
                  onClick={() => {
                    onChange(tab.view);
                    setIsMenuOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted',
                    active && 'bg-muted/60',
                    urgent && 'text-warning',
                  )}
                >
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left font-medium">{tab.label}</span>
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                      urgent ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tab.count.toLocaleString('th-TH')}
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
      </div>

      {/* เดสก์ท็อป: แท็บเดียวคุมมุมมอง — ตัวเลขเป็น badge ในแท็บ */}
      <div className="hidden lg:block">
        <div className="inline-flex min-w-full gap-1.5 rounded-2xl bg-muted/70 p-1.5">
          {tabs.map((tab) => {
            const active = view === tab.view;
            const Icon = tab.icon;
            const isAction = tab.view === 'needs_action';
            const urgent = isAction && tab.count > 0;
            return (
              <button
                key={tab.view}
                type="button"
                onClick={() => onChange(tab.view)}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm transition-colors',
                  active
                    ? 'bg-background shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                  active && urgent && 'text-warning',
                  active && !urgent && 'text-foreground',
                  !active && urgent && 'text-warning',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    urgent
                      ? 'bg-warning/15 text-warning'
                      : active
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-background/80 text-muted-foreground',
                  )}
                >
                  {tab.count.toLocaleString('th-TH')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
