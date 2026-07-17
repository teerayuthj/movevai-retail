import { ShieldX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function AccessDeniedPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center">
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="rounded-2xl bg-destructive/10 p-3 text-destructive">
            <ShieldX className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">ไม่มีสิทธิ์เข้าถึงหน้านี้</h1>
          <p className="text-sm text-muted-foreground">
            ติดต่อ Admin หากคุณต้องการเพิ่มสิทธิ์ใน Role ของบัญชีนี้
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
