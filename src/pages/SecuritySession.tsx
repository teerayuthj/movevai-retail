import { useCallback, useEffect, useState } from 'react';
import { Archive, Clock3, Laptop, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchRetailSecurityPolicy,
  updateRetailSecurityPolicy,
  type RetailSecurityPolicy,
} from '@/lib/retailApi';
import { AuditLogPanel } from '@/features/security/AuditLogPanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function SecuritySessionPage() {
  const [policy, setPolicy] = useState<RetailSecurityPolicy | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPolicy(await fetchRetailSecurityPolicy());
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
        auditRetentionDays: policy.auditRetentionDays,
      });
      setPolicy(updated);
      toast.success('บันทึก Security policy แล้ว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Card>
          <CardContent className="p-5">
            <Archive className="mb-3 h-5 w-5 text-primary" />
            <div className="text-sm text-muted-foreground">เก็บ Audit log</div>
            <div className="mt-1 text-2xl font-semibold">
              {policy?.auditRetentionDays ?? '—'} วัน
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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
                    max={10080}
                    value={policy.idleTimeoutMinutes}
                    onChange={(event) =>
                      setPolicy({ ...policy, idleTimeoutMinutes: Number(event.target.value) })
                    }
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    สูงสุด 10,080 นาที (7 วัน)
                  </span>
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
                <label className="space-y-1.5 text-sm font-medium">
                  เก็บ Audit log (วัน)
                  <Input
                    type="number"
                    min={90}
                    max={3650}
                    value={policy.auditRetentionDays}
                    onChange={(event) =>
                      setPolicy({ ...policy, auditRetentionDays: Number(event.target.value) })
                    }
                  />
                  <span className="block text-xs font-normal text-muted-foreground">
                    ขั้นต่ำ 90 วันตาม พ.ร.บ. คอมพิวเตอร์ — ระบบลบของเก่าให้อัตโนมัติ
                  </span>
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
      <AuditLogPanel retentionDays={policy?.auditRetentionDays} />
    </div>
  );
}
