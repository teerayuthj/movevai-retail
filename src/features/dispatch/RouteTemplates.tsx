import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { FreeRouteBuilderPreview } from '@/features/dispatch/components/FreeRouteBuilderPreview';
import { fetchRouteAddresses, type RouteAddress } from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';

type Props = { onOpenDispatch: (search?: string) => void };

export function RouteTemplates({ onOpenDispatch }: Props) {
  const { drivers, syncFromBackend } = useRetailStore();
  const [addresses, setAddresses] = useState<RouteAddress[]>([]);
  const [loading, setLoading] = useState(true);

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
