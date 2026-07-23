import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarDays, RotateCcw, Waypoints, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FreeRouteBuilderPreview } from '@/features/dispatch/components/FreeRouteBuilderPreview';
import { QuickCreateDialog } from '@/features/dispatch/components/QuickCreateDialog';
import { ReturnedRouteTrips } from '@/features/dispatch/components/ReturnedRouteTrips';
import { RouteBuilderDraftSummary } from '@/features/dispatch/components/RouteBuilderDraftSummary';
import { DeliveryCalendar } from '@/features/delivery-workspace/components/DeliveryCalendar';
import type { DispatchCreationOutcome } from '@/features/dispatch/types';
import {
  buildDraftFromReturnedTrip,
  groupReturnedAdHocRouteTrips,
  type ReturnedRouteTrip,
} from '@/features/dispatch/returnedRouteTrips';
import {
  clearRouteBuilderDraft,
  isRouteBuilderDraftComplete,
  loadRouteBuilderDraft,
  saveRouteBuilderDraft,
  type RouteBuilderDraft,
} from '@/features/dispatch/routeBuilderDraft';
import { fetchRouteAddresses, type RouteAddress } from '@/lib/retailApi';
import { useRetailStore } from '@/state/retailStore';

type RouteBuilderView = 'builder' | 'draft' | 'returned' | 'calendar';

type Props = {
  locationSearch?: string;
  onOpenPlanning: (search?: string) => void;
  onOpenTracking: (search?: string) => void;
};

function parseView(locationSearch?: string): RouteBuilderView {
  const params = new URLSearchParams(locationSearch ?? '');
  const view = params.get('view');
  if (view === 'draft' || view === 'returned' || view === 'calendar') return view;
  return 'builder';
}

export function RouteBuilder({ locationSearch, onOpenPlanning, onOpenTracking }: Props) {
  const { drivers, orders, cancelOrder, syncFromBackend } = useRetailStore();
  const [addresses, setAddresses] = useState<RouteAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const initialView = useMemo(() => parseView(locationSearch), [locationSearch]);
  const [view, setView] = useState<RouteBuilderView>(initialView);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [draft, setDraft] = useState<RouteBuilderDraft | null>(() => {
    const stored = loadRouteBuilderDraft();
    return isRouteBuilderDraftComplete(stored) ? stored : null;
  });
  const [draftSeed, setDraftSeed] = useState<{ key: number; draft: RouteBuilderDraft }>();
  const [editingReturnedTrip, setEditingReturnedTrip] = useState<ReturnedRouteTrip | null>(null);
  const returnedTrips = useMemo(() => groupReturnedAdHocRouteTrips(orders), [orders]);

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
    const normalized: RouteBuilderView =
      nextView === 'draft' || nextView === 'returned' || nextView === 'calendar'
        ? nextView
        : 'builder';
    setView(normalized);
    const params = new URLSearchParams(window.location.search);
    params.set('view', normalized);
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  };

  const archiveReturnedTrip = useCallback(
    async (trip: ReturnedRouteTrip, note: string) => {
      for (const order of trip.orders) {
        await cancelOrder(order.id, {
          reason: 'other',
          note,
        });
      }
      await syncFromBackend();
    },
    [cancelOrder, syncFromBackend],
  );

  const openDraftInBuilder = useCallback((nextDraft: RouteBuilderDraft) => {
    saveRouteBuilderDraft(nextDraft);
    setDraft(nextDraft);
    setDraftSeed((current) => ({ key: (current?.key ?? 0) + 1, draft: nextDraft }));
    setView('builder');
    const params = new URLSearchParams(window.location.search);
    params.set('view', 'builder');
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}?${params.toString()}`,
    );
  }, []);

  const handleDraftChanged = useCallback((nextDraft: RouteBuilderDraft | null) => {
    setDraft(nextDraft);
  }, []);

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
          <TabsTrigger value="draft" className="gap-2 rounded-b-none px-4 py-2.5">
            <Archive className="h-4 w-4" /> ฉบับร่าง
            {draft?.jobs.length ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                1
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="returned" className="gap-2 rounded-b-none px-4 py-2.5">
            <RotateCcw className="h-4 w-4" /> ดึงกลับ
            {returnedTrips.length > 0 && (
              <Badge variant="warning" className="h-5 px-1.5 text-[10px]">
                {returnedTrips.length}
              </Badge>
            )}
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
              draftSeed={draftSeed}
              onDraftChanged={handleDraftChanged}
              onCreated={async (result) => {
                if (editingReturnedTrip) {
                  try {
                    await archiveReturnedTrip(
                      editingReturnedTrip,
                      `สร้างเที่ยวใหม่แทน ${editingReturnedTrip.routeCode ?? editingReturnedTrip.title}`,
                    );
                  } catch (archiveError) {
                    toast.error(
                      `สร้างเที่ยวใหม่แล้ว แต่ปิดงานชุดเดิมไม่สำเร็จ — ${
                        archiveError instanceof Error ? archiveError.message : String(archiveError)
                      }`,
                    );
                  }
                  setEditingReturnedTrip(null);
                }
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

        <TabsContent value="draft" className="mt-4">
          <RouteBuilderDraftSummary
            draft={draft}
            onContinue={() => {
              if (draft) openDraftInBuilder(draft);
            }}
            onDelete={() => {
              clearRouteBuilderDraft();
              setDraft(null);
              setEditingReturnedTrip(null);
              toast.success('ลบเที่ยวฉบับร่างแล้ว');
            }}
          />
        </TabsContent>

        <TabsContent value="returned" className="mt-4">
          <ReturnedRouteTrips
            trips={returnedTrips}
            onEdit={(trip) => {
              const nextDraft = buildDraftFromReturnedTrip(trip);
              setEditingReturnedTrip(trip);
              openDraftInBuilder(nextDraft);
              toast.success(`เปิด ${trip.routeCode ?? trip.title} เพื่อจัดเที่ยวใหม่แล้ว`);
            }}
            onSaveDraft={async (trip) => {
              const nextDraft = buildDraftFromReturnedTrip(trip);
              saveRouteBuilderDraft(nextDraft);
              setDraft(nextDraft);
              await archiveReturnedTrip(
                trip,
                `เก็บ ${trip.routeCode ?? trip.title} เป็นฉบับร่างใน Route Builder`,
              );
              setEditingReturnedTrip(null);
              changeView('draft');
              toast.success('เก็บเที่ยวเป็นฉบับร่างแล้ว');
            }}
            onCancel={async (trip, note) => {
              await archiveReturnedTrip(
                trip,
                note || `ยกเลิก ${trip.routeCode ?? trip.title} จากคิวดึงกลับ`,
              );
              if (editingReturnedTrip?.id === trip.id) setEditingReturnedTrip(null);
              toast.success('ยกเลิกเที่ยวและเก็บประวัติแล้ว');
            }}
          />
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
