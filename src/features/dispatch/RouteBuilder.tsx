import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FreeRouteBuilderPreview } from '@/features/dispatch/components/FreeRouteBuilderPreview';
import { QuickCreateDialog } from '@/features/dispatch/components/QuickCreateDialog';
import type { DispatchCreationOutcome } from '@/features/dispatch/types';
import { fetchRouteAddresses, type RouteAddress } from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';

type Props = {
  locationSearch?: string;
  onOpenPlanning: (search?: string) => void;
  onOpenTracking: (search?: string) => void;
};

export function RouteBuilder({ locationSearch, onOpenPlanning, onOpenTracking }: Props) {
  const { drivers, orders, syncFromBackend } = useRetailStore();
  const [addresses, setAddresses] = useState<RouteAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  useEffect(() => {
    let active = true;

    void fetchRouteAddresses()
      .then((addressItems) => {
        if (!active) return;
        setAddresses(addressItems);
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

  // รองรับลิงก์เดิมจาก Dispatch Board: ?quick=1 เปิดฟอร์มงานด่วน
  useEffect(() => {
    const params = new URLSearchParams(locationSearch ?? '');
    if (params.get('quick') === '1') setQuickCreateOpen(true);
  }, [locationSearch]);

  const handleQuickCreated = async (outcome: DispatchCreationOutcome) => {
    await syncFromBackend();
    const focusedOrder = outcome.orderIds[0];
    if (outcome.destination === 'planning') {
      onOpenPlanning(focusedOrder ? `?order=${encodeURIComponent(focusedOrder)}` : undefined);
      return;
    }
    onOpenTracking(
      focusedOrder
        ? `?tab=awaiting_acceptance&order=${encodeURIComponent(focusedOrder)}`
        : '?tab=awaiting_acceptance',
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">สร้างเที่ยววิ่ง</h1>
          <p className="text-sm text-muted-foreground">
            จัดจุดรับ–ส่ง วันที่ เวลา และคนขับให้ครบในเที่ยวเดียว
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setQuickCreateOpen(true);
          }}
        >
          <Zap className="h-4 w-4" /> สร้างงานด่วน
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 text-sm text-muted-foreground">กำลังโหลดคลังที่อยู่…</Card>
      ) : (
        <FreeRouteBuilderPreview
          savedAddresses={addresses}
          onAddressCreated={(address) => setAddresses((current) => [...current, address])}
          onAddressDeleted={(addressId) =>
            setAddresses((current) => current.filter((address) => address.id !== addressId))
          }
          onAddressUpdated={(address) =>
            setAddresses((current) =>
              current.map((item) => (item.id === address.id ? address : item)),
            )
          }
          onAddressesReordered={(next) => setAddresses(next)}
          drivers={drivers}
          orders={orders}
          onCreated={async (result) => {
            await syncFromBackend();
            const focusedOrder = result.orderIds[0];
            onOpenTracking(
              focusedOrder
                ? `?tab=awaiting_acceptance&order=${encodeURIComponent(focusedOrder)}`
                : '?tab=awaiting_acceptance',
            );
          }}
        />
      )}

      <QuickCreateDialog
        open={quickCreateOpen}
        savedAddresses={addresses}
        drivers={drivers}
        orders={orders}
        onAddressCreated={(address) => setAddresses((current) => [...current, address])}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={handleQuickCreated}
      />
    </div>
  );
}
