import { CopyCodeButton } from '@/components/CopyCodeButton';

type CopyOrderNoButtonProps = {
  /** null/undefined = draft ที่ยังไม่ออกเลข — ไม่ render ปุ่ม */
  orderNo: string | null | undefined;
  className?: string;
};

/** ปุ่มคัดลอกเลขออเดอร์ — thin wrapper บน CopyCodeButton */
export function CopyOrderNoButton({ orderNo, className }: CopyOrderNoButtonProps) {
  return <CopyCodeButton value={orderNo} label="เลขออเดอร์" className={className} />;
}
