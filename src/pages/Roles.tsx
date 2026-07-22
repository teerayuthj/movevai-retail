import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchRetailRoles,
  updateRetailRole,
  type RetailPermission,
  type RetailRole,
} from '@/lib/retailApi';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const PERMISSION_GROUPS: Array<{
  label: string;
  items: Array<[RetailPermission, string, string]>;
}> = [
  {
    label: 'ภาพรวมและรับงาน',
    items: [
      ['overview.view', 'ภาพรวม', 'ดู Dashboard และตัวชี้วัด'],
      ['script_transform.use', 'Script Transform', 'แปลงไฟล์และข้อความ'],
      ['inbox.manage', 'Intake Inbox', 'ตรวจและอนุมัติงานเข้า'],
    ],
  },
  {
    label: 'จัดส่งและติดตาม',
    items: [
      ['queue.manage', 'ศูนย์จัดส่ง · ส่งทันที', 'มอบหมายงานรายรายการ'],
      ['route_builder.manage', 'สร้างเที่ยววิ่ง', 'สร้างและแก้ไขเที่ยววิ่ง'],
      ['planning.manage', 'ศูนย์จัดส่ง · Planning', 'วางแผน Publish และดู Calendar'],
      ['delivery_tracking.view', 'ติดตามการจัดส่ง', 'ดูและจัดการสถานะงาน'],
      ['live_view.view', 'Live View', 'ดูตำแหน่ง Messenger แบบสด'],
      ['notifications.manage', 'แจ้งเตือนลูกค้า', 'จัดการข้อความแจ้งเตือน'],
    ],
  },
  {
    label: 'รายงานและข้อมูลหลัก',
    items: [
      ['delivery_report.view', 'รายงานงานส่ง', 'ดูและ Export รายงาน'],
      ['tracking_history.view', 'ประวัติการติดตาม', 'ดูประวัติเส้นทาง GPS'],
      ['postal.manage', 'ไปรษณีย์ไทย', 'จัดการคิวไปรษณีย์'],
      ['drivers.manage', 'คนขับ', 'จัดการ Messenger และการอนุมัติ'],
      ['customers.view', 'ลูกค้า', 'ดูข้อมูลและประวัติลูกค้า'],
      ['messenger.open', 'เปิดแอป Messenger', 'เปิดทางลัดไป Messenger'],
    ],
  },
];

const EDITABLE_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.items.map(([permission]) => permission),
);

export function RolesPage() {
  const [roles, setRoles] = useState<RetailRole[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<RetailPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextRoles = await fetchRetailRoles();
      setRoles(nextRoles);
      setSelectedId((currentId) => {
        const nextSelected =
          nextRoles.find((role) => role.id === currentId) ??
          nextRoles.find((role) => role.code === 'user') ??
          nextRoles[0];
        if (nextSelected) setDraft(nextSelected.permissions);
        return nextSelected?.id ?? '';
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลด Role ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  const selected = useMemo(
    () => roles.find((role) => role.id === selectedId) ?? null,
    [roles, selectedId],
  );

  const chooseRole = (role: RetailRole) => {
    setSelectedId(role.id);
    setDraft(role.permissions);
  };
  const toggle = (permission: RetailPermission) => {
    if (selected?.isProtected) return;
    setDraft((current) =>
      current.includes(permission)
        ? current.filter((item) => item !== permission)
        : [...current, permission],
    );
  };
  const selectAllPermissions = () => {
    if (selected?.isProtected) return;
    setDraft([...EDITABLE_PERMISSIONS]);
  };
  const clearAllPermissions = () => {
    if (selected?.isProtected) return;
    setDraft([]);
  };
  const setGroupPermissions = (group: (typeof PERMISSION_GROUPS)[number], enabled: boolean) => {
    if (selected?.isProtected) return;
    const permissions = group.items.map(([permission]) => permission);
    setDraft((current) =>
      enabled
        ? [...new Set([...current, ...permissions])]
        : current.filter((permission) => !permissions.includes(permission)),
    );
  };
  const save = async () => {
    if (!selected || selected.isProtected) return;
    setSaving(true);
    try {
      await updateRetailRole(selected.id, { permissions: draft });
      toast.success('บันทึกสิทธิ์ของ Role แล้ว');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึก Role ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <ShieldCheck className="h-4 w-4" /> ตั้งค่าระบบ
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Role & Permission</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          กำหนดว่าแต่ละ Role มองเห็นและใช้งานส่วนใดได้บ้าง
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>เริ่มต้นด้วย Admin และ User</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {roles.map((role) => (
              <button
                type="button"
                key={role.id}
                onClick={() => chooseRole(role)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                  selectedId === role.id ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                )}
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {role.name}
                    {role.isProtected && <LockKeyhole className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {role.userCount ?? 0} ผู้ใช้งาน
                  </div>
                </div>
                <Badge variant={role.code === 'admin' ? 'default' : 'secondary'}>{role.code}</Badge>
              </button>
            ))}
            {loading && <Loader2 className="mx-auto animate-spin text-muted-foreground" />}
          </CardContent>
        </Card>
        <div className="space-y-4">
          {selected?.isProtected && (
            <div className="flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-medium">Admin · Full access</div>
                <p className="mt-1 text-muted-foreground">
                  สิทธิ์ของ Admin ถูกป้องกันและเปิดครบทุกส่วนเสมอ
                  เพื่อป้องกันการล็อกระบบโดยไม่ตั้งใจ
                </p>
              </div>
            </div>
          )}
          {selected && !selected.isProtected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
              <span className="text-sm text-muted-foreground">
                เลือกแล้ว {draft.length} จาก {EDITABLE_PERMISSIONS.length} สิทธิ์
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={selectAllPermissions}>
                  เลือกทั้งหมด
                </Button>
                <Button type="button" variant="destructive" onClick={clearAllPermissions}>
                  ยกเลิกทั้งหมด
                </Button>
              </div>
            </div>
          )}
          {PERMISSION_GROUPS.map((group) => (
            <Card key={group.label}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
                <CardTitle className="text-base">{group.label}</CardTitle>
                {!selected?.isProtected && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setGroupPermissions(group, true)}
                    >
                      เลือกทั้งหมวด
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setGroupPermissions(group, false)}
                    >
                      ยกเลิกทั้งหมวด
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {group.items.map(([permission, label, description]) => {
                  const enabled = selected?.isProtected || draft.includes(permission);
                  return (
                    <button
                      type="button"
                      key={permission}
                      onClick={() => toggle(permission)}
                      disabled={selected?.isProtected}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                        enabled ? 'border-primary/35 bg-primary/5' : 'hover:bg-muted/60',
                        selected?.isProtected && 'cursor-default',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border',
                          enabled
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input',
                        )}
                      >
                        {enabled && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          ))}
          {!selected?.isProtected && (
            <div className="flex justify-end border-t pt-4">
              <Button size="lg" onClick={() => void save()} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}บันทึก Permission
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
