import { useCallback, useEffect, useState } from 'react';
import { Clock3, History, Laptop, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchRetailAuditLogs,
  fetchRetailSecurityPolicy,
  updateRetailSecurityPolicy,
  type RetailAuditLog,
  type RetailSecurityPolicy,
} from '@/lib/retailApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function SecuritySessionPage() {
  const [policy, setPolicy] = useState<RetailSecurityPolicy | null>(null);
  const [logs, setLogs] = useState<RetailAuditLog[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextPolicy, nextLogs] = await Promise.all([
        fetchRetailSecurityPolicy(),
        fetchRetailAuditLogs(30),
      ]);
      setPolicy(nextPolicy);
      setLogs(nextLogs);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'โหลดการตั้งค่าความปลอดภัยไม่สำเร็จ');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!policy) return;
    setSaving(true);
    try {
      const updated = await updateRetailSecurityPolicy({
        sessionDurationHours: policy.sessionDurationHours,
        idleTimeoutMinutes: policy.idleTimeoutMinutes,
        maxDevicesPerUser: policy.maxDevicesPerUser,
        revokeSessionsOnPasswordChange: policy.revokeSessionsOnPasswordChange,
      });
      setPolicy(updated);
      toast.success('บันทึก Security policy แล้ว');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const actionLabel: Record<string, string> = {
    'auth.login': 'เข้าสู่ระบบ',
    'auth.logout': 'ออกจากระบบ',
    'user.create': 'สร้างผู้ใช้งาน',
    'user.update': 'แก้ไขผู้ใช้งาน',
    'user.password_reset': 'ตั้งรหัสผ่านใหม่',
    'user.sessions_revoke': 'ยกเลิก Session',
    'role.update': 'แก้ไข Role',
    'security_policy.update': 'แก้ไข Security policy',
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
          <ShieldCheck className="h-4 w-4" /> ตั้งค่าระบบ
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Security & Session</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          กำหนดอายุ Session และนโยบายความปลอดภัยส่วนกลาง
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <Clock3 className="mb-3 h-5 w-5 text-primary" />
            <div className="text-sm text-muted-foreground">Session สูงสุด</div>
            <div className="mt-1 text-2xl font-semibold">
              {policy?.sessionDurationHours ?? '—'} ชั่วโมง
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <LockKeyhole className="mb-3 h-5 w-5 text-primary" />
            <div className="text-sm text-muted-foreground">Idle timeout</div>
            <div className="mt-1 text-2xl font-semibold">
              {policy?.idleTimeoutMinutes ?? '—'} นาที
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Laptop className="mb-3 h-5 w-5 text-primary" />
            <div className="text-sm text-muted-foreground">อุปกรณ์ต่อบัญชี</div>
            <div className="mt-1 text-2xl font-semibold">
              {policy?.maxDevicesPerUser ?? '—'} เครื่อง
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Session policy</CardTitle>
          <CardDescription>
            เมื่อลดค่า policy ระบบจะตรวจค่าใหม่ใน request ถัดไปของทุก Session
          </CardDescription>
        </CardHeader>
        <CardContent>
          {policy ? (
            <form onSubmit={save} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5 text-sm font-medium">
                  ระยะเวลาสูงสุด (ชั่วโมง)
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    value={policy.sessionDurationHours}
                    onChange={(event) =>
                      setPolicy({ ...policy, sessionDurationHours: Number(event.target.value) })
                    }
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    สูงสุด 720 ชั่วโมง (30 วัน)
                  </span>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  ไม่มีการใช้งาน (นาที)
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={policy.idleTimeoutMinutes}
                    onChange={(event) =>
                      setPolicy({ ...policy, idleTimeoutMinutes: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  จำนวนอุปกรณ์สูงสุด
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={policy.maxDevicesPerUser}
                    onChange={(event) =>
                      setPolicy({ ...policy, maxDevicesPerUser: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPolicy({
                    ...policy,
                    revokeSessionsOnPasswordChange: !policy.revokeSessionsOnPasswordChange,
                  })
                }
                className="flex w-full items-center justify-between rounded-lg border p-4 text-left"
              >
                <div>
                  <div className="text-sm font-medium">บังคับ Logout เมื่อเปลี่ยนรหัสผ่าน</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    ยกเลิก Session เดิมทุกเครื่องหลัง Admin ตั้งรหัสผ่านใหม่
                  </div>
                </div>
                <span
                  className={`relative h-6 w-11 rounded-full transition-colors ${policy.revokeSessionsOnPasswordChange ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${policy.revokeSessionsOnPasswordChange ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </span>
              </button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}บันทึกนโยบาย
              </Button>
            </form>
          ) : (
            <Loader2 className="animate-spin text-muted-foreground" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit log
          </CardTitle>
          <CardDescription>กิจกรรมด้านบัญชี สิทธิ์ และ Session ล่าสุด</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <div className="font-medium">{actionLabel[log.action] ?? log.action}</div>
                <div className="text-xs text-muted-foreground">
                  {log.actor?.name ?? 'System'} · {log.targetType}
                </div>
              </div>
              <time className="text-xs text-muted-foreground">
                {new Date(log.createdAt).toLocaleString('th-TH')}
              </time>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">ยังไม่มี Audit log</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
