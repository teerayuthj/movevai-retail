import { useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowRight,
  Ban,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  Inbox,
  Mailbox,
  Merge,
  PackageCheck,
  Pencil,
  RefreshCcw,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Split,
  Truck as TruckIcon,
  UserCog,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Order,
  OrderActivityActor,
  OrderActivityChange,
  OrderActivityEvent,
  OrderActivityEventType,
} from '@/data/orderTypes';
import { shortRouteCode } from '@/lib/routeCode';
import { cn } from '@/lib/utils';
import { compactActivityLog } from '@/state/retail/timeline';

type IconConfig = {
  Icon: typeof Inbox;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';
};

const ICON_BY_TYPE: Record<OrderActivityEventType, IconConfig> = {
  order_received: { Icon: Inbox, tone: 'info' },
  order_created_from_internal_chat: { Icon: Bot, tone: 'info' },
  parsing_completed: { Icon: Sparkles, tone: 'info' },
  customer_updated: { Icon: Pencil, tone: 'neutral' },
  order_details_updated: { Icon: Pencil, tone: 'neutral' },
  shipping_method_changed: { Icon: TruckIcon, tone: 'neutral' },
  order_confirmed: { Icon: CheckCircle2, tone: 'success' },
  driver_assigned: { Icon: UserCog, tone: 'neutral' },
  driver_auto_assigned: { Icon: Sparkles, tone: 'info' },
  delivery_job_accepted: { Icon: CheckCircle2, tone: 'info' },
  delivery_started: { Icon: Route, tone: 'info' },
  delivery_submitted: { Icon: ClipboardCheck, tone: 'warning' },
  delivery_proof_revised: { Icon: Pencil, tone: 'warning' },
  delivery_confirmed: { Icon: CheckCircle2, tone: 'success' },
  delivery_completed: { Icon: PackageCheck, tone: 'success' },
  postal_batch_exported: { Icon: FileSpreadsheet, tone: 'info' },
  postal_tracking_saved: { Icon: ClipboardCheck, tone: 'neutral' },
  postal_handed_over: { Icon: Mailbox, tone: 'info' },
  order_import_edited: { Icon: Pencil, tone: 'neutral' },
  order_import_merged: { Icon: Merge, tone: 'info' },
  order_import_split: { Icon: Split, tone: 'neutral' },
  order_cancelled: { Icon: Ban, tone: 'danger' },
  order_rejected: { Icon: XCircle, tone: 'danger' },
  order_restored: { Icon: RefreshCcw, tone: 'info' },
  delivery_failed: { Icon: XCircle, tone: 'warning' },
  return_started: { Icon: ShieldCheck, tone: 'warning' },
  return_completed: { Icon: PackageCheck, tone: 'info' },
  delivery_retried: { Icon: RefreshCcw, tone: 'neutral' },
  delivery_planned: { Icon: Clock, tone: 'info' },
  delivery_plan_updated: { Icon: Pencil, tone: 'neutral' },
  delivery_plan_cleared: { Icon: Ban, tone: 'warning' },
  delivery_plan_released: { Icon: CheckCircle2, tone: 'success' },
  delivery_route_cancelled: { Icon: Ban, tone: 'danger' },
  delivery_route_reassigned: { Icon: UserCog, tone: 'warning' },
  delivery_urgent_route_published: { Icon: Zap, tone: 'danger' },
};

const FALLBACK_ICON_CONFIG: IconConfig = { Icon: Clock, tone: 'muted' };

const TONE_CLASSES: Record<IconConfig['tone'], string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  info: 'bg-info/10 text-info ring-info/20',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/10 text-warning ring-warning/20',
  danger: 'bg-destructive/10 text-destructive ring-destructive/20',
  muted: 'bg-muted text-muted-foreground ring-muted',
};

// ---------------------------------------------------------------------------
// การนำเสนอ event: แปลง summary/details ดิบจาก backend เป็นหัวข้อสั้น + chip
// ถ้า parse format ไม่ติด ต้อง fallback ไปโชว์ summary/details เต็มเสมอ
// ---------------------------------------------------------------------------

type EventChip = {
  Icon?: typeof Inbox;
  label: string;
  mono?: boolean;
  fullText?: string;
  copyable?: boolean;
};

