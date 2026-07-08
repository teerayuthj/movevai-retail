import { useEffect, useState } from 'react';
import { Layers, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Order } from '@/data/orderTypes';
import {
  NOTIFICATION_TEMPLATES,
  renderNotificationMessage,
  type NotificationTemplateDrafts,
  type NotificationTemplateKey,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

const TEMPLATE_TOKENS = ['{orderCode}', '{customerName}', '{plannedDelivery}', '{trackingUrl}'];

type Props = {
  open: boolean;
  /** เทมเพลตที่ให้เปิดค้างไว้ตอนแรก (เช่นเปิดจากแผงร่างข้อความ) */
  initialTemplateKey?: NotificationTemplateKey;
  drafts: NotificationTemplateDrafts;
  /** ออเดอร์ตัวอย่างสำหรับ preview การแทนค่า token */
  sampleOrder: Order | null;
  onChangeDraft: (key: NotificationTemplateKey, value: string) => void;
  onResetDraft: (key: NotificationTemplateKey) => void;
  onClose: () => void;
};

/**
 * ศูนย์กลางแก้ไขเทมเพลตข้อความแจ้งลูกค้า — แก้ที่นี่ครั้งเดียว
 * มีผลกับ "ทุกออเดอร์" ที่ส่งด้วยเทมเพลตนั้น (บันทึกอัตโนมัติ)
 */
export function TemplateManagerDialog({
  open,
  initialTemplateKey,
  drafts,
  sampleOrder,
  onChangeDraft,
  onResetDraft,
  onClose,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<NotificationTemplateKey>(
    initialTemplateKey ?? NOTIFICATION_TEMPLATES[0].key,
  );

  useEffect(() => {
    if (open && initialTemplateKey) setSelectedKey(initialTemplateKey);
  }, [open, initialTemplateKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isCustomized = (key: NotificationTemplateKey) =>
    Object.prototype.hasOwnProperty.call(drafts, key);

  const selectedTemplate =
    NOTIFICATION_TEMPLATES.find((template) => template.key === selectedKey) ??
    NOTIFICATION_TEMPLATES[0];
  const selectedValue = drafts[selectedTemplate.key] ?? selectedTemplate.defaultMessage;
  const preview = sampleOrder
    ? renderNotificationMessage(sampleOrder, selectedTemplate.key, { templateDrafts: drafts })
        .message
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* overlay */}
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      {/* panel */}
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-background shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4.5" />
            </span>
            <div>
              <h2 className="text-base font-semibold">เทมเพลตกลาง</h2>
              <p className="text-xs text-muted-foreground">
                แก้ที่นี่ครั้งเดียว มีผลกับ{' '}
                <span className="font-medium text-foreground">ทุกออเดอร์</span>{' '}
                ที่ส่งด้วยเทมเพลตนั้น — บันทึกอัตโนมัติ
              </p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {/* รายการเทมเพลตทั้งหมด — จุด warning = แก้จากค่าเดิมแล้ว */}
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-52 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {NOTIFICATION_TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => setSelectedKey(template.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors md:w-full md:justify-between md:whitespace-normal',
                  selectedKey === template.key
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <span className="md:truncate">{template.label}</span>
                {isCustomized(template.key) && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-warning"
                    title="แก้ไขจากค่าเดิมแล้ว"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{selectedTemplate.label}</p>
                {isCustomized(selectedTemplate.key) ? (
                  <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                    แก้ไขแล้ว
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    ค่าเริ่มต้น
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onResetDraft(selectedTemplate.key)}
                disabled={!isCustomized(selectedTemplate.key)}
                className="gap-1.5"
              >
                <RotateCcw className="size-4" />
                คืนค่าเดิม
              </Button>
            </div>

            <textarea
              value={selectedValue}
              onChange={(event) => onChangeDraft(selectedTemplate.key, event.target.value)}
              rows={6}
              className="min-h-36 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
            />

            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">
                ตัวแปรที่ใช้ได้ — ระบบจะแทนด้วยข้อมูลจริงของแต่ละออเดอร์ตอนส่ง
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_TOKENS.map((token) => (
                  <code
                    key={token}
                    className="rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {token}
                  </code>
                ))}
              </div>
            </div>

            {preview && sampleOrder && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  ตัวอย่างเมื่อส่งจริง (ออเดอร์ {sampleOrder.code})
                </p>
                <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm">
                  {preview}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
