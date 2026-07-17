import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  Copy,
  Download,
  History,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  MonitorOff,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCog,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchRetailAuditLogs, type RetailAuditLog } from '@/lib/retailApi';
import { downloadCsv } from '@/lib/export';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const PAGE_SIZE = 50;
// login ติด ๆ กันของคนเดิมภายในช่วงนี้ ยุบเป็นแถวเดียว
const LOGIN_GROUP_WINDOW_MS = 30 * 60 * 1000;

type ActionTone = 'success' | 'muted' | 'info' | 'warning' | 'danger';
type ActionCategory = 'session' | 'user' | 'role' | 'security_policy';

type ActionMeta = {
  label: string;
  icon: LucideIcon;
  tone: ActionTone;
  category: ActionCategory;
  security?: boolean;
};

const ACTION_META: Record<string, ActionMeta> = {
  'auth.login': { label: 'เข้าสู่ระบบ', icon: LogIn, tone: 'success', category: 'session' },
  'auth.logout': { label: 'ออกจากระบบ', icon: LogOut, tone: 'muted', category: 'session' },
  'user.create': { label: 'สร้างผู้ใช้งาน', icon: UserPlus, tone: 'info', category: 'user' },
  'user.update': { label: 'แก้ไขผู้ใช้งาน', icon: UserCog, tone: 'info', category: 'user' },
  'user.password_reset': {
    label: 'ตั้งรหัสผ่านใหม่',
    icon: KeyRound,
    tone: 'danger',
    category: 'user',
    security: true,
  },
  'user.sessions_revoke': {
    label: 'ยกเลิก Session',
    icon: MonitorOff,
    tone: 'danger',
    category: 'user',
    security: true,
  },
  'role.update': {
    label: 'แก้ไข Role',
    icon: ShieldAlert,
    tone: 'warning',
    category: 'role',
    security: true,
  },
  'security_policy.update': {
    label: 'แก้ไข Security policy',
    icon: LockKeyhole,
    tone: 'warning',
    category: 'security_policy',
    security: true,
  },
};

const FALLBACK_META: ActionMeta = {
  label: '',
  icon: History,
  tone: 'muted',
  category: 'session',
};

function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] ?? { ...FALLBACK_META, label: action };
}

const TONE_ICON_CLASS: Record<ActionTone, string> = {
  success: 'bg-success/10 text-success',
  muted: 'bg-muted text-muted-foreground',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
};

const CATEGORY_OPTIONS: { value: 'all' | ActionCategory; label: string }[] = [
  { value: 'all', label: 'เหตุการณ์: ทั้งหมด' },
  { value: 'session', label: 'Session (เข้า/ออกระบบ)' },
  { value: 'user', label: 'ผู้ใช้งาน' },
  { value: 'role', label: 'Role และสิทธิ์' },
  { value: 'security_policy', label: 'Security policy' },
];

const RANGE_OPTIONS = [
  { value: 'all', label: 'ทั้งหมดที่โหลด' },
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วันล่าสุด' },
  { value: '30d', label: '30 วันล่าสุด' },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]['value'];

const POLICY_FIELD_LABEL: Record<string, string> = {
  sessionDurationHours: 'Session สูงสุด (ชม.)',
  idleTimeoutMinutes: 'Idle timeout (นาที)',
  maxDevicesPerUser: 'อุปกรณ์ต่อบัญชี',
  revokeSessionsOnPasswordChange: 'บังคับ logout เมื่อเปลี่ยนรหัสผ่าน',
  auditRetentionDays: 'เก็บ Audit log (วัน)',
};

const USER_FIELD_LABEL: Record<string, string> = {
  name: 'ชื่อ',
  email: 'อีเมล',
  role: 'Role',
  isActive: 'สถานะใช้งาน',
};

type ChangeMap = Record<string, { from: unknown; to: unknown }>;

function metadataRecord(log: RetailAuditLog): Record<string, unknown> {
  if (log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)) {
    return log.metadata as Record<string, unknown>;
  }
  return {};
}

function metadataChanges(log: RetailAuditLog): ChangeMap {
  const changes = metadataRecord(log).changes;
  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    return changes as ChangeMap;
  }
  return {};
}

function changeFieldLabel(log: RetailAuditLog, field: string): string {
  const labels = log.action === 'security_policy.update' ? POLICY_FIELD_LABEL : USER_FIELD_LABEL;
  return labels[field] ?? field;
}

function formatChangeValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'เปิด' : 'ปิด';
  if (value === null || value === undefined) return '—';
  return String(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const os = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Windows/.test(userAgent)
            ? 'Windows'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  if (browser && os) return `${browser} บน ${os}`;
  return browser ?? os;
}

function relativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return 'เมื่อสักครู่';
  if (diffMinutes < 60) return `${diffMinutes} นาทีที่แล้ว`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const formatted = date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (isSameDay(date, now)) return `วันนี้ · ${formatted}`;
  if (isSameDay(date, new Date(now.getTime() - 86_400_000))) return `เมื่อวาน · ${formatted}`;
  return formatted;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function targetLabel(log: RetailAuditLog): string | null {
  if (log.target?.name) return log.target.name;
  const meta = metadataRecord(log);
  if (typeof meta.email === 'string') return meta.email;
  if (typeof meta.roleName === 'string') return meta.roleName;
  return null;
}

function actionVerb(log: RetailAuditLog): { verb: string; withTarget: boolean } {
  switch (log.action) {
    case 'auth.login':
      return { verb: 'เข้าสู่ระบบ', withTarget: false };
    case 'auth.logout':
      return { verb: 'ออกจากระบบ', withTarget: false };
    case 'user.create':
      return { verb: 'สร้างผู้ใช้งาน', withTarget: true };
    case 'user.update':
      return { verb: 'แก้ไขผู้ใช้งาน', withTarget: true };
    case 'user.password_reset':
      return { verb: 'ตั้งรหัสผ่านใหม่ให้', withTarget: true };
    case 'user.sessions_revoke':
      return { verb: 'ยกเลิก session ของ', withTarget: true };
    case 'role.update':
      return { verb: 'แก้ไข role', withTarget: true };
    case 'security_policy.update':
      return { verb: 'แก้ไข security policy', withTarget: false };
    default:
      return { verb: actionMeta(log.action).label, withTarget: true };
  }
}

// สรุปการเปลี่ยนแปลงสั้น ๆ สำหรับบรรทัด meta ใต้ประโยคหลัก
function changeSummary(log: RetailAuditLog): string | null {
  const meta = metadataRecord(log);
  if (log.action === 'role.update') {
    const added = stringList(meta.added);
    const removed = stringList(meta.removed);
    const parts: string[] = [];
    if (added.length) parts.push(`เพิ่มสิทธิ์ ${added.length}`);
    if (removed.length) parts.push(`ลบสิทธิ์ ${removed.length}`);
    return parts.length ? parts.join(' · ') : null;
  }
  const changes = Object.entries(metadataChanges(log));
  if (!changes.length) return null;
  const [field, change] = changes[0];
  const first = `${changeFieldLabel(log, field)} ${formatChangeValue(change.from)} → ${formatChangeValue(change.to)}`;
  return changes.length > 1 ? `${first} · อีก ${changes.length - 1} รายการ` : first;
}

type AuditEntry = {
  key: string;
  log: RetailAuditLog;
  group: RetailAuditLog[];
};

function buildEntries(logs: RetailAuditLog[]): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const log of logs) {
    const last = entries[entries.length - 1];
    if (
      log.action === 'auth.login' &&
      last?.log.action === 'auth.login' &&
      last.log.actor?.id === log.actor?.id &&
      new Date(last.group[last.group.length - 1].createdAt).getTime() -
        new Date(log.createdAt).getTime() <=
        LOGIN_GROUP_WINDOW_MS
    ) {
      last.group.push(log);
    } else {
      entries.push({ key: log.id, log, group: [log] });
    }
  }
  return entries;
}

function buildCsv(logs: RetailAuditLog[]): string {
  const escape = (value: string | number) => {
    const str = String(value ?? '');
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows = [
    [
      'เวลา',
      'ผู้กระทำ',
      'อีเมลผู้กระทำ',
      'เหตุการณ์',
      'Action',
      'เป้าหมาย',
      'ประเภทเป้าหมาย',
      'IP',
      'อุปกรณ์',
      'Metadata',
      'Event ID',
    ],
    ...logs.map((log) => [
      new Date(log.createdAt).toLocaleString('th-TH'),
      log.actor?.name ?? 'System',
      log.actor?.email ?? '',
      actionMeta(log.action).label,
      log.action,
      targetLabel(log) ?? log.targetId ?? '',
      log.targetType,
      log.ipAddress ?? '',
      log.userAgent ?? '',
      log.metadata ? JSON.stringify(log.metadata) : '',
      log.id,
    ]),
  ];
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children}</div>
    </>
  );
}

