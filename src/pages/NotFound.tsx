import { Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  /** path ที่ผู้ใช้พยายามเข้าแต่ไม่ตรงกับหน้าใดเลย */
  pathname: string;
  onGoHome?: () => void;
};

export function NotFoundPage({ pathname, onGoHome }: Props) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Compass className="h-8 w-8" strokeWidth={1.75} />
      </div>
      <p className="mt-6 text-sm font-medium uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold">ไม่พบหน้านี้</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        ลิงก์ที่เปิดอาจพิมพ์ผิดหรือถูกย้ายไปแล้ว กรุณาตรวจสอบ URL อีกครั้ง
      </p>
      <code className="mt-4 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
        {pathname}
      </code>
      {onGoHome && (
        <Button onClick={onGoHome} className="mt-6 gap-2">
          <Home className="h-4 w-4" />
          กลับหน้าหลัก
        </Button>
      )}
    </div>
  );
}
