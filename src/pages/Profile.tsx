import { useEffect, useState } from 'react';
import { Clock3, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAdminAuth } from '@/auth/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function remainingLabel(expiresAt: string, now: number) {
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} ชม. ${rest} นาที` : `${rest} นาที`;
}

export function ProfilePage() {
  const { user, policy } = useAdminAuth();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">โปรไฟล์ของฉัน</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ข้อมูลบัญชี Role และ Session ที่กำลังใช้งาน
        </p>
      </div>
      <Card>
        <CardHeader className="items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary">
            {user.name
              .split(/\s+/)
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
          <Badge variant={user.role.code === 'admin' ? 'default' : 'secondary'}>
            {user.role.name}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex gap-3 rounded-lg border p-4">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">อีเมล</div>
              <div className="mt-0.5 text-sm font-medium">{user.email}</div>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border p-4">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Role</div>
              <div className="mt-0.5 text-sm font-medium">
                {user.role.name}
                {user.role.code === 'admin' ? ' · Full access' : ''}
              </div>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border p-4">
            <Clock3 className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Session คงเหลือ</div>
              <div className="mt-0.5 text-sm font-medium">
                {remainingLabel(user.session.expiresAt, now)}
              </div>
            </div>
          </div>
          <div className="flex gap-3 rounded-lg border p-4">
            <UserRound className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">นโยบายสูงสุด</div>
              <div className="mt-0.5 text-sm font-medium">
                {policy?.sessionDurationHours ?? '—'} ชั่วโมง
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
