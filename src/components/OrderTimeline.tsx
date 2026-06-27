import {
  ArrowRight,
  Ban,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cog,
  FileSpreadsheet,
  Inbox,
  Mailbox,
  PackageCheck,
  Pencil,
  RefreshCcw,
  Route,
  Send,
  ShieldCheck,
  Sparkles,
  Truck as TruckIcon,
  UserCog,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Order,
  OrderActivityActor,
  OrderActivityChange,
  OrderActivityEvent,
  OrderActivityEventType,
} from '@/data/mock';
import { cn } from '@/lib/utils';

type IconConfig = {
  Icon: typeof Inbox;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted';
};

const ICON_BY_TYPE: Record<OrderActivityEventType, IconConfig> = {
  order_received: { Icon: Inbox, tone: 'info' },
  order_created_from_internal_chat: { Icon: Bot, tone: 'info' },
  parsing_completed: { Icon: Sparkles, tone: 'info' },
  customer_updated: { Icon: Pencil, tone: 'neutral' },
  shipping_method_changed: { Icon: TruckIcon, tone: 'neutral' },
  order_confirmed: { Icon: CheckCircle2, tone: 'success' },
  driver_assigned: { Icon: UserCog, tone: 'neutral' },
  driver_auto_assigned: { Icon: Sparkles, tone: 'info' },
  delivery_started: { Icon: Route, tone: 'info' },
  delivery_submitted: { Icon: ClipboardCheck, tone: 'warning' },
  delivery_proof_revised: { Icon: Pencil, tone: 'warning' },
  delivery_confirmed: { Icon: CheckCircle2, tone: 'success' },
  delivery_completed: { Icon: PackageCheck, tone: 'success' },
  postal_batch_exported: { Icon: FileSpreadsheet, tone: 'info' },
  postal_tracking_saved: { Icon: ClipboardCheck, tone: 'neutral' },
  postal_handed_over: { Icon: Mailbox, tone: 'info' },
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
  delivery_urgent_route_published: { Icon: Route, tone: 'danger' },
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

function formatActor(actor: OrderActivityActor): string {
  if (actor.kind === 'system') return actor.label;
  return `${actor.handler.name} · ${actor.handler.department}`;
}

function ActorIcon({ actor }: { actor: OrderActivityActor }) {
  if (actor.kind === 'system') {
    return <Cog className="h-3 w-3" />;
  }
  return null;
}

function formatTimestamp(at: string): string {
  const date = new Date(at);
  return date.toLocaleString('th', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
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

function TimelineItem({ event, isLast }: { event: OrderActivityEvent; isLast: boolean }) {
  // API อาจเพิ่ม activity type ใหม่ก่อน frontend deploy — timeline ต้องไม่ทำให้ทั้งหน้าล่ม
  const config = ICON_BY_TYPE[event.type] ?? FALLBACK_ICON_CONFIG;
  const Icon = config.Icon;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
        />
      )}
      <span
        className={cn(
          'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1',
          TONE_CLASSES[config.tone],
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium leading-snug">{event.summary}</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTimestamp(event.at)}
          </span>
        </div>
        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ActorIcon actor={event.actor} />
          {formatActor(event.actor)}
        </div>
        {event.details && (
          <div className="mt-1 text-[11px] text-muted-foreground">{event.details}</div>
        )}
        {event.changes && event.changes.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {event.changes.map((change, idx) => (
              <ChangeRow key={`${change.field}-${idx}`} change={change} />
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

  const events = [...(order.activityLog ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <Card className={className}>
      <CardHeader className={compact ? 'pb-3' : undefined}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {events.length} รายการ
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center text-xs text-muted-foreground">
            {emptyHint}
          </div>
        ) : (
          <ul className="relative">
            {events.map((event, idx) => (
              <TimelineItem key={event.id} event={event} isLast={idx === events.length - 1} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
