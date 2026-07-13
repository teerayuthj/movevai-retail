import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type PreviewImage = {
  src: string;
  fileName: string;
  rowIndex: number;
};

// Lightbox ดูรูปต้นฉบับที่ส่งเข้ามาทาง LINE — คลิกพื้นหลังหรือปุ่ม X เพื่อปิด
export function ImagePreviewDialog({
  image,
  onClose,
}: {
  image: PreviewImage;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูปต้นฉบับจาก LINE"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{image.fileName}</div>
            <div className="text-xs text-muted-foreground">
              แถวที่ {image.rowIndex + 1} · รูปต้นฉบับจาก LINE
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="ปิดรูป"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/30 p-3">
          <img
            src={image.src}
            alt=""
            className="max-h-[78vh] max-w-full rounded-md object-contain"
          />
        </div>
      </div>
    </div>
  );
}
