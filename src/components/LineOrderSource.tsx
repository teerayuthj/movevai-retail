import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Order } from '@/data/orderTypes';
import { cn } from '@/lib/utils';
import { MessageCircle } from 'lucide-react';

function getLineSender(order: Order) {
  const importMeta = order.metadataJson?.import;
  const isLineImport =
    order.source.startsWith('line_') || importMeta?.source?.toUpperCase().includes('LINE');

  if (!isLineImport) return null;

  const displayName = importMeta?.senderDisplayName?.trim();
  const userId = importMeta?.senderUserId?.trim();

  return {
    displayName: displayName || (userId ? `LINE ${userId.slice(0, 8)}…` : 'ไม่พบชื่อผู้ส่ง'),
    pictureUrl: importMeta?.senderPictureUrl?.trim(),
    userId,
  };
}

export function LineOrderSource({ order, className }: { order: Order; className?: string }) {
  const sender = getLineSender(order);
  if (!sender) return null;

  return (
    <div
      className={cn(
        'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-[#06c755]/10 py-0.5 pr-2 pl-0.5 text-[11px] font-medium text-[#07883d]',
        className,
      )}
      title={
        sender.userId ? `ผู้ส่งไฟล์ LINE: ${sender.displayName} (${sender.userId})` : undefined
      }
    >
      <Avatar className="h-5 w-5 border border-[#06c755]/20 bg-white">
        {sender.pictureUrl && (
          <AvatarImage src={sender.pictureUrl} alt={`รูป LINE ของ ${sender.displayName}`} />
        )}
        <AvatarFallback className="bg-[#06c755] text-white">
          <MessageCircle className="h-3 w-3" />
        </AvatarFallback>
      </Avatar>
      <span className="shrink-0 text-[#06c755]">จาก LINE:</span>
      <span className="truncate">{sender.displayName}</span>
    </div>
  );
}
