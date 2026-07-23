import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Waypoints, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FreeRouteBuilderPreview } from '@/features/dispatch/components/FreeRouteBuilderPreview';
import { QuickCreateDialog } from '@/features/dispatch/components/QuickCreateDialog';
import { DeliveryCalendar } from '@/features/delivery-workspace/components/DeliveryCalendar';
import type { DispatchCreationOutcome } from '@/features/dispatch/types';
import { fetchRouteAddresses, type RouteAddress } from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';

type RouteBuilderView = 'builder' | 'calendar';

type Props = {
  locationSearch?: string;
  onOpenPlanning: (search?: string) => void;
  onOpenTracking: (search?: string) => void;
};

function parseView(locationSearch?: string): RouteBuilderView {
  const params = new URLSearchParams(locationSearch ?? '');
  return params.get('view') === 'calendar' ? 'calendar' : 'builder';
}

export function RouteBuilder({ locationSearch, onOpenPlanning, onOpenTracking }: Props) {
  const { drivers, orders, syncFromBackend } = useRetailStore();
  const [addresses, setAddresses] = useState<RouteAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const initialView = useMemo(() => parseView(locationSearch), [locationSearch]);
  const [view, setView] = useState<RouteBuilderView>(initialView);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

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

  const changeView = (nextView: string) => {
    const normalized: RouteBuilderView = nextView === 'calendar' ? 'calendar' : 'builder';
    setView(normalized);
    const params = new URLSearchParams(window.location.search);
    params.set('view', normalized);
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  const handleQuickCreated = async (outcome: DispatchCreationOutcome) => {
    await syncFromBackend();
    setCalendarRefreshKey((value) => value + 1);
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
          size="action"
          variant="outline"
          onClick={() => {
            setQuickCreateOpen(true);
          }}
        >
          <Zap className="h-5 w-5" /> สร้างงานด่วน
        </Button>
      </div>

      <Tabs value={view} onValueChange={changeView}>
        <TabsList className="h-auto w-full justify-start gap-1 border-b bg-transparent p-0">
          <TabsTrigger value="builder" className="gap-2 rounded-b-none px-4 py-2.5">
            <Waypoints className="h-4 w-4" /> สร้างเที่ยว
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2 rounded-b-none px-4 py-2.5">
            <CalendarDays className="h-4 w-4" /> ภาพรวมปฏิทิน
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4">
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
                setCalendarRefreshKey((value) => value + 1);
                const focusedOrder = result.orderIds[0];
                onOpenTracking(
                  focusedOrder
                    ? `?tab=awaiting_acceptance&order=${encodeURIComponent(focusedOrder)}`
                    : '?tab=awaiting_acceptance',
                );
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <DeliveryCalendar
            drivers={drivers}
            refreshKey={calendarRefreshKey}
            calendarScope="route_builder"
            onOpenManage={(orderId) =>
              onOpenPlanning(orderId ? `?order=${encodeURIComponent(orderId)}` : undefined)
            }
            onOpenTracking={(orderId) =>
              onOpenTracking(orderId ? `?order=${encodeURIComponent(orderId)}` : undefined)
            }
          />
        </TabsContent>
      </Tabs>

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