function ChangeDetails({ log }: { log: RetailAuditLog }) {
  const meta = metadataRecord(log);
  if (log.action === 'role.update') {
    const added = stringList(meta.added);
    const removed = stringList(meta.removed);
    if (!added.length && !removed.length) return null;
    return (
      <DetailRow label="การเปลี่ยนแปลง">
        <div className="flex flex-wrap gap-1">
          {added.map((permission) => (
            <span
              key={`add-${permission}`}
              className="rounded bg-success/10 px-1.5 py-0.5 font-mono text-[11px] text-success"
            >
              + {permission}
            </span>
          ))}
          {removed.map((permission) => (
            <span
              key={`remove-${permission}`}
              className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[11px] text-destructive"
            >
              − {permission}
            </span>
          ))}
        </div>
      </DetailRow>
    );
  }
  const changes = Object.entries(metadataChanges(log));
  if (changes.length) {
    return (
      <DetailRow label="การเปลี่ยนแปลง">
        <div className="space-y-0.5">
          {changes.map(([field, change]) => (
            <div key={field}>
              {changeFieldLabel(log, field)}:{' '}
              <span className="text-muted-foreground line-through">
                {formatChangeValue(change.from)}
              </span>{' '}
              → <span className="font-medium">{formatChangeValue(change.to)}</span>
            </div>
          ))}
        </div>
      </DetailRow>
    );
  }
  if (log.action === 'user.create' && typeof meta.role === 'string') {
    return <DetailRow label="รายละเอียด">role: {meta.role}</DetailRow>;
  }
  if (log.action === 'user.sessions_revoke' && typeof meta.count === 'number') {
    return <DetailRow label="รายละเอียด">ยกเลิก {meta.count} session</DetailRow>;
  }
  return null;
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const { log, group } = entry;
  const meta = actionMeta(log.action);
  const Icon = meta.icon;
  const { verb, withTarget } = actionVerb(log);
  const target = targetLabel(log);
  const device = describeDevice(log.userAgent);
  const summary = changeSummary(log);
  const metadata = metadataRecord(log);

  const metaParts = [
    summary,
    log.actor?.email,
    log.ipAddress ? `IP ${log.ipAddress}` : null,
    device,
  ].filter(Boolean);

  const copyJson = () => {
    const payload = group.length > 1 ? group : log;
    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => toast.success('คัดลอก JSON แล้ว'))
      .catch(() => toast.error('คัดลอกไม่สำเร็จ'));
  };

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            TONE_ICON_CLASS[meta.tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="font-medium">{log.actor?.name ?? 'System'}</span>
            <span>{verb}</span>
            {withTarget && target && <span className="font-medium">{target}</span>}
            {group.length > 1 && (
              <Badge variant="secondary" className="rounded-full">
                ×{group.length} ครั้ง
              </Badge>
            )}
            {log.action === 'user.create' && typeof metadata.role === 'string' && (
              <Badge variant="info" className="rounded-full">
                role: {metadata.role}
              </Badge>
            )}
            {meta.security && (
              <Badge variant="warning" className="rounded-full">
                ความปลอดภัย
              </Badge>
            )}
          </span>
          {metaParts.length > 0 && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {metaParts.join(' · ')}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xs text-muted-foreground">{timeLabel(log.createdAt)}</span>
          <span className="block text-[11px] text-muted-foreground/70">
            {relativeTime(log.createdAt)}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'mt-1.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>
      {expanded && (
        <div className="mb-3 ml-12 mr-6 rounded-lg border bg-muted/30 p-3 text-xs">
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <DetailRow label="Action">
              <span className="font-mono">{log.action}</span>
            </DetailRow>
            {log.targetId && (
              <DetailRow label="เป้าหมาย">
                {target ? `${target} ` : ''}
                <span className="font-mono text-muted-foreground">
                  ({log.targetType}:{log.targetId})
                </span>
              </DetailRow>
            )}
            <ChangeDetails log={log} />
            {log.ipAddress && (
              <DetailRow label="IP address">
                <span className="font-mono">{log.ipAddress}</span>
              </DetailRow>
            )}
            {log.userAgent && (
              <DetailRow label="อุปกรณ์">
                <span className="font-mono text-[11px] text-muted-foreground">{log.userAgent}</span>
              </DetailRow>
            )}
            {group.length > 1 && (
              <DetailRow label="ครั้งทั้งหมด">
                <div className="space-y-0.5">
                  {group.map((item) => (
                    <div key={item.id}>
                      {timeLabel(item.createdAt)}
                      {item.ipAddress ? ` · IP ${item.ipAddress}` : ''}
                    </div>
                  ))}
                </div>
              </DetailRow>
            )}
            <DetailRow label="Event ID">
              <span className="font-mono text-muted-foreground">{log.id}</span>
            </DetailRow>
          </div>
          <Button variant="outline" size="xs" className="mt-2.5" onClick={copyJson}>
            <Copy data-icon="inline-start" /> คัดลอก JSON
          </Button>
        </div>
      )}
    </div>
  );
}

