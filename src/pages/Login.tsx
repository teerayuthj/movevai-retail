import { useState } from 'react';
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function LoginPage() {
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-muted/40 px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.14),transparent_42%)]" />
      <Card className="relative w-full max-w-md border-border/70 shadow-xl shadow-foreground/5">
        <CardHeader className="space-y-4 pb-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-2xl">เข้าสู่ระบบ MoveVai</CardTitle>
            <CardDescription>Retail Logistics workspace สำหรับทีมงานภายใน</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <label className="block space-y-1.5 text-sm font-medium">
              อีเมล
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                required
                className="h-10"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              รหัสผ่าน
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" size="lg" className="h-10 w-full" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
              เข้าสู่ระบบ
            </Button>
          </form>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Session และสิทธิ์การใช้งานถูกควบคุมโดย Admin
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