type PresentedEvent = {
  title: string;
  subtitle?: string;
  chips?: EventChip[];
  reason?: string;
  detailsText?: string;
};

function routeChip(code: string): EventChip {
  return {
    Icon: Route,
    label: `รอบ ${shortRouteCode(code)}`,
    mono: true,
    fullText: code,
    copyable: true,
  };
}

function formatPlannedDate(dateText: string, timeText?: string): string {
  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return [dateText, timeText].filter(Boolean).join(' ');
  const label = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  return timeText ? `${label} ${timeText}` : label;
}

function presentEvent(event: OrderActivityEvent): PresentedEvent {
  const { type, summary, details } = event;

  if (type === 'delivery_urgent_route_published' || type === 'delivery_plan_released') {
    const match = /^(?:ส่งด่วน|เผยแพร่) Route (\S+) ให้ ([^()]+?)(?:\s*\(ร่วมกับ (.+)\))?$/.exec(
      summary,
    );
    if (match) {
      const [, code, driver, coDrivers] = match;
      const planned = details
        ? /วันที่ส่ง:\s*(\S+)(?:\s+(\S+))?\s*· ลำดับ:\s*(\d+)/.exec(details)
        : null;
      const chips: EventChip[] = [];
      if (planned) {
        chips.push({
          Icon: CalendarClock,
          label: `นัดส่ง ${formatPlannedDate(planned[1], planned[2])}`,
        });
      }
      chips.push(routeChip(code));
      if (planned) chips.push({ label: `ลำดับที่ ${planned[3]}` });
      return {
        title:
          type === 'delivery_urgent_route_published' ? 'ส่งด่วนให้คนขับ' : 'เผยแพร่รอบส่งให้คนขับ',
        subtitle: coDrivers ? `${driver.trim()} · ร่วมกับ ${coDrivers}` : driver.trim(),
        chips,
        detailsText: planned ? undefined : details,
      };
    }
  }

  if (type === 'delivery_route_cancelled') {
    const match = /^ยกเลิก Route (\S+) \((.+)\)$/.exec(summary);
    if (match) {
      return {
        title: 'ยกเลิกรอบส่ง',
        subtitle: match[2],
        chips: [routeChip(match[1])],
        reason: details,
      };
    }
    return { title: 'ยกเลิกรอบส่ง', subtitle: summary, reason: details };
  }

  if (type === 'delivery_route_reassigned') {
    const code = /Route (\S+)/.exec(summary)?.[1];
    return {
      title: 'เปลี่ยนคนขับรอบส่ง',
      subtitle: details,
      chips: code ? [routeChip(code)] : undefined,
    };
  }

  if (type === 'order_import_edited' || type === 'order_details_updated') {
    const match = details ? /^ไฟล์ (.+) แถวที่ (\d+)$/.exec(details) : null;
    if (match) {
      return { title: 'แก้ไขข้อมูลออเดอร์', subtitle: `LINE import · แถวที่ ${match[2]}` };
    }
    return { title: summary, detailsText: details };
  }

  if (type === 'order_received') {
    const fromFile = /^นำเข้าออเดอร์จากไฟล์ (.+?)(?: แถวที่ (\d+))?$/.exec(summary);
    if (fromFile) {
      const chips: EventChip[] = [
        { Icon: FileSpreadsheet, label: fromFile[1], mono: true, fullText: fromFile[1] },
      ];
      if (fromFile[2]) chips.push({ label: `แถวที่ ${fromFile[2]}` });
      return { title: 'นำเข้าออเดอร์จาก LINE', subtitle: details, chips };
    }
    const fromOcr = /^นำเข้าออเดอร์จาก OCR รูป (.+)$/.exec(summary);
    if (fromOcr) {
      return {
        title: 'นำเข้าออเดอร์จาก OCR รูป',
        subtitle: details,
        chips: [{ Icon: FileSpreadsheet, label: fromOcr[1], mono: true, fullText: fromOcr[1] }],
      };
    }
    return { title: summary, detailsText: details };
  }

  if (type === 'order_confirmed') {
    const channel = details ? /^ช่องทาง: (.+)$/.exec(details) : null;
    return {
      title: summary,
      chips: channel ? [{ Icon: TruckIcon, label: channel[1] }] : undefined,
      detailsText: channel ? undefined : details,
    };
  }

  if (type === 'order_cancelled' || type === 'order_rejected') {
    const isReason = details?.startsWith('เหตุผล');
    return {
      title: summary,
      reason: isReason ? details : undefined,
      detailsText: isReason ? undefined : details,
    };
  }

  if (type === 'driver_assigned') {
    const match = /^มอบหมาย \S+ ให้ (.+)$/.exec(summary);
    if (match) return { title: 'มอบหมายคนขับ', subtitle: match[1], detailsText: details };
    return { title: summary, detailsText: details };
  }

  if (type === 'order_import_merged' || type === 'order_import_split') {
    return { title: summary, subtitle: details };
  }

  return { title: summary, detailsText: details };
}

