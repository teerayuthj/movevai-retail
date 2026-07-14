import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { FreeRouteBuilderPreview } from '@/features/dispatch/components/FreeRouteBuilderPreview';
import type { RouteTemplate } from '@/features/dispatch/types';
import { fetchRouteTemplates } from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';

type Props = { onOpenDispatch: (search?: string) => void };

export function RouteTemplates({ onOpenDispatch }: Props) {
  const { drivers, syncFromBackend } = useRetailStore();
  const [templates, setTemplates] = useState<RouteTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void fetchRouteTemplates()
      .then((items) => {
        if (active) setTemplates(items.filter((template) => template.active));
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'โหลดคลังที่อยู่เดิมไม่สำเร็จ');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">จัดเที่ยววิ่ง</h1>
        <p className="text-sm text-muted-foreground">
          จัดจุดรับ–ส่ง วันที่ เวลา และคนขับให้ครบในเที่ยวเดียว
        </p>
      </div>

      {loading ? (
        <Card className="p-8 text-sm text-muted-foreground">กำลังโหลดคลังที่อยู่…</Card>
      ) : (
        <FreeRouteBuilderPreview
          templates={templates}
          drivers={drivers}
          onCreated={async () => {
            await syncFromBackend();
            onOpenDispatch();
          }}
        />
      )}
    </div>
  );
}
