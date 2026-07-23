import type { RouteStop } from '@/features/dispatch/types';

export type RouteBuilderStop = RouteStop & {
  sourceLabel: string;
  sourceAddressId: string;
};

export type RouteBuilderJob = {
  id: string;
  pickup: RouteBuilderStop | null;
  dropoff: RouteBuilderStop | null;
};

export type RouteBuilderDispatchMode = 'scheduled' | 'immediate';

export type RouteBuilderDraft = {
  jobs: RouteBuilderJob[];
  plannedDate: string;
  plannedTime: string;
  appointmentDate: string;
  appointmentTime: string;
  driverId: string;
  messengerTitle: string;
  note: string;
  mode: RouteBuilderDispatchMode;
  acceptWithinMinutes: number;
};

export const ROUTE_BUILDER_DRAFT_STORAGE_KEY = 'movevai:route-builder-draft:v1';

export function loadRouteBuilderDraft(): Partial<RouteBuilderDraft> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ROUTE_BUILDER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RouteBuilderDraft>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRouteBuilderDraft(draft: RouteBuilderDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ROUTE_BUILDER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota errors */
  }
}

export function clearRouteBuilderDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ROUTE_BUILDER_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isRouteBuilderDraftComplete(
  draft: Partial<RouteBuilderDraft> | null,
): draft is RouteBuilderDraft {
  return Boolean(
    draft?.jobs &&
    draft.plannedDate &&
    draft.appointmentDate &&
    draft.appointmentTime &&
    typeof draft.driverId === 'string' &&
    typeof draft.messengerTitle === 'string' &&
    typeof draft.note === 'string' &&
    draft.mode &&
    typeof draft.acceptWithinMinutes === 'number',
  );
}
