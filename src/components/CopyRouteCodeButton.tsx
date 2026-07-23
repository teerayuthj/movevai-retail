import { CopyCodeButton } from '@/components/CopyCodeButton';
import { shortRouteCode } from '@/lib/routeCode';

type CopyRouteCodeButtonProps = {
  /** raw route code — null/undefined = ไม่มีเที่ยว → ไม่ render ปุ่ม */
  code: string | null | undefined;
  className?: string;
};

/**
 * ปุ่มคัดลอกเลขเที่ยว — คัดลอกค่าที่ผู้ใช้เห็นจริง (shortRouteCode) เพื่อเอาไป search/paste ต่อได้ตรง ๆ
 */
export function CopyRouteCodeButton({ code, className }: CopyRouteCodeButtonProps) {
  return (
    <CopyCodeButton
      value={code ? shortRouteCode(code) : null}
      label="เลขเที่ยว"
      className={className}
    />
  );
}
