import { Toaster as SonnerToaster } from 'sonner';

/**
 * Toaster กลางของแอป — mount ครั้งเดียวที่ root (main.tsx)
 * แจ้งเตือนทุกสถานะด้วย `toast` จาก 'sonner' โดยตรง:
 *   toast.success() / toast.error() / toast.warning() / toast.info()
 * เรียกได้จากที่ไหนก็ได้ (component / hook / util) โดยไม่ต้องถือ state เอง
 *
 * สีทุก variant ผูกกับ semantic token ใน index.css (success/warning/info/destructive)
 * จึง follow light/dark (.dark) อัตโนมัติ — อย่า hardcode สี Tailwind palette
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-xl !border !bg-background !text-foreground !shadow-lg !text-xs !gap-2',
          title: '!font-medium !leading-relaxed',
          description: '!text-muted-foreground',
          actionButton: '!bg-primary !text-primary-foreground',
          cancelButton: '!bg-muted !text-muted-foreground',
          closeButton: '!text-muted-foreground hover:!text-foreground',
          success: '!border-success/30 !text-success [&_[data-icon]]:!text-success',
          error: '!border-destructive/30 !text-destructive [&_[data-icon]]:!text-destructive',
          warning: '!border-warning/30 !text-warning [&_[data-icon]]:!text-warning',
          info: '!border-info/30 !text-info [&_[data-icon]]:!text-info',
        },
      }}
    />
  );
}
