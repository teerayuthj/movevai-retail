import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, X } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { maskPhone } from '@/lib/customerTracking';
import {
  channelLabel,
  getTemplateLabel,
  notificationStatusLabel,
  providerDeliveryStateLabel,
  type CustomerNotification,
  type ProviderDeliveryState,
} from '@/lib/notifications';
import { cn } from '@/lib/utils';

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const deliveryStateVariant: Record<ProviderDeliveryState, BadgeProps['variant']> = {
  accepted: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'destructive',
};

const deliveryStateIcon: Record<ProviderDeliveryState, typeof CheckCircle2> = {
  accepted: Clock,
  delivered: CheckCircle2,
  read: CheckCircle2,
  failed: AlertTriangle,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border bg-muted/50 p-3 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

type Props = {
  notification: CustomerNotification | null;
  canResend: boolean;
  onClose: () => void;
  onResend: (orderId: string) => void;
};

export function NotificationDetailDrawer({ notification, canResend, onClose, onResend }: Props) {
  useEffect(() => {
    if (!notification) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [notification, onClose]);

  if (!notification) return null;

  const provider = notification.providerResponse;
  const isFailed = notification.status === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* overlay */}
      <button
        type="button"
        aria-label="ปิด"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      {/* panel */}
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden bg-background shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <p className="text-sm text-muted-foreground">รายละเอียดการส่ง</p>
            <h2 className="text-lg font-semibold">{notification.orderCode}</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="ปิด">
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{channelLabel[notification.channel]}</Badge>
            <Badge variant={isFailed ? 'destructive' : 'success'}>
              {notificationStatusLabel[notification.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatTime(notification.sentAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="ลูกค้า">{notification.customerName}</Field>
            <Field label="เทมเพลต">{getTemplateLabel(notification.templateKey)}</Field>
            <Field label="ปลายทาง">
              {notification.channel === 'sms'
                ? maskPhone(notification.recipient)
                : notification.recipient}
            </Field>
            <Field label="ผู้ส่ง">{notification.sentBy?.name ?? '—'}</Field>
          </div>

          <Field label="ข้อความที่ส่ง">
            <div className="whitespace-pre-wrap rounded-lg border bg-background p-3 text-sm">
              {notification.message}
            </div>
          </Field>

          {provider ? (
            <>
              <div className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{provider.provider}</span>
                  <Badge variant={provider.httpStatus < 300 ? 'success' : 'destructive'}>
                    HTTP {provider.httpStatus}
                  </Badge>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">
                  {provider.endpoint}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                  <span>
                    messageId: <span className="font-mono">{provider.messageId || '—'}</span>
                  </span>
                  <span>latency: {provider.latencyMs} ms</span>
                </div>
              </div>

              {provider.errorCode && (
                <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">{provider.errorCode}</p>
                    <p className="text-destructive/90">{provider.errorMessage}</p>
                  </div>
                </div>
              )}

              <Field label="สถานะนำส่ง (delivery receipt)">
                <ul className="space-y-2">
                  {provider.statusHistory.map((event, index) => {
                    const Icon = deliveryStateIcon[event.state];
                    return (
                      <li key={index} className="flex items-start gap-2">
                        <Icon
                          className={cn(
                            'mt-0.5 size-4 shrink-0',
                            event.state === 'failed' ? 'text-destructive' : 'text-success',
                          )}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={deliveryStateVariant[event.state]}>
                              {providerDeliveryStateLabel[event.state]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatTime(event.at)}
                            </span>
                          </div>
                          {event.detail && (
                            <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Field>

              <Field label="Request payload">
                <JsonBlock value={provider.requestPayload} />
              </Field>
              <Field label="Response payload">
                <JsonBlock value={provider.responsePayload} />
              </Field>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูล provider response</p>
          )}
        </div>

        <div className="border-t p-4">
          <Button
            type="button"
            variant={isFailed ? 'default' : 'outline'}
            className="w-full gap-2"
            disabled={!canResend}
            onClick={() => onResend(notification.orderId)}
          >
            <RotateCcw className="size-4" />
            {isFailed ? 'เลือกส่งซ้ำ' : 'ส่งซ้ำ'}
          </Button>
        </div>
      </div>
    </div>
  );
}