// ---------------------------------------------------------------------------
// ยุบ event แก้ไขซ้ำที่ติดกัน (เช่นแก้จาก LINE import รัว ๆ) เหลือแถวเดียวกดกางดูได้
// ---------------------------------------------------------------------------

const GROUPABLE_TYPES: OrderActivityEventType[] = ['order_import_edited', 'order_details_updated'];

type TimelineEntry =
  | { kind: 'single'; event: OrderActivityEvent }
  | { kind: 'group'; events: OrderActivityEvent[] };

function groupEvents(events: OrderActivityEvent[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  for (const event of events) {
    const previous = entries[entries.length - 1];
    if (previous && GROUPABLE_TYPES.includes(event.type)) {
      const head = previous.kind === 'group' ? previous.events[0] : previous.event;
      if (
        head.type === event.type &&
        head.summary === event.summary &&
        (head.details ?? '') === (event.details ?? '')
      ) {
        if (previous.kind === 'group') {
          previous.events.push(event);
        } else {
          entries[entries.length - 1] = { kind: 'group', events: [previous.event, event] };
        }
        continue;
      }
    }
    entries.push({ kind: 'single', event });
  }
  return entries;
}

// ---------------------------------------------------------------------------

function formatActor(actor: OrderActivityActor): string {
  if (actor.kind === 'system') return actor.label;
  return `${actor.handler.name} · ${actor.handler.department}`;
}

function formatTime(at: string): string {
  return new Date(at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(at: string): string {
  const date = new Date(at);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  const formatted = date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (diffDays === 0) return `วันนี้ · ${formatted}`;
  if (diffDays === 1) return `เมื่อวาน · ${formatted}`;
  return formatted;
}

function ChipBadge({ chip }: { chip: EventChip }) {
  const className = cn(
    'inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground',
    chip.mono && 'font-mono text-[10.5px]',
  );
  const content = (
    <>
      {chip.Icon && <chip.Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{chip.label}</span>
    </>
  );
  if (chip.copyable && chip.fullText) {
    const fullText = chip.fullText;
    return (
      <button
        type="button"
        title={`${fullText} — กดเพื่อคัดลอก`}
        onClick={() => {
          void navigator.clipboard.writeText(fullText);
          toast.success('คัดลอกโค้ดรอบส่งแล้ว', { description: fullText });
        }}
        className={cn(className, 'cursor-pointer transition-colors hover:bg-muted')}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={className} title={chip.fullText}>
      {content}
    </span>
  );
}

function ChangeRow({ change }: { change: OrderActivityChange }) {
  const before = change.before ?? '—';
  const after = change.after ?? '—';
  return (
    <div className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-[11px]">
      <span className="shrink-0 font-medium text-muted-foreground">{change.label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <span className="line-through text-muted-foreground/80 wrap-break-word">{before}</span>
        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground wrap-break-word">{after}</span>
      </div>
    </div>
  );
}

function EventBody({ event, presented }: { event: OrderActivityEvent; presented: PresentedEvent }) {
  return (
    <>
      {event.actor.kind === 'operator' && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{formatActor(event.actor)}</div>
      )}
      {presented.subtitle && (
        <div className="mt-0.5 text-xs text-muted-foreground">{presented.subtitle}</div>
      )}
      {presented.chips && presented.chips.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {presented.chips.map((chip, idx) => (
            <ChipBadge key={idx} chip={chip} />
          ))}
        </div>
      )}
      {presented.reason && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive">
          {presented.reason}
        </div>
      )}
      {presented.detailsText && (
        <div className="mt-1 text-[11px] text-muted-foreground">{presented.detailsText}</div>
      )}
      {event.changes && event.changes.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {event.changes.map((change, idx) => (
            <ChangeRow key={`${change.field}-${idx}`} change={change} />
          ))}
        </div>
      )}
    </>
  );
}

function TimelineIcon({ type }: { type: OrderActivityEventType }) {
  // API อาจเพิ่ม activity type ใหม่ก่อน frontend deploy — timeline ต้องไม่ทำให้ทั้งหน้าล่ม
  const config = ICON_BY_TYPE[type] ?? FALLBACK_ICON_CONFIG;
  const Icon = config.Icon;
  return (
    <span
      className={cn(
        'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1',
        TONE_CLASSES[config.tone],
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function TimelineItem({ event, isLast }: { event: OrderActivityEvent; isLast: boolean }) {
  const presented = presentEvent(event);
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
        />
      )}
      <TimelineIcon type={event.type} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 text-sm font-medium leading-snug">{presented.title}</span>
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            {formatTime(event.at)}
          </span>
        </div>
        <EventBody event={event} presented={presented} />
      </div>
    </li>
  );
}

function TimelineGroupItem({
  events,
  isLast,
}: {
  events: OrderActivityEvent[]; // เรียงใหม่ → เก่า
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const newest = events[0];
  const oldest = events[events.length - 1];
  const presented = presentEvent(newest);
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
        />
      )}
      <TimelineIcon type={newest.type} />
      <div className="min-w-0 flex-1 pt-0.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-baseline gap-2 text-left"
        >
          <span className="min-w-0 text-sm font-medium leading-snug">
            {presented.title}{' '}
            <span className="font-normal text-muted-foreground">· {events.length} ครั้ง</span>
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            {formatTime(oldest.at)} – {formatTime(newest.at)}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
        {presented.subtitle && (
          <div className="mt-0.5 text-xs text-muted-foreground">{presented.subtitle}</div>
        )}
        {open && (
          <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
            {events.map((event, idx) => (
              <div key={event.id}>
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span>แก้ไขครั้งที่ {events.length - idx}</span>
                  <span className="ml-auto shrink-0 text-[11px]">{formatTime(event.at)}</span>
                </div>
                {event.actor.kind === 'operator' && (
                  <div className="text-[11px] text-muted-foreground">
                    {formatActor(event.actor)}
                  </div>
                )}
                {event.changes && event.changes.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {event.changes.map((change, changeIdx) => (
                      <ChangeRow key={`${change.field}-${changeIdx}`} change={change} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export function OrderTimeline({
  order,
  className,
  emptyHint = 'ยังไม่มีกิจกรรม',
  title = 'Timeline / Activity Log',
  description,
  compact,
}: {
  order: Order | null | undefined;
  className?: string;
  emptyHint?: string;
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  if (!order) {
    return (
      <Card className={className}>
        <CardHeader className={compact ? 'pb-3' : undefined}>
          <CardTitle className="text-sm">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
            <Send className="mx-auto mb-2 h-4 w-4" />
            เลือกออเดอร์เพื่อดูประวัติกิจกรรม
          </div>
        </CardContent>
      </Card>
    );
  }

  const events = compactActivityLog(
    [...(order.activityLog ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
  )
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));

  const entries = groupEvents(events);
  const sections: { label: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const at = entry.kind === 'single' ? entry.event.at : entry.events[0].at;
    const label = dayLabel(at);
    const lastSection = sections[sections.length - 1];
    if (lastSection && lastSection.label === label) {
      lastSection.entries.push(entry);
    } else {
      sections.push({ label, entries: [entry] });
    }
  }

  return (
    <Card className={className}>
      <CardHeader className={compact ? 'pb-3' : undefined}>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="flex w-full items-start justify-between gap-2 text-left"
        >
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {events.length} รายการ
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </span>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent>
          {events.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
              {emptyHint}
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((section) => (
                <div key={section.label}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {section.label}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>
                  <ul className="relative">
                    {section.entries.map((entry, idx) =>
                      entry.kind === 'single' ? (
                        <TimelineItem
                          key={entry.event.id}
                          event={entry.event}
                          isLast={idx === section.entries.length - 1}
                        />
                      ) : (
                        <TimelineGroupItem
                          key={entry.events[0].id}
                          events={entry.events}
                          isLast={idx === section.entries.length - 1}
                        />
                      ),
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
