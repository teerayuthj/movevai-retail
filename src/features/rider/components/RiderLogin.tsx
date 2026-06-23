import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { loginRider, type RiderSession } from '@/lib/retailApi';

function deviceId() {
  const key = 'movevai:rider-device-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

export function RiderLogin({ onLogin }: { onLogin: (session: RiderSession) => void }) {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-background p-6 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          setError('');
          void loginRider(phone, pin, deviceId())
            .then(onLogin)
            .catch((reason: unknown) =>
              setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ'),
            )
            .finally(() => setLoading(false));
        }}
      >
        <div>
          <h1 className="text-xl font-semibold">Rider Login</h1>
          <p className="text-sm text-muted-foreground">ใช้เบอร์โทรและ PIN ที่ได้รับจากผู้ดูแล</p>
        </div>
        <Input
          inputMode="tel"
          autoComplete="tel"
          placeholder="เบอร์โทร"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <Input
          inputMode="numeric"
          autoComplete="current-password"
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </Button>
      </form>
    </main>
  );
}
