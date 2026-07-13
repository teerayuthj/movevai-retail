import { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { toDataURL } from 'qrcode';
import { CalendarClock, Copy, Download, ExternalLink, QrCode, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  buildCustomerTrackingUrl,
  getCustomerTrackingPath,
  getPlannedDelivery,
  isOrderScheduled,
} from '@/lib/customerTracking';
import { formatPlanningDateTime } from '@/lib/deliveryPlanning';
import type { Order } from '@/data/orderTypes';

type CustomerTrackingQrCardProps = {
  order: Order;
};

export function CustomerTrackingQrCard({ order }: CustomerTrackingQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  // ลิงก์สั้น /t/:trackingCode เมื่อ backend สุ่มโค้ดให้แล้ว; ออเดอร์เก่าที่ยังไม่มีโค้ด
  // fallback เป็น /track/{orderNo} (MV-ORD-...) ที่ลูกค้ารู้จัก — backend resolve ได้ทั้งคู่
  const trackingRef = useMemo(
    () => ({ id: order.orderNo ?? order.id, trackingCode: order.trackingCode }),
    [order.orderNo, order.trackingCode],
  );
  const trackingUrl = useMemo(() => buildCustomerTrackingUrl(trackingRef), [trackingRef]);
  const trackingPath = useMemo(() => getCustomerTrackingPath(trackingRef), [trackingRef]);
  const isNativeApp = Capacitor.isNativePlatform();
  const scheduled = isOrderScheduled(order);
  const plannedDelivery = getPlannedDelivery(order);

  useEffect(() => {
    let cancelled = false;

    void toDataURL(trackingUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 6,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }).then((nextQrDataUrl) => {
      if (!cancelled) setQrDataUrl(nextQrDataUrl);
    });

    return () => {
      cancelled = true;
    };
  }, [trackingUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(trackingUrl);
      setCopied(true);
      toast.success('คัดลอกลิงก์ติดตามแล้ว — ส่งให้ลูกค้าได้เลย');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('คัดลอกไม่สำเร็จ — กรุณาคัดลอกลิงก์ด้วยตนเอง');
    }
  }

  // สร้าง QR ความละเอียดสูงตอนกดจริง เพื่อให้คมพอสำหรับพิมพ์/แนบส่ง
  async function buildHiResQr() {
    return toDataURL(trackingUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 10,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  }

  async function downloadQr() {
    const dataUrl = await buildHiResQr();
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `tracking-${order.orderNo}.png`;
    link.click();
    toast.success('บันทึก QR ติดตามแล้ว');
  }

  // แชร์ผ่าน Web Share API (มือถือ): แนบรูป QR ได้ถ้า browser รองรับ ไม่งั้นแชร์ลิงก์
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  async function shareTracking() {
    const shareData: ShareData = {
      title: `ติดตามพัสดุ ${order.orderNo}`,
      text: `ติดตามสถานะการจัดส่งของคุณ (${order.orderNo})`,
      url: trackingUrl,
    };
    try {
      const dataUrl = await buildHiResQr();
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `tracking-${order.orderNo}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
        return;
      }
      await navigator.share(shareData);
    } catch {
      // ผู้ใช้ยกเลิก หรือ browser ไม่รองรับ — เงียบไว้
    }
  }

  function openTrackingPreview() {
    if (!isNativeApp) {
      window.open(trackingUrl, '_blank', 'noreferrer');
      return;
    }

    window.history.pushState({ page: 'customer_tracking' }, '', trackingPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-md border bg-background">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={`QR สำหรับติดตาม ${order.orderNo}`} className="h-22 w-22" />
          ) : (
            <QrCode className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">QR ติดตามสำหรับลูกค้า</div>
          {plannedDelivery && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              กำหนดส่ง: {formatPlanningDateTime(plannedDelivery.date, plannedDelivery.time)}
            </div>
          )}
          <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
            {trackingUrl}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={downloadQr}>
              <Download className="h-3.5 w-3.5" />
              บันทึก QR
            </Button>
            {canShare && (
              <Button type="button" size="sm" variant="outline" onClick={shareTracking}>
                <Share2 className="h-3.5 w-3.5" />
                แชร์
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={copyLink}>
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={openTrackingPreview}>
              <ExternalLink className="h-3.5 w-3.5" />
              เปิดหน้าลูกค้า
            </Button>
          </div>
        </div>
      </div>
      {!scheduled && (
        <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          ออเดอร์นี้ยังไม่ถูกจัดรอบส่ง — ลูกค้าจะเห็นเฉพาะสถานะ &quot;กำลังจัดเตรียม&quot;
          จนกว่าจะวางแผนจัดส่งใน Planning
        </div>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">
        ลิงก์ใช้โค้ดสุ่มสั้น (เดาไม่ได้จากเลขออเดอร์); production ควรเพิ่ม OTP ก่อนแสดงข้อมูล
        sensitive
      </div>
    </div>
  );
}
