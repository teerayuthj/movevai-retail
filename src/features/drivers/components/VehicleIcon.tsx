import { Bike, Car, Truck as TruckIcon } from 'lucide-react';
import type { Driver } from '@/data/mock';

export function VehicleIcon({ v }: { v: Driver['vehicle'] }) {
  if (v === 'motorcycle') return <Bike className="h-4 w-4" />;
  if (v === 'van') return <Car className="h-4 w-4" />;
  return <TruckIcon className="h-4 w-4" />;
}
