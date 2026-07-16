import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ImagePreviewModal({
  title,
  src,
  onClose,
}: {
  title: string;
  src: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`ดู${title}ขนาดใหญ่`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{title}</div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/30 p-4">
          <img
            src={src}
            alt={title}
            className="max-h-[78vh] max-w-full rounded-md object-contain"
          />
        </div>
      </div>
    </div>
  );
}
