import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CopyOrderNoButton } from '@/components/CopyOrderNoButton';
import type {
  DeliveryProofReviewDecision,
  DeliveryProofReviewReason,
  Order,
} from '@/data/orderTypes';
import { assessProofLocation, formatProofDistance } from '@/lib/deliveryProofReview';
import type { ConfirmDeliveryInput } from '@/state/retail/types';

const decisionLabel: Record<DeliveryProofReviewDecision, string> = {
  approved: 'ผ่าน — ยืนยันปิดงาน',
  needs_revision: 'ขอให้แก้ไขหลักฐาน',
  rejected: 'ปฏิเสธหลักฐาน',
};

const reasonLabel: Record<DeliveryProofReviewReason, string> = {
  recipient_unknown: 'ไม่ทราบหรือยืนยันผู้รับไม่ได้',
  photos_unclear: 'รูปถ่ายไม่ชัดหรือไม่ครบ',
  signature_invalid: 'ลายเซ็นไม่ถูกต้อง',
  gps_mismatch: 'GPS ไม่ตรงจุดส่ง',
  information_mismatch: 'ข้อมูลหลักฐานไม่ตรงกับงาน',
  other: 'อื่น ๆ',
};

type Props = {
  order: Order | null;
  onClose: () => void;
  onSubmit: (input: ConfirmDeliveryInput) => Promise<void>;
};

export function DeliveryProofReviewDialog({ order, onClose, onSubmit }: Props) {
  const [decision, setDecision] = useState<DeliveryProofReviewDecision>('approved');
  const [reasonCode, setReasonCode] = useState<DeliveryProofReviewReason | ''>('');
  const [note, setNote] = useState('');
  const [gpsOverride, setGpsOverride] = useState(false);
  const [gpsOverrideReason, setGpsOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const locationAssessment = useMemo(() => (order ? assessProofLocation(order) : null), [order]);
  const requiresGpsOverride = locationAssessment?.tone === 'critical';
  const reviewResetKey = order ? `${order.id}:${order.proofOfDelivery?.capturedAt ?? ''}` : '';

  useEffect(() => {
    if (!reviewResetKey) return;
    setDecision('approved');
    setReasonCode('');
    setNote('');
    setGpsOverride(false);
    setGpsOverrideReason('');
    setSubmitting(false);
    setError('');
  }, [reviewResetKey]);

  if (!order) return null;

  const valid =
    (decision === 'approved' || Boolean(reasonCode)) &&
    (!requiresGpsOverride ||
      decision !== 'approved' ||
      (gpsOverride && Boolean(gpsOverrideReason.trim())));

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        decision,
        reasonCode: reasonCode || undefined,
        note: note.trim() || undefined,
        gpsOverride: decision === 'approved' ? gpsOverride : false,
        gpsOverrideReason:
          decision === 'approved' && gpsOverride ? gpsOverrideReason.trim() : undefined,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'บันทึกผลตรวจไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border bg-background shadow-2xl sm:rounded-xl">
        <div className="flex items-start justify-between border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <ClipboardCheck className="h-4 w-4 text-primary" /> ตรวจหลักฐานส่งมอบ
            </div>
            <div className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
              {order.orderNo}
              <CopyOrderNoButton orderNo={order.orderNo} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="ปิดผลตรวจหลักฐาน"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-auto px-5 py-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium">ผลการตรวจ</span>
            <Select
              value={decision}
              onChange={(event) => setDecision(event.target.value as DeliveryProofReviewDecision)}
            >
              {Object.entries(decisionLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </label>

          {!order.proofOfDelivery?.recipient?.name && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              งานเดิมนี้ไม่มีชื่อผู้รับจริง กรุณาตรวจจากรูปและลายเซ็นก่อนตัดสินใจ
            </div>
          )}

          {locationAssessment && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                requiresGpsOverride
                  ? 'border-destructive/40 bg-destructive/5 text-destructive'
                  : 'bg-muted/30 text-muted-foreground'
              }`}
            >
              <div className="flex items-start gap-2 font-medium">
                {requiresGpsOverride ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                )}
                GPS หลักฐานห่างจากจุดส่ง {formatProofDistance(locationAssessment.distanceMeters)}
              </div>
              {requiresGpsOverride && decision === 'approved' && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-start gap-2 text-foreground">
                    <input
                      type="checkbox"
                      checked={gpsOverride}
                      onChange={(event) => setGpsOverride(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-input"
                    />
                    <span>ยืนยันอนุมัติแม้ GPS ต่างจากจุดส่ง</span>
                  </label>
                  {gpsOverride && (
                    <Input
                      value={gpsOverrideReason}
                      onChange={(event) => setGpsOverrideReason(event.target.value)}
                      placeholder="เหตุผลที่อนุมัติ GPS ต่างจุด *"
                      maxLength={1000}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {decision !== 'approved' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium">เหตุผล *</span>
              <Select
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value as DeliveryProofReviewReason)}
              >
                <option value="">เลือกเหตุผล</option>
                {Object.entries(reasonLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium">หมายเหตุ</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="รายละเอียดเพิ่มเติมสำหรับ audit หรือ Messenger"
              maxLength={1000}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button onClick={() => void submit()} disabled={!valid || submitting}>
            {submitting ? 'กำลังบันทึก...' : decisionLabel[decision]}
          </Button>
        </div>
      </div>
    </div>
  );
}