export function AuditLogPanel({ retentionDays }: { retentionDays?: number }) {
  const [logs, setLogs] = useState<RetailAuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | ActionCategory>('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [range, setRange] = useState<RangeValue>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchRetailAuditLogs({ take: PAGE_SIZE });
      setLogs(page.items);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลด Audit log ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchRetailAuditLogs({ take: PAGE_SIZE, cursor: nextCursor });
      setLogs((current) => {
        const seen = new Set(current.map((log) => log.id));
        return [...current, ...page.items.filter((log) => !seen.has(log.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดเพิ่มเติมไม่สำเร็จ');
    } finally {
      setLoadingMore(false);
    }
  };

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of logs) {
      if (log.actor) map.set(log.actor.id, log.actor.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [logs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    return logs.filter((log) => {
      if (category !== 'all' && actionMeta(log.action).category !== category) return false;
      if (actorFilter !== 'all' && (log.actor?.id ?? 'system') !== actorFilter) return false;
      if (range !== 'all') {
        const created = new Date(log.createdAt).getTime();
        const cutoff =
          range === 'today'
            ? startOfToday
            : range === '7d'
              ? now - 7 * 86_400_000
              : now - 30 * 86_400_000;
        if (created < cutoff) return false;
      }
      if (query) {
        const haystack = [
          log.actor?.name,
          log.actor?.email,
          log.action,
          actionMeta(log.action).label,
          log.ipAddress,
          log.target?.name,
          log.target?.email,
          log.targetId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [logs, search, category, actorFilter, range]);

  const stats = useMemo(() => {
    const today = logs.filter((log) => isSameDay(new Date(log.createdAt), new Date()));
    const logins = today.filter((log) => log.action === 'auth.login');
    return {
      todayCount: today.length,
      loginCount: logins.length,
      loginActors: new Set(logins.map((log) => log.actor?.id ?? 'system')).size,
      securityCount: today.filter((log) => actionMeta(log.action).security).length,
      ipCount: new Set(logs.map((log) => log.ipAddress).filter(Boolean)).size,
    };
  }, [logs]);

  const dayGroups = useMemo(() => {
    const groups: { label: string; entries: AuditEntry[] }[] = [];
    for (const entry of buildEntries(filtered)) {
      const label = dayLabel(entry.log.createdAt);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.entries.push(entry);
      else groups.push({ label, entries: [entry] });
    }
    return groups;
  }, [filtered]);

  const exportCsv = () => {
    if (!filtered.length) {
      toast.error('ไม่มีรายการให้ export');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadCsv(`audit-log-${stamp}.csv`, buildCsv(filtered));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit log
          </CardTitle>
          <CardDescription className="mt-1.5">
            กิจกรรมด้านบัญชี สิทธิ์ และ session
            {retentionDays ? ` · เก็บย้อนหลัง ${retentionDays} วัน` : ''}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download data-icon="inline-start" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} aria-label="รีเฟรช">
            <RefreshCw className={cn(loading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาชื่อ, อีเมล, IP, action…"
              className="pl-8"
            />
          </div>
          <Select
            value={category}
            onChange={(event) => setCategory(event.target.value as 'all' | ActionCategory)}
            containerClassName="w-auto"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={actorFilter}
            onChange={(event) => setActorFilter(event.target.value)}
            containerClassName="w-auto"
          >
            <option value="all">ผู้กระทำ: ทุกคน</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </Select>
          <Select
            value={range}
            onChange={(event) => setRange(event.target.value as RangeValue)}
            containerClassName="w-auto"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mb-2 grid grid-cols-2 gap-3 border-b pb-4 sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">เหตุการณ์วันนี้</div>
            <div className="text-xl font-semibold">{stats.todayCount}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">เข้าสู่ระบบวันนี้</div>
            <div className="text-xl font-semibold">
              {stats.loginCount}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                {stats.loginActors} บัญชี
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">เปลี่ยนสิทธิ์ / policy วันนี้</div>
            <div className={cn('text-xl font-semibold', stats.securityCount > 0 && 'text-warning')}>
              {stats.securityCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">IP ที่พบ</div>
            <div className="text-xl font-semibold">
              {stats.ipCount}{' '}
              <span className="text-xs font-normal text-muted-foreground">ไม่ซ้ำ</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dayGroups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? 'ยังไม่มี Audit log' : 'ไม่พบรายการที่ตรงกับตัวกรอง'}
          </div>
        ) : (
          dayGroups.map((group) => (
            <div key={group.label}>
              <div className="pb-1 pt-3 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
              <div className="divide-y">
                {group.entries.map((entry) => (
                  <AuditRow key={entry.key} entry={entry} />
                ))}
              </div>
            </div>
          ))
        )}

        {!loading && (
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <span className="text-xs text-muted-foreground">
              แสดง {filtered.length} จาก {logs.length} รายการที่โหลด
            </span>
            {nextCursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore && <Loader2 className="animate-spin" data-icon="inline-start" />}
                โหลดเพิ่มเติม
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
