import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

type ReasonOption<T extends string> = {
  value: T;
  label: string;
  leading?: ReactNode;
  description?: ReactNode;
};

type Props<R extends string, A extends string = never> = {
  open: boolean;
  title: string;
  description?: string;
  error?: string;
  reasons: ReasonOption<R>[];
  defaultReason?: R;
  reasonLabel?: string;
  noteLabel?: string;
  notePlaceholder?: string;
  actions?: {
    label: string;
    options: ReasonOption<A>[];
    defaultValue?: A;
    helpText?: (value: A) => string;
  };
  confirmLabel?: string;
  confirmVariant?: 'default' | 'destructive' | 'outline';
  onCancel: () => void;
  onConfirm: (result: { reason: R; note?: string; action?: A }) => void;
};

export function ResolutionDialog<R extends string, A extends string = never>({
  open,
  title,
  description,
  error,
  reasons,
  defaultReason,
  reasonLabel = 'เหตุผล',
  noteLabel = 'หมายเหตุ (ไม่บังคับ)',
  notePlaceholder = 'ระบุเพิ่มเติม เช่น ลูกค้าแจ้งเปลี่ยนวัน',
  actions,
  confirmLabel = 'ยืนยัน',
  confirmVariant = 'default',
  onCancel,
  onConfirm,
}: Props<R, A>) {
  const [reason, setReason] = useState<R | undefined>(defaultReason ?? reasons[0]?.value);
  const [note, setNote] = useState('');
  const [action, setAction] = useState<A | undefined>(
    actions?.defaultValue ?? actions?.options[0]?.value,
  );

  useEffect(() => {
    if (open) {
      setReason(defaultReason ?? reasons[0]?.value);
      setAction(actions?.defaultValue ?? actions?.options[0]?.value);
      setNote('');
    }
  }, [open, defaultReason, reasons, actions?.defaultValue, actions?.options]);

  if (!open) return null;

  const canSubmit = !!reason && (!actions || !!action);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิด"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
              {reasonLabel}
            </div>
            <div className="grid gap-1.5">
              {reasons.map((opt) => {
                const active = opt.value === reason;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setReason(opt.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                      active
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'hover:bg-muted/60',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                        active ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                      )}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
                    </span>
                    {opt.leading}
                    <span className="min-w-0">
                      <span className="block truncate">{opt.label}</span>
                      {opt.description && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {opt.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {actions && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                {actions.label}
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {actions.options.map((opt) => {
                  const active = opt.value === action;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAction(opt.value)}
                      className={cn(
                        'rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {actions.helpText && action && (
                <div className="mt-1.5 text-[11px] text-muted-foreground">
                  {actions.helpText(action)}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-[11px] font-medium text-muted-foreground">{noteLabel}</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={notePlaceholder}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button
            size="sm"
            variant={confirmVariant}
            disabled={!canSubmit}
            onClick={() => {
              if (!reason) return;
              if (actions && !action) return;
              onConfirm({
                reason,
                note: note.trim() || undefined,
                action,
              });
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
