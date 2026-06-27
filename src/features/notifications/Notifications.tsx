import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileSearch,
  MessageCircle,
  RotateCcw,
  Search,
  Send,
  Smartphone,
} from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { statusLabel, type Order } from '@/data/mock';
import { maskPhone } from '@/lib/customerTracking';
import {
  NOTIFICATION_TEMPLATES,
  channelLabel,
  defaultChannelForOrder,
  getNotifyTriage,
  getTemplateLabel,
  isNotifyNeeded,
  notificationStatusLabel,
  notifyTriagePriority,
  recipientForChannel,
  renderNotificationMessage,
  suggestTemplateForStatus,
  type CustomerNotification,
  type NotificationChannel,
  type NotificationStatus,
  type NotificationTemplateKey,
  type NotifyTriage,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { useRetailStore } from '@/state/retailStore';
import { toast } from 'sonner';
import { NotificationDetailDrawer } from '@/features/notifications/NotificationDetailDrawer';

// ออเดอร์ที่ยังไม่เดินเข้า flow แจ้งลูกค้า (ยกเลิกไปแล้ว) ไม่ต้องโชว์
const HIDDEN_STATUSES = new Set<Order['status']>(['cancelled']);

const statusBadgeVariant: Partial<Record<NotificationStatus, BadgeProps['variant']>> = {
  sent: 'success',
  queued: 'warning',
  failed: 'destructive',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function isRecent(iso: string) {
  return Date.now() - new Date(iso).getTime() < RECENT_WINDOW_MS;
}

/** เวลาแบบสัมพัทธ์ภาษาไทย — "12 นาที", "1 ชม.", "เมื่อวาน"; เกิน 7 วันคืนเป็นวันที่ */
function relativeTime(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ชม.`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'เมื่อวาน';
  if (days < 7) return `${days} วัน`;
  return formatTime(iso);
}

type ListFilter = 'todo' | 'new' | 'all';
type HistoryFilter = 'all' | NotificationStatus;

const HISTORY_PAGE_SIZE = 25;

/** ข้อความเหตุผลที่ออเดอร์ยังต้องแจ้งลูกค้า (โชว์ในแต่ละแถว) */
function triageReason(triage: NotifyTriage): string {
  switch (triage.kind) {
    case 'never':
      return 'ยังไม่เคยแจ้งลูกค้า';
    case 'status_advanced':
      return `สถานะขยับ: ${getTemplateLabel(triage.from)} → ${getTemplateLabel(triage.to)}`;
    case 'failed':
      return `ส่งไม่สำเร็จ${triage.errorCode ? ` (${triage.errorCode})` : ''} · ต้องส่งซ้ำ`;
    case 'done':
      return 'แจ้งครบแล้ว';
  }
}

function latestNotificationsByOrder(notifications: CustomerNotification[]) {
  const latest = new Map<string, CustomerNotification>();

  for (const record of notifications) {
    const current = latest.get(record.orderId);
    if (!current || record.sentAt.localeCompare(current.sentAt) > 0) {
      latest.set(record.orderId, record);
    }
  }

  return latest;
}

/** key สำหรับจัดกลุ่ม = วันที่ (YYYY-MM-DD) ตาม local time */
function dateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** หัวกลุ่มวันที่ — "วันนี้" / "เมื่อวาน" / "24 เม.ย. 2026" */
function dateGroupLabel(iso: string) {
  const today = dateKey(new Date().toISOString());
  const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const key = dateKey(iso);
  if (key === today) return 'วันนี้';
  if (key === yesterday) return 'เมื่อวาน';
  return new Date(iso).toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function groupOrdersByDate(orders: Order[]) {
  const groups = new Map<string, { key: string; label: string; orders: Order[] }>();

  for (const order of orders) {
    const key = dateKey(order.receivedAt);
    const existing = groups.get(key);
    if (existing) {
      existing.orders.push(order);
    } else {
      groups.set(key, { key, label: dateGroupLabel(order.receivedAt), orders: [order] });
    }
  }

  return Array.from(groups.values());
}

export function NotificationsPage() {
  const { orders, notifications, sendCustomerNotifications } = useRetailStore();

  const eligibleOrders = useMemo(
    () =>
      orders
        .filter((order) => !HIDDEN_STATUSES.has(order.status) && order.customer.phone)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [orders],
  );

  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channel, setChannel] = useState<NotificationChannel | null>(null);
  const [templateKey, setTemplateKey] = useState<NotificationTemplateKey | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>('todo');
  const [showDone, setShowDone] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historyPage, setHistoryPage] = useState(1);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligibleOrders;
    return eligibleOrders.filter(
      (order) =>
        order.code.toLowerCase().includes(q) ||
        order.customer.name.toLowerCase().includes(q) ||
        order.customer.phone.includes(q),
    );
  }, [eligibleOrders, query]);

  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const selectedOrders = useMemo(
    () => selectedIds.map((id) => orderById.get(id)).filter((order): order is Order => !!order),
    [orderById, selectedIds],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primaryOrder = selectedOrders[0] ?? null;

  const allSelectedHaveLine =
    selectedOrders.length > 0 && selectedOrders.every((order) => order.lineContact);
  const defaultBatchChannel =
    selectedOrders.length === 1 && primaryOrder
      ? defaultChannelForOrder(primaryOrder)
      : allSelectedHaveLine
        ? 'line'
        : 'sms';
  const activeChannel = channel ?? defaultBatchChannel;
  const activeTemplate =
    templateKey ?? (primaryOrder ? suggestTemplateForStatus(primaryOrder.status) : 'tracking_link');

  const preview = useMemo(
    () => (primaryOrder ? renderNotificationMessage(primaryOrder, activeTemplate) : null),
    [primaryOrder, activeTemplate],
  );

  const latestByOrder = useMemo(() => latestNotificationsByOrder(notifications), [notifications]);

  // triage แต่ละออเดอร์ (ค้างแจ้ง/ใหม่/แจ้งครบ) จาก notification ล่าสุด
  const triageByOrder = useMemo(() => {
    const map = new Map<string, NotifyTriage>();
    for (const order of eligibleOrders) {
      map.set(order.id, getNotifyTriage(order, latestByOrder.get(order.id)));
    }
    return map;
  }, [eligibleOrders, latestByOrder]);

  // ตัวนับสำหรับ chip filter (อิงทั้ง eligible ไม่ผูกกับช่องค้นหา)
  const todoCount = useMemo(
    () => eligibleOrders.filter((order) => isNotifyNeeded(triageByOrder.get(order.id)!)).length,
    [eligibleOrders, triageByOrder],
  );
  const newCount = useMemo(
    () => eligibleOrders.filter((order) => isRecent(order.receivedAt)).length,
    [eligibleOrders],
  );

  // list ที่แสดงจริง = ผลค้นหา ∩ chip filter
  const chipFilteredOrders = useMemo(() => {
    if (listFilter === 'todo') {
      return filteredOrders.filter((order) => isNotifyNeeded(triageByOrder.get(order.id)!));
    }
    if (listFilter === 'new') {
      return filteredOrders.filter((order) => isRecent(order.receivedAt));
    }
    return filteredOrders;
  }, [filteredOrders, listFilter, triageByOrder]);

  // แยกกลุ่ม "ต้องแจ้ง" (เรียงตามความด่วน) กับ "แจ้งครบแล้ว" (จาง/พับได้)
  const needsOrders = useMemo(
    () =>
      chipFilteredOrders
        .filter((order) => isNotifyNeeded(triageByOrder.get(order.id)!))
        .sort((a, b) => {
          const pa = notifyTriagePriority(triageByOrder.get(a.id)!);
          const pb = notifyTriagePriority(triageByOrder.get(b.id)!);
          if (pa !== pb) return pa - pb;
          return b.receivedAt.localeCompare(a.receivedAt);
        }),
    [chipFilteredOrders, triageByOrder],
  );
  const doneOrders = useMemo(
    () => chipFilteredOrders.filter((order) => !isNotifyNeeded(triageByOrder.get(order.id)!)),
    [chipFilteredOrders, triageByOrder],
  );

  const recentNotifications = useMemo(
    () => [...notifications].sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [notifications],
  );
  const sentNotifications = useMemo(
    () => recentNotifications.filter((record) => record.status === 'sent'),
    [recentNotifications],
  );
  const failedNotifications = useMemo(
    () => recentNotifications.filter((record) => record.status === 'failed'),
    [recentNotifications],
  );
  const queuedNotifications = useMemo(
    () => recentNotifications.filter((record) => record.status === 'queued'),
    [recentNotifications],
  );
  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return recentNotifications.filter((record) => {
      if (historyFilter !== 'all' && record.status !== historyFilter) return false;
      if (!q) return true;

      const provider = record.providerResponse;
      const searchable = [
        record.orderCode,
        record.customerName,
        record.recipient,
        channelLabel[record.channel],
        getTemplateLabel(record.templateKey),
        notificationStatusLabel[record.status],
        provider?.messageId,
        provider?.errorCode,
        provider?.errorMessage,
        provider?.provider,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(q);
    });
  }, [historyFilter, historyQuery, recentNotifications]);
  const historyPageCount = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedHistory = useMemo(() => {
    const start = (currentHistoryPage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [currentHistoryPage, filteredHistory]);
  const pendingOrders = useMemo(
    () =>
      eligibleOrders.filter((order) => {
        const latest = latestByOrder.get(order.id);
        return !latest || latest.status !== 'sent';
      }),
    [eligibleOrders, latestByOrder],
  );
  const pendingGroups = useMemo(() => groupOrdersByDate(pendingOrders), [pendingOrders]);

  // รายการที่เห็นบนจอจริง = กลุ่มต้องแจ้ง + กลุ่มแจ้งครบ (เฉพาะตอนกางดู)
  const displayedOrders = useMemo(
    () => [...needsOrders, ...(showDone ? doneOrders : [])],
    [needsOrders, doneOrders, showDone],
  );

  const allVisibleSelected =
    displayedOrders.length > 0 && displayedOrders.every((order) => selectedIdSet.has(order.id));

  function resetComposeDefaults() {
    setChannel(null);
    setTemplateKey(null);
  }

  function toggleOrder(order: Order, next?: boolean) {
    setSelectedIds((current) => {
      const exists = current.includes(order.id);
      const shouldSelect = next ?? !exists;
      if (shouldSelect && !exists) return [...current, order.id];
      if (!shouldSelect && exists) return current.filter((id) => id !== order.id);
      return current;
    });
    resetComposeDefaults();
  }

  function selectOnly(orderId: string) {
    setSelectedIds([orderId]);
    resetComposeDefaults();
  }

  function selectMany(orderIds: string[]) {
    setSelectedIds(Array.from(new Set(orderIds)));
    resetComposeDefaults();
  }

  function togglePendingGroup(orderIds: string[]) {
    const isGroupSelected = orderIds.every((id) => selectedIdSet.has(id));
    if (isGroupSelected) {
      setSelectedIds((current) => current.filter((id) => !orderIds.includes(id)));
    } else {
      selectMany([...selectedIds, ...orderIds]);
    }
    resetComposeDefaults();
  }

  function clearSelection() {
    setSelectedIds([]);
    resetComposeDefaults();
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const visibleIds = new Set(displayedOrders.map((order) => order.id));
      setSelectedIds((current) => current.filter((id) => !visibleIds.has(id)));
    } else {
      selectMany([...selectedIds, ...displayedOrders.map((order) => order.id)]);
    }
    resetComposeDefaults();
  }

  function handleSend() {
    if (selectedOrders.length === 0) return;

    const sentCount = sendCustomerNotifications(
      selectedOrders.map((order) => order.id),
      {
        channel: activeChannel,
        templateKey: activeTemplate,
      },
    );

    if (sentCount === 0) {
      toast.error('ไม่พบออเดอร์ที่ส่งแจ้งเตือนได้');
      return;
    }

    toast.success(`ส่ง${channelLabel[activeChannel]}แจ้งลูกค้าแล้ว ${sentCount} รายการ`, {
      description: getTemplateLabel(activeTemplate),
    });
  }

  function createSampleHistory() {
    const sampleIds = pendingOrders.slice(0, 5).map((order) => order.id);
    if (sampleIds.length === 0) return;

    const sentCount = sendCustomerNotifications(sampleIds, {
      channel: 'sms',
      templateKey: 'tracking_link',
    });

    if (sentCount > 0) {
      toast.success(`สร้างประวัติการส่งตัวอย่างแล้ว ${sentCount} รายการ`);
    }
  }

  const inspectNotification = useMemo(
    () => notifications.find((record) => record.id === inspectId) ?? null,
    [notifications, inspectId],
  );

  function handleResendFromDrawer(orderId: string) {
    selectOnly(orderId);
    setInspectId(null);
  }

  function renderOrderRow(order: Order, opts?: { dimmed?: boolean }) {
    const isSelected = selectedIdSet.has(order.id);
    const triage = triageByOrder.get(order.id)!;
    const needs = isNotifyNeeded(triage);
    const isNew = isRecent(order.receivedAt);
    const ReasonIcon =
      triage.kind === 'failed'
        ? RotateCcw
        : triage.kind === 'status_advanced'
          ? ArrowUpRight
          : BellRing;

    return (
      <li key={order.id}>
        <button
          type="button"
          onClick={() => toggleOrder(order)}
          className={cn(
            'w-full rounded-lg border p-3 text-left transition-colors',
            isSelected
              ? 'border-primary bg-primary/5'
              : needs
                ? 'border-border border-l-2 border-l-destructive bg-destructive/5 hover:bg-destructive/10'
                : 'border-border hover:bg-muted',
            opts?.dimmed && 'opacity-60',
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border',
                isSelected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted-foreground/40 bg-background',
              )}
            >
              {isSelected && <Check className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="font-medium">{order.code}</span>
                {isNew && (
                  <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                    ใหม่
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {relativeTime(order.receivedAt)}
                </span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {order.customer.name}
                </span>
                <Badge variant="secondary" className="shrink-0">
                  {statusLabel[order.status]}
                </Badge>
              </span>
              {needs ? (
                <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <ReasonIcon className="size-3.5 shrink-0" />
                  {triageReason(triage)}
                </span>
              ) : (
                <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="size-3.5 shrink-0 text-success" />
                  แจ้งครบแล้ว
                </span>
              )}
            </span>
          </div>
        </button>
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BellRing className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">แจ้งเตือนลูกค้า</h1>
          <p className="text-sm text-muted-foreground">
            ส่งลิงก์ติดตามและอัปเดตสถานะให้ลูกค้าผ่าน LINE / SMS — กดส่งเองทุกครั้ง
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">เลือกออเดอร์</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={toggleAllVisible}
                  disabled={displayedOrders.length === 0}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="size-4" />
                  {allVisibleSelected ? 'ยกเลิกที่แสดง' : 'เลือกที่แสดง'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  disabled={selectedIds.length === 0}
                >
                  ล้าง
                </Button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาด้วยรหัสออเดอร์ / ชื่อ / เบอร์"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'todo', label: 'ต้องแจ้ง', count: todoCount, tone: 'danger' },
                  { key: 'new', label: 'ใหม่วันนี้', count: newCount, tone: 'warning' },
                  { key: 'all', label: 'ทั้งหมด', count: eligibleOrders.length, tone: 'muted' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setListFilter(chip.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    listFilter === chip.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {chip.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px]',
                      chip.tone === 'danger' && 'bg-destructive/15 text-destructive',
                      chip.tone === 'warning' && 'bg-warning/15 text-warning',
                      chip.tone === 'muted' && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {chip.count}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              เลือกแล้ว {selectedOrders.length} รายการ
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {needsOrders.length === 0 && doneOrders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {listFilter === 'todo' ? 'ไม่มีรายการค้างแจ้ง — เคลียร์หมดแล้ว' : 'ไม่พบออเดอร์'}
              </p>
            ) : (
              <div className="max-h-[28rem] space-y-3 overflow-auto pr-1">
                {needsOrders.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      ต้องแจ้งลูกค้า ({needsOrders.length})
                    </p>
                    <ul className="space-y-2">
                      {needsOrders.map((order) => renderOrderRow(order))}
                    </ul>
                  </div>
                )}
                {doneOrders.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowDone((value) => !value)}
                      className="flex w-full items-center gap-1.5 border-t pt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {showDone ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      แจ้งครบแล้ว ({doneOrders.length}) — สถานะตรงกับที่แจ้งล่าสุด
                    </button>
                    {showDone && (
                      <ul className="space-y-2">
                        {doneOrders.map((order) => renderOrderRow(order, { dimmed: true }))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ร่างข้อความ</CardTitle>
          </CardHeader>
          <CardContent>
            {!primaryOrder ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                เลือกออเดอร์ทางซ้ายเพื่อร่างข้อความแจ้งเตือน
              </p>
            ) : (
              <div className="space-y-5">
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {primaryOrder.code}
                      {selectedOrders.length > 1 ? ` +${selectedOrders.length - 1}` : ''}
                    </span>
                    <Badge variant="secondary">{statusLabel[primaryOrder.status]}</Badge>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {selectedOrders.length === 1
                      ? primaryOrder.customer.name
                      : `ส่งพร้อมกัน ${selectedOrders.length} รายการ`}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">ช่องทาง</p>
                  <div className="flex gap-2">
                    {(['line', 'sms'] as NotificationChannel[]).map((ch) => {
                      const Icon = ch === 'line' ? MessageCircle : Smartphone;
                      const disabled = ch === 'line' && !allSelectedHaveLine;
                      return (
                        <Button
                          key={ch}
                          type="button"
                          variant={activeChannel === ch ? 'default' : 'outline'}
                          size="sm"
                          disabled={disabled}
                          onClick={() => setChannel(ch)}
                          className="gap-1.5"
                        >
                          <Icon className="size-4" />
                          {channelLabel[ch]}
                        </Button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedOrders.length === 1
                      ? `ส่งถึง: ${recipientForChannel(primaryOrder, activeChannel)}${
                          activeChannel === 'sms'
                            ? ` (${maskPhone(primaryOrder.customer.phone)})`
                            : ''
                        }`
                      : activeChannel === 'line'
                        ? `ส่ง LINE ให้ลูกค้า ${selectedOrders.length} รายการ`
                        : `ส่ง SMS ให้ลูกค้า ${selectedOrders.length} รายการ`}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">เทมเพลต</p>
                  <div className="flex flex-wrap gap-2">
                    {NOTIFICATION_TEMPLATES.map((template) => (
                      <Button
                        key={template.key}
                        type="button"
                        variant={activeTemplate === template.key ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTemplateKey(template.key)}
                      >
                        {template.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    ตัวอย่างข้อความ{selectedOrders.length > 1 ? ' (รายการแรก)' : ''}
                  </p>
                  <div className="whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm">
                    {preview?.message}
                  </div>
                </div>

                <Button type="button" onClick={handleSend} className="w-full gap-2">
                  <Send className="size-4" />
                  ส่ง{channelLabel[activeChannel]}แจ้งลูกค้า {selectedOrders.length} รายการ
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">สถานะการแจ้งเตือน</CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border bg-destructive/5 px-2.5 py-1 font-medium text-destructive">
                ค้างส่ง {pendingOrders.length}
              </span>
              <span className="rounded-md border bg-success/5 px-2.5 py-1 font-medium text-success">
                ส่งสำเร็จ {sentNotifications.length}
              </span>
              <span className="rounded-md border bg-muted px-2.5 py-1 font-medium text-muted-foreground">
                ประวัติ {recentNotifications.length}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="flex h-auto w-full flex-wrap justify-start">
              <TabsTrigger value="pending">
                ยังไม่ส่ง / ต้องส่งซ้ำ ({pendingOrders.length})
              </TabsTrigger>
              <TabsTrigger value="sent">ประวัติการส่ง ({recentNotifications.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="pending">
              {pendingOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  ไม่มีรายการค้างส่งแจ้งเตือน
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <div>
                      <p className="text-sm font-medium">
                        ยังไม่ส่ง / ต้องส่งซ้ำ {pendingOrders.length} ออเดอร์
                      </p>
                      <p className="text-xs text-muted-foreground">
                        จัดกลุ่มตามวันที่รับออเดอร์ — แต่ละแถวคือ 1 ออเดอร์ของลูกค้า 1 ราย
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => selectMany(pendingOrders.map((order) => order.id))}
                        className="gap-1.5"
                      >
                        <CheckCircle2 className="size-4" />
                        เลือกทั้งหมด
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSend}
                        disabled={selectedOrders.length === 0}
                        className="gap-1.5"
                      >
                        <Send className="size-4" />
                        ส่งออเดอร์ที่เลือก
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {pendingGroups.map((group) => {
                      const groupIds = group.orders.map((order) => order.id);
                      const selectedInGroup = groupIds.filter((id) => selectedIdSet.has(id)).length;
                      const isGroupSelected = selectedInGroup === groupIds.length;

                      return (
                        <section key={group.key} className="overflow-hidden rounded-md border">
                          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">{group.label}</p>
                              <Badge variant="secondary">{group.orders.length} ออเดอร์</Badge>
                              {selectedInGroup > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  เลือก {selectedInGroup}/{group.orders.length}
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant={isGroupSelected ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={() => togglePendingGroup(groupIds)}
                              className="gap-1.5"
                            >
                              <CheckCircle2 className="size-4" />
                              {isGroupSelected ? 'ยกเลิกทั้งวัน' : 'เลือกทั้งวัน'}
                            </Button>
                          </div>
                          <ul className="divide-y">
                            {group.orders.map((order) => {
                              const latest = latestByOrder.get(order.id);
                              const isSelected = selectedIdSet.has(order.id);

                              return (
                                <li
                                  key={order.id}
                                  className={cn(
                                    'grid gap-2 px-3 py-2 text-sm md:grid-cols-[1.75rem_minmax(12rem,1fr)_7rem_auto] md:items-center',
                                    isSelected && 'bg-primary/5',
                                  )}
                                >
                                  <button
                                    type="button"
                                    aria-label={`เลือก ${order.code}`}
                                    onClick={() => toggleOrder(order)}
                                    className={cn(
                                      'flex size-5 items-center justify-center rounded border md:justify-self-center',
                                      isSelected
                                        ? 'border-primary bg-primary text-primary-foreground'
                                        : 'border-muted-foreground/40 bg-background',
                                    )}
                                  >
                                    {isSelected && <Check className="size-3.5" />}
                                  </button>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-foreground">
                                      {order.customer.name}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {maskPhone(order.customer.phone)} · {order.code}
                                    </p>
                                  </div>
                                  {latest ? (
                                    <Badge
                                      variant={statusBadgeVariant[latest.status] ?? 'secondary'}
                                    >
                                      {notificationStatusLabel[latest.status]}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">ยังไม่ส่ง</Badge>
                                  )}
                                  <div className="flex flex-wrap justify-end gap-2">
                                    {latest && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setInspectId(latest.id)}
                                        className="gap-1.5"
                                      >
                                        <FileSearch className="size-4" />
                                        รายละเอียด
                                      </Button>
                                    )}
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => selectOnly(order.id)}
                                      className="gap-1.5"
                                    >
                                      <RotateCcw className="size-4" />
                                      เลือกส่ง
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="sent">
              {recentNotifications.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center">
                  <p className="text-sm font-medium">ยังไม่มีประวัติการส่งแจ้งเตือน</p>
                  <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
                    ตัวเลขค้างส่งมาจากรายการออเดอร์ที่ยังต้องแจ้งลูกค้า ส่วนประวัติการส่งจะเกิดขึ้น
                    หลังจากกดส่งแล้วเท่านั้น
                  </p>
                  {pendingOrders.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={createSampleHistory}
                      className="mt-4 gap-1.5"
                    >
                      <Send className="size-4" />
                      สร้างประวัติตัวอย่าง 5 รายการ
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-sm font-medium">ประวัติการส่งทั้งหมด</p>
                    <p className="text-xs text-muted-foreground">
                      เก็บทุก attempt ทั้งสำเร็จ รอส่ง และส่งไม่สำเร็จ กดรายละเอียดเพื่อดู
                      request/response จาก provider
                    </p>
                  </div>

                  <div className="space-y-3 rounded-md border p-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={historyQuery}
                        onChange={(event) => {
                          setHistoryQuery(event.target.value);
                          setHistoryPage(1);
                        }}
                        placeholder="ค้นหาประวัติด้วย order / ลูกค้า / เบอร์ / messageId / errorCode"
                        className="pl-9"
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { key: 'all', label: 'ทั้งหมด', count: recentNotifications.length },
                            { key: 'sent', label: 'ส่งสำเร็จ', count: sentNotifications.length },
                            {
                              key: 'failed',
                              label: 'ไม่สำเร็จ',
                              count: failedNotifications.length,
                            },
                            { key: 'queued', label: 'รอส่ง', count: queuedNotifications.length },
                          ] as const
                        ).map((filter) => (
                          <Button
                            key={filter.key}
                            type="button"
                            variant={historyFilter === filter.key ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setHistoryFilter(filter.key);
                              setHistoryPage(1);
                            }}
                          >
                            {filter.label} ({filter.count})
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        แสดง{' '}
                        {filteredHistory.length === 0
                          ? 0
                          : (currentHistoryPage - 1) * HISTORY_PAGE_SIZE + 1}
                        -{Math.min(currentHistoryPage * HISTORY_PAGE_SIZE, filteredHistory.length)}{' '}
                        จาก {filteredHistory.length} รายการ
                      </p>
                    </div>
                  </div>

                  {filteredHistory.length === 0 ? (
                    <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                      ไม่พบประวัติการส่งตามเงื่อนไขที่เลือก
                    </p>
                  ) : (
                    <>
                      <ul className="divide-y rounded-md border">
                        {pagedHistory.map((record) => {
                          const order = orderById.get(record.orderId);
                          const provider = record.providerResponse;
                          return (
                            <li
                              key={record.id}
                              className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[minmax(10rem,1fr)_5rem_minmax(8rem,0.8fr)_minmax(9rem,1fr)_8rem_auto] lg:items-center"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium">{record.orderCode}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {record.customerName}
                                </p>
                              </div>
                              <Badge variant="outline">{channelLabel[record.channel]}</Badge>
                              <span className="text-muted-foreground">
                                {getTemplateLabel(record.templateKey)}
                              </span>
                              <div className="min-w-0 text-muted-foreground">
                                <p className="truncate">
                                  {record.channel === 'sms'
                                    ? maskPhone(record.recipient)
                                    : record.recipient}
                                </p>
                                {provider && (
                                  <p className="truncate font-mono text-xs">
                                    {provider.messageId || provider.errorCode || 'no-message-id'}
                                  </p>
                                )}
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  {formatTime(record.sentAt)}
                                </p>
                                {provider && (
                                  <Badge
                                    variant={provider.httpStatus < 300 ? 'success' : 'destructive'}
                                  >
                                    HTTP {provider.httpStatus}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap justify-end gap-2">
                                <Badge variant={statusBadgeVariant[record.status] ?? 'secondary'}>
                                  {notificationStatusLabel[record.status]}
                                </Badge>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setInspectId(record.id)}
                                  className="gap-1.5"
                                >
                                  <FileSearch className="size-4" />
                                  รายละเอียด
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!order}
                                  onClick={() => selectOnly(record.orderId)}
                                  className="gap-1.5"
                                >
                                  <RotateCcw className="size-4" />
                                  ส่งซ้ำ
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {historyPageCount > 1 && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            หน้า {currentHistoryPage} / {historyPageCount}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={currentHistoryPage <= 1}
                              onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                            >
                              ก่อนหน้า
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={currentHistoryPage >= historyPageCount}
                              onClick={() =>
                                setHistoryPage((page) => Math.min(historyPageCount, page + 1))
                              }
                            >
                              ถัดไป
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <NotificationDetailDrawer
        notification={inspectNotification}
        canResend={!!inspectNotification && orderById.has(inspectNotification.orderId)}
        onClose={() => setInspectId(null)}
        onResend={handleResendFromDrawer}
      />
    </div>
  );
}
