import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Download, Share } from 'lucide-react';
import type { useInstallPrompt } from '../hooks/useInstallPrompt';

type InstallState = ReturnType<typeof useInstallPrompt>;

/** แบนเนอร์ "เพิ่มลงหน้าจอโฮม" — แสดงเฉพาะตอนยังไม่ติดตั้งและติดตั้งได้ */
export function InstallBanner({ install }: { install: InstallState }) {
  const [iosHintOpen, setIosHintOpen] = useState(false);

  if (install.installed || (!install.canPrompt && !install.needsIosHint)) return null;

  return (
    <div className="border-b bg-primary/5 px-3 py-2.5">
      {install.canPrompt ? (
        <button
          type="button"
          onClick={install.promptInstall}
          className="flex w-full items-center gap-2.5 text-left"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Download className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">ติดตั้งแอป MoveVai Messenger</span>
            <span className="block text-[11px] text-muted-foreground">
              เพิ่มลงหน้าจอโฮม เปิดเร็วขึ้น ใช้แบบเต็มจอ
            </span>
          </span>
        </button>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setIosHintOpen((prev) => !prev)}
            className="flex w-full items-center gap-2.5 text-left"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Share className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">เพิ่มลงหน้าจอโฮม</span>
              <span className="block text-[11px] text-muted-foreground">
                ใช้งานเหมือนแอป — แตะดูวิธีติดตั้งบน iPhone
              </span>
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                iosHintOpen && 'rotate-180',
              )}
            />
          </button>
          {iosHintOpen && (
            <ol className="mt-2 space-y-1 pl-1 text-[12px] text-muted-foreground">
              <li>
                1. แตะปุ่ม <Share className="inline h-3.5 w-3.5" /> (Share) ใน Safari
              </li>
              <li>2. เลือก “เพิ่มไปยังหน้าจอโฮม” (Add to Home Screen)</li>
              <li>3. แตะ “เพิ่ม” — จะได้ไอคอน MoveVai Messenger บนหน้าจอ</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
